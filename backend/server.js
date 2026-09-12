/**
 * AISCENT Backend
 * ---------------
 * A lean Express server that:
 *   1. Streams `advance` events (SSE) to the frontend as the Python agent
 *      finishes each camp of the interview.
 *   2. Streams the final `complete` event (SSE) so the frontend can flip to
 *      the Ascent Position screen once the interview is over.
 *   3. Receives the full session JSON from the Python agent at the end of
 *      the interview and forwards it to a human operator via SendGrid.
 *
 * This service is deliberately single-instance. It uses in-memory Maps to
 * hold SSE clients — there is no Redis. If you need to scale horizontally
 * later, add a Redis Pub/Sub layer or fan out via a queue.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

const SENDGRID_API_KEY = (process.env.SENDGRID_API_KEY || '').trim();
const SENDGRID_FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || 'noreply@example.com';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'AiSCENT';
const AISCENT_RESULTS_EMAIL_TO =
  process.env.AISCENT_RESULTS_EMAIL_TO || 'bespokecsi.dev@gmail.com';

const HEARTBEAT_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// SendGrid init
// ---------------------------------------------------------------------------

let sendgridEnabled = false;
if (!SENDGRID_API_KEY) {
  console.warn(
    '⚠️  SENDGRID_API_KEY is not set. Session results will be logged to stdout only.',
  );
} else if (!SENDGRID_API_KEY.startsWith('SG.')) {
  console.error(
    '❌ SENDGRID_API_KEY is set but does not start with "SG." — refusing to initialise SendGrid.',
  );
} else {
  sgMail.setApiKey(SENDGRID_API_KEY);
  sendgridEnabled = true;
  console.log('✅ SendGrid initialised');
  console.log(`   From: ${SENDGRID_FROM_NAME} <${SENDGRID_FROM_EMAIL}>`);
  console.log(`   To (results): ${AISCENT_RESULTS_EMAIL_TO}`);
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(
  cors({
    origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
    credentials: true,
  }),
);
// SSE requests need generous timeouts; the JSON body can be large enough
// (full transcript) that we bump the limit above the Express default.
app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({
    service: 'aiscent-backend',
    status: 'ok',
    sendgrid: sendgridEnabled ? 'enabled' : 'disabled',
    frontend_url: FRONTEND_URL,
    results_email_to: AISCENT_RESULTS_EMAIL_TO,
  });
});

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// ---------------------------------------------------------------------------
// SSE client registries (in-memory)
// ---------------------------------------------------------------------------

/** @type {Map<string, import('express').Response>} */
const aiscentAdvanceClients = new Map();

/** @type {Map<string, import('express').Response>} */
const aiscentCompleteClients = new Map();

function writeSseEvent(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch (err) {
    console.error('   ⚠️  SSE write failed:', err.message);
    return false;
  }
}

function registerSseClient(map, sessionUUID, req, res, label) {
  // Only one client per session per stream. Any earlier connection is closed.
  const existing = map.get(sessionUUID);
  if (existing && existing !== res) {
    try {
      existing.end();
    } catch (_e) {
      /* ignore */
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  map.set(sessionUUID, res);
  console.log(`📡 ${label} SSE opened for session ${sessionUUID}`);

  // 30-second heartbeat keeps proxies from closing the connection idly.
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_e) {
      /* ignore */
    }
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    if (map.get(sessionUUID) === res) {
      map.delete(sessionUUID);
    }
    console.log(`🔌 ${label} SSE closed for session ${sessionUUID}`);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
}

// ---------------------------------------------------------------------------
// Complete-payload buffer (in-memory, single-instance)
// ---------------------------------------------------------------------------
// If the agent posts /aiscent-complete before the frontend has a live SSE
// listener (or the SSE write fails), we stash the JSON payload here so the
// next SSE reconnect can flush it immediately. Mirrors the Redis-backed
// buffer in terraform/server.js on a Redis-less deploy.

/** @type {Map<string, { payload: string, timer: NodeJS.Timeout }>} */
const aiscentCompletePayloadBuffer = new Map();
const AISCENT_COMPLETE_BUFFER_TTL_MS = 900_000; // 15 min, matches Redis TTL

function bufferAiscentComplete(sessionUUID, payload) {
  const existing = aiscentCompletePayloadBuffer.get(sessionUUID);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    aiscentCompletePayloadBuffer.delete(sessionUUID);
    console.log(`⏰ AISCENT complete buffer expired for session ${sessionUUID}`);
  }, AISCENT_COMPLETE_BUFFER_TTL_MS);
  aiscentCompletePayloadBuffer.set(sessionUUID, { payload, timer });
  console.log(`💾 Buffered aiscent complete payload for session ${sessionUUID}`);
}

function flushBufferedAiscentComplete(sessionUUID, res) {
  const entry = aiscentCompletePayloadBuffer.get(sessionUUID);
  if (!entry) return false;
  try {
    res.write(`data: ${entry.payload}\n\n`);
    console.log(
      `📤 Flushed buffered aiscent complete payload for session ${sessionUUID}`,
    );
  } catch (err) {
    console.error(
      `❌ Failed to flush buffered aiscent complete for ${sessionUUID}:`,
      err.message,
    );
    return false;
  }
  clearTimeout(entry.timer);
  aiscentCompletePayloadBuffer.delete(sessionUUID);
  return true;
}

// ---------------------------------------------------------------------------
// AISCENT advance: SSE stream + POST
// ---------------------------------------------------------------------------

app.get('/api/aiscent-advance/stream', (req, res) => {
  const sessionUUID = String(req.query.session_uuid || '').trim();
  if (!sessionUUID) {
    return res.status(400).json({ error: 'session_uuid is required' });
  }
  registerSseClient(aiscentAdvanceClients, sessionUUID, req, res, 'advance');
});

app.post('/aiscent-advance', (req, res) => {
  const { session_uuid, camp_id } = req.body || {};
  if (!session_uuid) {
    return res.status(400).json({ error: 'session_uuid is required' });
  }
  console.log(
    `➡️  advance received for session ${session_uuid} (camp_id=${camp_id ?? '?'})`,
  );
  const client = aiscentAdvanceClients.get(session_uuid);
  if (!client) {
    console.warn(
      `⚠️  no advance listener registered for session ${session_uuid}`,
    );
    return res.status(200).json({ success: false, reason: 'no_listener' });
  }
  const delivered = writeSseEvent(client, {
    type: 'advance',
    session_uuid,
    camp_id: camp_id ?? null,
  });
  return res.status(200).json({ success: delivered });
});

// ---------------------------------------------------------------------------
// AISCENT complete: SSE stream + POST
// ---------------------------------------------------------------------------

app.get('/api/aiscent-complete/stream', (req, res) => {
  const sessionUUID = String(req.query.session_uuid || '').trim();
  if (!sessionUUID) {
    return res.status(400).json({ error: 'session_uuid is required' });
  }
  registerSseClient(aiscentCompleteClients, sessionUUID, req, res, 'complete');
  // If the agent already posted the completion payload before this SSE
  // reconnect took over the listener slot, flush it now so the frontend
  // still sees the Ascent Position screen.
  flushBufferedAiscentComplete(sessionUUID, res);
});

app.post('/aiscent-complete', (req, res) => {
  const { session_uuid, ascent_position, end_reason } = req.body || {};
  if (!session_uuid) {
    return res.status(400).json({ error: 'session_uuid is required' });
  }
  console.log(
    `✅ complete received for session ${session_uuid} (end_reason=${end_reason ?? '?'})`,
  );

  const payload = JSON.stringify({
    type: 'complete',
    session_uuid,
    ascent_position: ascent_position ?? null,
    end_reason: end_reason ?? null,
  });

  const client = aiscentCompleteClients.get(session_uuid);
  if (!client) {
    console.warn(
      `⚠️  no complete listener registered for session ${session_uuid} — buffering`,
    );
    bufferAiscentComplete(session_uuid, payload);
    return res.status(200).json({ success: false, reason: 'buffered' });
  }

  let delivered = false;
  try {
    client.write(`data: ${payload}\n\n`);
    delivered = true;
  } catch (err) {
    console.error('   ⚠️  SSE write failed:', err.message);
  }

  if (!delivered) {
    bufferAiscentComplete(session_uuid, payload);
    return res.status(200).json({ success: false, reason: 'buffered' });
  }

  return res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// AISCENT session results — email via SendGrid
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCampScoresTable(campScores) {
  const entries = Object.entries(campScores || {});
  if (entries.length === 0) {
    return '<p><em>No camp scores recorded.</em></p>';
  }
  const rows = entries
    .map(([campId, data]) => {
      const level = data && data.level != null ? `L${data.level}` : '—';
      const descriptor = escapeHtml(data?.descriptor || '');
      const evidence = escapeHtml(data?.evidence_quote || '');
      const confidence = escapeHtml(data?.confidence || '');
      const notes = escapeHtml(data?.notes || '');
      return `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;font-weight:600;">${escapeHtml(campId)}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${level}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${descriptor}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${confidence}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${evidence}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${notes}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Camp</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Level</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Descriptor</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Confidence</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Evidence</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderResultsHtml(payload) {
  const sessionUuid = escapeHtml(payload.session_uuid || 'unknown');
  const endReason = escapeHtml(payload.end_reason || 'unknown');
  const duration = payload.duration_seconds ?? '—';
  const summary = escapeHtml(payload.ascent_position?.summary || '');
  const whatThisMeans = escapeHtml(
    payload.ascent_position?.what_this_means || '',
  );
  const cta = escapeHtml(payload.ascent_position?.cta || '');
  const flags = (payload.sequencing_flags || []).map(escapeHtml).join(', ');
  const campTable = renderCampScoresTable(payload.camp_scores);

  return `<!doctype html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5;">
  <h2 style="margin:0 0 8px 0;">AiSCENT session complete</h2>
  <p style="margin:0 0 16px 0;color:#555;">
    <strong>Session:</strong> ${sessionUuid}<br/>
    <strong>End reason:</strong> ${endReason}<br/>
    <strong>Duration:</strong> ${duration} seconds<br/>
    <strong>Sequencing flags:</strong> ${flags || 'none'}
  </p>

  <h3 style="margin:24px 0 8px 0;">Camp scores</h3>
  ${campTable}

  <h3 style="margin:24px 0 8px 0;">Ascent Position — summary</h3>
  <p style="margin:0 0 12px 0;">${summary || '<em>(none)</em>'}</p>

  <h3 style="margin:16px 0 8px 0;">What this means</h3>
  <p style="margin:0 0 12px 0;">${whatThisMeans || '<em>(none)</em>'}</p>

  ${cta ? `<h3 style="margin:16px 0 8px 0;">CTA</h3><p style="margin:0 0 12px 0;">${cta}</p>` : ''}

  <p style="margin:24px 0 0 0;color:#777;font-size:12px;">
    The full session JSON is attached as <code>session-${sessionUuid}.json</code>.
  </p>
</body>
</html>`;
}

app.post('/aiscent-session', async (req, res) => {
  const payload = req.body || {};
  const sessionUUID =
    String(payload.session_uuid || 'unknown').trim() || 'unknown';
  const endReason = String(payload.end_reason || 'unknown');
  console.log(
    `📬 session results received for ${sessionUUID} (end_reason=${endReason})`,
  );

  const bodyJson = JSON.stringify(payload, null, 2);
  const html = renderResultsHtml(payload);

  if (!sendgridEnabled) {
    console.log('   (SendGrid disabled — dumping payload to stdout)');
    console.log(bodyJson);
    return res.status(200).json({
      success: false,
      reason: 'sendgrid_disabled',
      logged: true,
    });
  }

  const msg = {
    to: AISCENT_RESULTS_EMAIL_TO,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME,
    },
    subject: `AiSCENT session ${sessionUUID} — ${endReason}`,
    html,
    text:
      `AiSCENT session ${sessionUUID} (end_reason=${endReason}).\n\n` +
      'The full JSON is attached.',
    attachments: [
      {
        content: Buffer.from(bodyJson, 'utf-8').toString('base64'),
        filename: `session-${sessionUUID}.json`,
        type: 'application/json',
        disposition: 'attachment',
      },
    ],
  };

  try {
    await sgMail.send(msg);
    console.log(`   ✉️  emailed session ${sessionUUID} → ${AISCENT_RESULTS_EMAIL_TO}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('   ❌ SendGrid send failed:', err.message);
    if (err.response?.body) {
      console.error('   response body:', JSON.stringify(err.response.body));
    }
    return res.status(502).json({
      success: false,
      error: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 AiSCENT backend listening on port ${PORT}`);
  console.log(`   Allowed frontend origin: ${FRONTEND_URL}`);
});
