# AISCENT AI Interviewer — Test Scripts (Tier 1)

Human-run QA scripts for the AISCENT Tier 1 interviewer. Each script is a self-contained scenario a tester can execute end-to-end at `/aiscent` in a browser with a microphone. Scripts are grouped by what they verify:

- **Section 2** — canonical L1..L5 rubric behavior (one script per level, one camp per level).
- **Section 3** — full 6-camp happy-path run.
- **Section 4** — cross-cutting scoring rules from the `SCORING RULES` block.
- **Section 5** — sequencing gates from `apply_sequencing_gates()` and `end_interview_early`.
- **Section 6** — session flow paths (complete / disconnect / end-button / restart).
- **Section 7** — adversarial + hard-rule guardrails.
- **Section 8** — delivery + Ascent Position rendering variants.

There are 27 scripts total. Run them in any order; each script includes the state it needs.

Source of truth: [terraform/aiscent_camps.py](aiscent_camps.py) (rubrics, probe banks, gate logic), [terraform/main.py](main.py) (session wiring, delivery), [bespokecsi-frontend/components/aiscent/](../bespokecsi-frontend/components/aiscent/) (rendering).

---

## 1. Setup + how to read this doc

### 1.1 Prereqs (once per test session)

- Docker stack up: `docker compose -f terraform/docker-compose.yml up -d` (postgres, redis, express, livekit-agent, nginx).
- Frontend running: from `bespokecsi-frontend/`, `npm run dev`.
- Browser mic permission granted for `localhost:<next-port>`.
- `/aiscent` reachable without login (public route).
- Host-side session dir exists and is writable by the container user: `ls -la terraform/aiscent_sessions/` should show `appuser` writable (see [DL-01](#dl-01--disk-write-default) if it isn't).

### 1.2 How to reset between runs

Between scripts, refresh the `/aiscent` tab (this triggers `refreshConnectionDetails` and a fresh `session_uuid`). If the agent starts behaving stale (rare, tends to happen after >5 back-to-back runs), recreate the agent container to force a clean worker pool:

```bash
docker compose -f terraform/docker-compose.yml up -d --no-deps --force-recreate livekit-agent
```

To clear session JSON output from prior runs:

```bash
rm -f terraform/aiscent_sessions/aiscent-*.json
```

### 1.3 How to observe outputs

Three simultaneous windows help during any run:

1. Agent logs (voice + tool calls + delivery):

   ```bash
   docker logs -f bespokecsi-livekit-agent 2>&1 | grep -E 'AISCENT|AISCENT_TOOLS|AISCENT_DELIVERY|AISCENT_ROUTING'
   ```

2. Session JSON directory:

   ```bash
   watch -n1 'ls -la terraform/aiscent_sessions/'
   ```

3. Browser DevTools → Network → EventStream, filter `aiscent-`. You should see two open SSE streams per session (`/api/aiscent-advance/stream`, `/api/aiscent-complete/stream`).

### 1.4 Notation used in the scripts

- **Tester says: `"..."`** — you speak this line into the mic.
- **Agent should say:** the semantics of what the agent replies (not verbatim — the model paraphrases).
- **Agent should call:** the function-tool invocation you expect to see logged as `[AISCENT_TOOLS] Function called: <name>` and (for `record_camp_score`) as `[AISCENT] recorded score for camp X: L<n> <descriptor>`.
- **Agent should NOT:** hard failure conditions.
- **Verify on screen:** UI-level checks (stepper state, Ascent Position sections, banner text).
- **Verify on disk / logs:** JSON schema checks or log-line checks.

### 1.5 Reference: JSON schema written to disk

The full per-session JSON assembled by `_finalize_and_deliver` in [main.py](main.py) and written to `terraform/aiscent_sessions/<safe_session_id>.json`:

```json
{
  "session_uuid": "aiscent-<random>-<epoch_ms>",
  "tier": "tier1",
  "started_at": "<ISO 8601 UTC>",
  "ended_at": "<ISO 8601 UTC>",
  "duration_seconds": 802,
  "end_reason": "complete_interview" | "pre_climb" | "disconnected",
  "camp_scores": {
    "A": {
      "level": 3,
      "descriptor": "Established",
      "evidence_quote": "...",
      "dimensions_covered": ["Named executive owner ...", "..."],
      "confidence": "high" | "medium" | "low",
      "notes": "",
      "recorded_at": "<ISO 8601 UTC>",
      "capped_by": "rope_line" | "floor_inconsistency"    // only when a cap fired
    },
    "I": { ... },
    "S": { ... },
    "C": { ... },
    "E": { ... },
    "N": { ... }
  },
  "sequencing_flags": [
    "base_camp_gap" | "rope_line_cap_applied" | "floor_inconsistency:<CAMP_ID>" | "structural_dependency_pattern"
  ],
  "ascent_position": {
    "summary": "2–3 sentences",
    "camp_snapshot": [
      { "camp_id": "A", "area": "Leadership", "level": "L3", "level_number": 3, "descriptor": "Established", "quote": "...", "capped_by": null }
    ],
    "what_this_means": "2–3 sentences",
    "cta": "<INDIVIDUAL_CTA or PRE_CLIMB_CTA verbatim>"
  },
  "transcript": [
    { "role": "assistant", "text": "...", "ts": "..." },
    { "role": "user", "text": "...", "ts": "..." }
  ]
}
```

### 1.6 Global "should always be true" behaviors

These apply to every script. If any of them fail during any run, it is a bug regardless of which script triggered it:

- Opening frame runs verbatim in substance: "about 12–15 minutes", "six areas of customer experience", "what currently exists today, not planned", "no right or wrong answers", ends with "ready?" — waits for acknowledgment before Camp A opens.
- Agent never mentions "camp", "L1..L5", "score", "rubric", "dimension", "tier", or internal AISCENT camp names (e.g. "Aligned Leadership"). It uses plain-language area names ("leadership involvement", "your journey map", "how you listen to customers", "customer health", "your CX team", "proactive intervention").
- The word "intelligence" is never spoken during the interview (it is allowed in the final on-screen Ascent Position narrative).
- Agent never speaks bracketed instructions, stage directions, or the strings `[FRONTEND_EVENT]`, "you will say", "stay silent".
- Every agent message contains only the agent's words to the participant — no simulated user reply appended to its own turn.
- Agent asks one question per turn; never combines two questions in one utterance.
- `advance_to_next_camp` is called ONCE per camp after `record_camp_score`, silently, before the next opening question is spoken.

---

## 2. Canonical level scripts

One canonical single-camp run per level. Each demonstrates what an answer at that level sounds like and what the agent should record. Different camp per level so the doc doubles as a rubric-language reference.

For every level script below the tester runs the opening frame and Camp A first (answer Camp A at L3 with a short generic "our COO owns CX, it changed our renewal packaging investment last year, still champion-dependent" — this gets past Camp A cleanly at L3, dispatch source `demo_branch_lock` disabled note: we now route to `aiscent_type=true`), reaches the target camp, exercises the canonical response, and disconnects immediately after `record_camp_score` for the target camp fires — that is enough to verify the score without running the rest.

### L1-01 — Novice, exercised via Camp S (Signal Intelligence)

**Purpose:** verify the agent scores Camp S at L1 when the participant describes only one or two survey instruments with nothing in between.

**Preconditions:** fresh `/aiscent` tab, opening frame + Camp A already scored at any L3+ value (see intro paragraph above).

**Tester lines (Camp S):**
1. On Camp S opening: `"We do a post-call CSAT survey and an annual NPS. That's what we've got."`
2. Wait for the agent's first probe — most likely from the S bank around "sources / connection / anchoring / between surveys". Whatever it asks, answer plainly: `"Between those surveys we don't really hear anything. Each channel keeps its own results."`
3. If the agent probes a second time (e.g. about who synthesizes across sources): `"Nobody, really. It sits with the team that ran the survey."`

**Agent should say:**
- One transition sentence into Camp S then the opening question (verbatim substance from `CAMPS['S'].opening_question`).
- One or two probes from `CAMPS['S'].probe_bank` — the "between surveys" probe is the diagnostic tell for L1.
- No coaching, no "you should also...", no correction.

**Agent should call:** `record_camp_score(camp_id="S", level=1, evidence_quote="<their words about only CSAT + NPS, nothing in between>", dimensions_covered=[<at least "Instrument portfolio" and "Signal depth">], confidence="high", notes="")` followed by `advance_to_next_camp`.

**Agent should NOT:** score L2. If the agent lands on L2, that is a scoring bug — L1's tell is that there is nothing between surveys.

**Verify on logs:**
```
[AISCENT] recorded score for camp S: L1 Novice
[AISCENT_TOOLS] Function called: advance_to_next_camp
```

**Fail conditions:**
- Score comes out L2+.
- Agent asks three or more probes before scoring.
- Agent quotes L-values or rubric text.

---

### L2-01 — Emerging, exercised via Camp I (Integrated Operations)

**Purpose:** verify the agent scores Camp I at L2 when a journey map exists but was built inside-out.

**Preconditions:** fresh tab, opening frame + Camp A already scored (any level ≥ L3, but L3 works cleanly).

**Tester lines (Camp I):**
1. On Camp I opening: `"Yes, we have a journey map. It was put together by our operations team a couple of years ago — mostly maps out our process steps end-to-end."`
2. If probed on how it was built: `"It came out of a workshop where each function walked through what they do. We didn't interview customers for it."`
3. If probed on whether other programs anchor to it: `"Not really. Our CSAT program runs separately, health tracking is another tool. The map is more of a reference doc."`

**Agent should call:** `record_camp_score(camp_id="I", level=2, evidence_quote="<their words about internal process origin>", dimensions_covered=[<at least "Research basis" and "Architecture integration">], confidence="high", notes="")` followed by `advance_to_next_camp`.

**Agent should NOT:** score L3 (that requires outside-in research) or L1 (a map does exist).

**Verify on logs:**
```
[AISCENT] recorded score for camp I: L2 Emerging
```

**Verify on disk (after later disconnect):** `sequencing_flags` should contain `base_camp_gap` because Camp I is L2 (that's checked separately in [SG-03](#sg-03--base-camp-gap-camp-i--l1l2)).

---

### L3-01 — Established, exercised via Camp C (Customer Health)

**Purpose:** verify the agent scores Camp C at L3 when a behavioral health model exists but isn't predictive.

**Preconditions:** fresh tab, opening frame + Camps A, I, S already scored at any level ≥ L2. To keep things clean and avoid the base-camp gap muddying interpretation, do A=L3, I=L3, S=L3 for this script.

**Tester lines (Camp C):**
1. On Camp C opening: `"We have a health score for every account. It combines survey sentiment with behavioral data — login frequency, feature adoption, support ticket volume."`
2. If probed on prediction horizon: `"It updates when the behavior shifts, so it flags accounts before the customer complains. But usually by then the drift has already been happening a few weeks."`
3. If probed on cross-functional data: `"Yeah, we pull from product analytics, support, and finance — we had to build data pipelines with each of them."`

**Agent should call:** `record_camp_score(camp_id="C", level=3, evidence_quote="<their words about behavioral + cross-functional pipelines>", dimensions_covered=[<at least "Model existence", "Signal types", "Model timing and prediction horizon">], confidence="high", notes="")` followed by `advance_to_next_camp`.

**Agent should NOT:** score L4 — L4 requires a *predictive* model that flags before the pattern has formed. This flags after the pattern has begun. That is L3.

**Verify on logs:**
```
[AISCENT] recorded score for camp C: L3 Established
```

---

### L4-01 — Advanced, exercised via Camp E (Experience Management)

**Purpose:** verify the agent scores Camp E at L4 when platform-routed outer loop exists with full traceability but the L5 continuous-optimization piece isn't there.

**Preconditions:** fresh tab, A/I/S/C all scored at L3+ (L3 across the board works fine). Camp E is next.

**Tester lines (Camp E):**
1. On Camp E opening: `"Our CX platform pulls signal and health data continuously into a shared dashboard. When a pattern trips a threshold, the platform routes it to the right owner automatically — CS, product, or ops."`
2. If probed on refresh cadence and latency: `"Near real-time — we see patterns forming in days, not weeks. And leadership can trace every improvement back through the platform to what changed."`
3. If probed on prediction or forward-looking capability: `"We see patterns forming quickly and can act on them — we're not predicting them before they form though. Today the loop is fast and traceable, not predictive."` (Avoid saying "on the roadmap", "we're planning to", "rolling out", or similar in-progress language on this test — that would correctly trigger the [SR-01](#sr-01--in-progress-reprobe) reprobe and muddy the L4 scoring test.)

**Agent should call:** `record_camp_score(camp_id="E", level=4, evidence_quote="<their words about near-real-time platform-routed outer loop>", dimensions_covered=[<at least "Refresh cadence", "Outer-loop work", "Attribution">], confidence="high", notes="")` followed by `advance_to_next_camp`.

**Agent should NOT:** score L5 (no continuous predictive optimization) or L3 (latency isn't "weeks").

**Verify on logs:**
```
[AISCENT] recorded score for camp E: L4 Advanced
```

---

### L5-01 — Expert, exercised via Camp N (Navigation Engine)

**Purpose:** verify the agent scores Camp N at L5 when agentic orchestration is in place — AND that the score sticks (Rope Line gate does not cap it).

**Preconditions:** fresh tab. Because the Rope Line gate caps Camp N to L2 unless A, I, S, C, E are ALL L3+, this script requires the tester to first score every prior camp at L3+. Suggested quick L3 dialogues for each:

- Camp A: use the HP-01 Camp A dialogue (L3 governance with concrete cross-functional budget shifts, documentation not yet complete).
- Camp I: `"We rebuilt our journey map two years ago from customer interviews and behavioral observation. It maps out the moments of truth from the customer's side. We reference it in planning, though our signal and health programs were each stood up before that and aren't fully anchored to it yet."` — this lands L3 (outside-in map exists, informs strategy, architecture not yet integrated).
- Camp S: use the HP-01 Camp S L3 dialogue.
- Camp C: use the L3-01 Camp C dialogue.
- Camp E: use the HP-01 Camp E L3 dialogue.

**Tester lines (Camp N):**
1. On Camp N opening: `"We've built agentic orchestration into the platform. AI agents run interventions across every journey and segment — high-confidence flags get acted on directly, without a human approving each one. The CX team sets guardrails and reviews performance at the policy level."`
2. If probed on coverage: `"Full customer base and every key journey — onboarding, adoption, renewal, expansion, and the recovery paths."`
3. If probed on inputs: `"It draws from the health model, the full signal architecture, and the journey map. All four lower layers feed it."`

**Agent should call:** `record_camp_score(camp_id="N", level=5, evidence_quote="<their words about agentic autonomous execution>", dimensions_covered=[<at least "Orchestration type", "Signal inputs connected", "Decision logic">], confidence="high", notes="")` followed by `advance_to_next_camp` and then the closing sentence + `complete_interview`.

**Verify on logs:**
```
[AISCENT] recorded score for camp N: L5 Expert
[AISCENT_TOOLS] Function called: complete_interview
```

**Verify on disk:** the resulting JSON's `camp_scores["N"]` shows `"level": 5, "descriptor": "Expert"` and does NOT contain a `capped_by` field. `sequencing_flags` does NOT contain `rope_line_cap_applied`.

**Fail conditions:**
- Camp N gets capped to L2 despite prior camps all being L3+ → `apply_sequencing_gates` bug.
- Agent scores lower than L5 despite the tester describing agentic, autonomous, cross-journey orchestration.

---

## 3. Full happy-path 6-camp run

### HP-01 — Realistic mid-range profile

**Purpose:** exercise the whole pipeline (opening frame → six camp cycles → `complete_interview` → SSE `complete` payload → Ascent Position renders → JSON written) at a mixed-maturity profile where exactly one soft flag fires.

**Target scores:** A=L3, I=L2, S=L3, C=L3, E=L3, N=L2. This triggers `base_camp_gap` (I=L2) and nothing else — no Pre-Climb (A > L1), no Rope Line cap (N is already L2 by scoring, so no cap fires), no Floor Inconsistency (max adjacent delta is 1).

**Preconditions:** fresh tab, opening frame runs.

**Tester lines:**

- **Camp A → L3 (Established):** `"Our COO owns customer experience. We have a governance council that meets monthly. Their decisions have shifted our budget priorities — we reallocated onboarding budget last year based on the council's recommendation, and product changed their roadmap in response."`
  - Probe likely on documentation/durability. Answer: `"There's a charter document that defines the council. We haven't fully documented every decision right yet, but every function has changed behavior at some point because of council decisions."`
  - Expected: `record_camp_score(camp_id="A", level=3, ...)`. (Person-dependent framing intentionally removed to keep this camp landing cleanly at L3 without triggering the score-down rule — see [SR-03](#sr-03--person-dependent-score-down) for the deliberate person-dependent variant.)

- **Camp I → L2 (Emerging):** use L2-01 script.

- **Camp S → L3 (Established):** `"We anchor our surveys to key moments — within 48 hours of onboarding completion, right after a support case closes. We've started transcript analysis on our support calls. And signal from support is starting to reach product regularly."`
  - Probe likely on shared infrastructure. Answer: `"We're on a shared analytics platform now — everything flows into it, though we're still building out which teams have direct access."`
  - Expected: `record_camp_score(camp_id="S", level=3, ...)`.

- **Camp C → L3 (Established):** use L3-01 script.

- **Camp E → L3 (Established):** `"Our CX team runs a monthly cadence — signal in, prioritization based on customer impact and health risk, action, resolution tracking. Leadership can see what we shipped and what it moved. It's a real rhythm, not ad hoc."`
  - Probe likely on latency or automation. Answer: `"It's manually assembled — someone on the CX team pulls it together for the monthly review. Latency is a few weeks."`
  - Expected: `record_camp_score(camp_id="E", level=3, ...)`.

- **Camp N → L2 (Emerging):** `"We piloted a proactive intervention program on our renewal journey — it uses health signals to trigger CS outreach before the renewal window opens. The CX team coordinates each intervention manually. We haven't scaled it to onboarding or the other journeys yet."`
  - Probe likely on coverage. Answer: `"Just renewal for now. Scaling would mean building out the routing logic for every other journey — we haven't started that."`
  - Expected: `record_camp_score(camp_id="N", level=2, ...)`.

**After Camp N score:** agent should call `advance_to_next_camp`, deliver a warm one-sentence closing ("Thanks — I'll get your read on screen now" or similar), then call `complete_interview`.

**Verify on screen:**
- Progress stepper fills all six camps.
- Ascent Position renders with all four sections:
  - Summary paragraph (2–3 sentences).
  - Camp snapshot table with six rows, in order A/I/S/C/E/N, showing L3/L2/L3/L3/L3/L2 and the correct descriptors.
  - "What this means" paragraph (2–3 sentences). Given `base_camp_gap` is set, this narrative should identify the journey map / operations layer as the primary structural gap.
  - CTA card containing `aiscent_camps.INDIVIDUAL_CTA` verbatim (starts with "This is your read.").

**Verify on disk:**
```bash
cat terraform/aiscent_sessions/aiscent-*.json | jq '.end_reason, .sequencing_flags, .camp_scores | keys'
```
Should show:
- `end_reason: "complete_interview"`
- `sequencing_flags: ["base_camp_gap"]`
- `camp_scores` keys: `["A","C","E","I","N","S"]` (alphabetical from jq).

**Verify on logs:**
```
[AISCENT_TOOLS] Function called: complete_interview
[AISCENT] Finalizing session (end_reason=complete_interview)...
[AISCENT_DELIVERY] wrote /app/aiscent_sessions/aiscent-<id>.json (<bytes> bytes)
[AISCENT] Shutting down aiscent session...
```

**Fail conditions:**
- Any camp scored wrong direction (e.g. Camp A > L3 or < L2).
- `sequencing_flags` missing `base_camp_gap` or containing anything else.
- Ascent Position renders with fewer than six snapshot rows.
- Agent skips `complete_interview` and just falls silent.

---

## 4. Scoring-rule scripts

### SR-01 — In-progress reprobe

**Purpose:** verify that when the participant describes planned or in-progress work, the agent asks the `IN_PROGRESS_PROBE`-shaped follow-up ("and today, before that is in place, how does your organization handle this?") and scores the answer to that probe rather than to the plan.

**Preconditions:** fresh tab, opening frame + Camp A already scored L3. Run this on Camp I.

**Tester lines (Camp I):**
1. `"We're rolling out a new outside-in journey map next quarter — customer interviews are underway right now, and the whole thing should be live in six months."`
2. Agent should respond with a reprobe in the substance of `"Got it — and today, before that is in place, how does your organization handle this?"`
3. `"Today we just don't have a shared map. Each team has its own view of the customer."`

**Agent should call:** `record_camp_score(camp_id="I", level=1, evidence_quote="<about no shared map today>", dimensions_covered=["Existence", ...], confidence="high", notes="")` — the score is based on the answer to the reprobe (no map exists today), NOT on the planned outside-in map.

**Fail conditions:**
- Agent scores based on the planned map (e.g. records L3 or L4 based on "customer interviews underway").
- Agent doesn't reprobe at all.
- Reprobe is phrased as a coaching suggestion ("you should focus on today") rather than a neutral question.

---

### SR-02 — Split-level score-down

**Purpose:** verify that when an answer spans two levels, the agent records the LOWER level and captures the emerging elements in `evidence_quote` or `notes`.

**Preconditions:** fresh tab, opening frame + Camp A at L3. Run this on Camp S.

**Tester lines (Camp S):**
1. `"We run post-call CSAT and quarterly NPS, and we're just standing up a transcript-analysis tool on our support calls. But the transcript tool isn't connected to anything else yet — no team outside support looks at it. And nobody synthesizes across the sources."`
2. If probed on connection: `"Right — the sources don't really talk to each other. We're aware of the gap."`

**Agent should call:** `record_camp_score(camp_id="S", level=2, evidence_quote="<something like 'transcript program exists but not connected'>", ...)`. Level 2 is Emerging — multiple instruments, disconnected. The transcript program is the emerging L3 element, but the lack of connection keeps this at L2.

**Verify:** `camp_scores.S.level == 2` and `evidence_quote` or `notes` mentions the disconnected transcript program as an emerging element.

**Fail conditions:**
- Score comes out L3 (mixed elements — should be scored down).
- `evidence_quote` doesn't reflect the split-level nature.

---

### SR-03 — Person-dependent score-down

**Purpose:** verify that when a capability works only because one specific individual runs it, the agent scores ONE level LOWER than the described performance and records `notes` containing `person_dependent`.

**Preconditions:** fresh tab, opening frame first.

**Tester lines (Camp A):**
1. On Camp A opening: `"Our Chief Customer Officer runs governance. She holds monthly council meetings, budget priorities have shifted because of her recommendations, and functions have changed behavior after her sessions. Real cross-functional decisions have been made."`
2. If probed on durability / documentation: `"Honestly, it works because she works. She built it. If she took a new role tomorrow, most of it would go with her. There's no charter, no documented decision rights — just her convening the room."`

**What the description sounds like:** L3 performance (real cross-functional decisions, budget shifts).
**What the agent should score:** L2 (Emerging) with `notes` containing `person_dependent`.

**Agent should call:** `record_camp_score(camp_id="A", level=2, evidence_quote="<their words about her running it>", dimensions_covered=[..."Structural durability"...], confidence="high", notes="person_dependent — works only because the CCO drives it, no documented structure")`.

**Fail conditions:**
- Score comes out L3 without the score-down (the participant explicitly described it as personal, not structural).
- `notes` doesn't contain `person_dependent` (or `person-dependent`, or `champion`). Note that these are the strings `apply_sequencing_gates` scans for when counting person-dependent camps toward `structural_dependency_pattern`.

---

### SR-04 — Ambiguous answer, L1 with confidence=low

**Purpose:** verify that when the agent cannot land the answer clearly at any level after one clarifying probe, it records L1 with `confidence="low"` and `notes` containing `ambiguous`.

**Preconditions:** fresh tab, opening frame + Camp A at L3. Run this on Camp E.

**Tester lines (Camp E):**
1. On Camp E opening: `"We do a bunch of stuff around that. There are dashboards. People talk. When things come up we deal with them."`
2. Agent should ask one clarifying probe (e.g. "Can you give me an example of a systemic pattern and how the team saw it?").
3. Vague response: `"Yeah, we see stuff. Different teams handle it. It kind of works itself out."`

**Agent should call:** `record_camp_score(camp_id="E", level=1, evidence_quote="<one of their vague quotes>", dimensions_covered=[], confidence="low", notes="ambiguous — warrants deeper probing")` followed by `advance_to_next_camp`.

**Fail conditions:**
- Agent probes 3+ times trying to force a landing (violates two-probe max).
- Confidence recorded as `high` or `medium`.
- Score higher than L1 despite no evidence.
- `notes` does not contain the word `ambiguous`.

---

### SR-05 — Two-probe maximum

**Purpose:** verify the agent never asks a 3rd probe in a single camp.

**Preconditions:** fresh tab, opening frame + Camp A at L3. Run this on Camp S.

**Tester lines (Camp S):**
1. On Camp S opening: `"CSAT."` (deliberately thin.)
2. On first probe (whatever it is): `"Not much else."` (still thin.)
3. On second probe: `"Yeah, that's basically it."` (still thin.)

**Agent should call:** after the second probe response, `record_camp_score(camp_id="S", level=1, confidence="medium" or "low", ...)` followed by `advance_to_next_camp`. NO third probe.

**Fail conditions:**
- Agent asks a third probe. This is a two-probe-cap violation.

---

### SR-06 — No revisit

**Purpose:** verify that once `advance_to_next_camp` has fired for a camp, the agent does NOT re-open it even when the participant tries.

**Preconditions:** fresh tab, complete Camp A cleanly at L3.

**Tester lines (after Camp A `advance_to_next_camp` fires — verify in agent logs first, then speak):**
1. Camp I opens, agent asks the journey-map question.
2. `"Wait — actually about leadership. I forgot to mention we also have a customer advisory board that meets quarterly. Can I add that to what I said before?"`

**Agent should say:** politely acknowledge, decline to reopen Camp A ("Appreciate the note — I've captured what you shared on leadership. Let me stay on your journey map for now."), and return to the Camp I question.

**Agent should NOT:** re-ask any Camp A question, call `record_camp_score(camp_id="A", ...)` a second time, or reference Camp A material other than to politely close it out.

**Fail conditions:**
- Agent goes back to Camp A.
- Two `record_camp_score` calls for camp_id A in one session (would appear as two rows in the agent logs).

---

## 5. Sequencing-gate scripts

### SG-01 — Pre-Climb (Camp A = L1)

**Purpose:** verify the Pre-Climb path: Camp A = L1 → `end_interview_early(reason="pre_climb")` → Ascent Position renders the Pre-Climb variant.

**Preconditions:** fresh tab, opening frame runs.

**Tester lines (Camp A):**
1. On Camp A opening: `"Honestly, no one owns CX at our organization. Different functions do their own thing. There's a line in our values about caring for customers but no governance."`
2. On first probe (likely: has any budget or priority ever changed because of CX governance?): `"No. Nothing like that has happened."`

**Agent should call:**
```
record_camp_score(camp_id="A", level=1, evidence_quote="<their words>", confidence="high", ...)
end_interview_early(reason="pre_climb")
```
Followed by one warm closing sentence (e.g. "Thanks for your time — your read is being prepared on screen now.") and then stop.

**Agent should NOT:** call `advance_to_next_camp` or ask a Camp I question.

**Verify on screen:**
- Ascent Position renders with headline "Pre-Climb — the foundation is not yet in place".
- NO camp snapshot table (six rows) — either the table is absent entirely (`rows.length === 0`) or contains only the Camp A row. Confirmed: `aiscent-ascent-position.tsx` only renders the section when `rows.length > 0`; since only Camp A is present, one row will appear.

  → Correction: as coded, one snapshot row for Camp A WILL render. If you strictly want no table at all in the Pre-Climb variant, that is a UI change; see fail conditions.

- CTA card text matches `aiscent_camps.PRE_CLIMB_CTA` verbatim (starts with "The governance foundation for any CX maturity work does not yet exist...").

**Verify on disk:**
```bash
jq '.end_reason, .camp_scores | keys, .sequencing_flags, .ascent_position.cta' terraform/aiscent_sessions/aiscent-*.json
```
- `end_reason: "pre_climb"`
- `camp_scores` keys: `["A"]`
- `sequencing_flags`: `[]` (Pre-Climb does not add its own flag — the code comment notes "No cap needed here — the flow already stops.")
- `ascent_position.cta` matches the exact PRE_CLIMB_CTA string.

**Verify on logs:**
```
[AISCENT_TOOLS] Function called: end_interview_early
[AISCENT] Finalizing session (end_reason=pre_climb)...
```

**Fail conditions:**
- Agent calls `advance_to_next_camp` and continues to Camp I.
- Agent scores Camp A at L2+ (the tester answers make this L1).
- Ascent Position renders with the standard `INDIVIDUAL_CTA` instead of `PRE_CLIMB_CTA`.

---

### SG-02 — Rope Line cap on Camp N

**Purpose:** verify the Rope Line gate: Camp N described at L3+ but prior camp(s) below L3 → code caps Camp N to L2 with `capped_by: "rope_line"` and appends `rope_line_cap_applied` to `sequencing_flags`.

**Preconditions:** fresh tab. This script needs at least one of A/I/S/C/E below L3.

**Tester lines (target profile A=L3, I=L2, S=L2, C=L2, E=L2, N-described-as-L4):**

- Camp A → L3 (use HP-01 Camp A script).
- Camp I → L2 (use L2-01 script).
- Camp S → L2: `"We have four different survey programs — CSAT, NPS, product satisfaction, and a quarterly relationship survey. Plus a transcript tool. Each has its own team and platform, and honestly the results don't really connect. Someone on my team compiles them monthly."`
- Camp C → L2: `"We have a health score for every account. It's mostly built from survey sentiment — CSAT and NPS. It updates after the surveys run. Threshold alerts get set manually and reviewed quarterly."`
- Camp E → L2: `"Our CX lead pulls together a monthly report from all the different signal sources — mostly by hand. Outer-loop work happens when someone escalates loudly enough. It's not very structured."`
- Camp N → tester describes L4:
  1. `"We've got full-journey orchestration across every journey and customer segment. AI identifies which signal combinations need which interventions. The CX team just sets policy and reviews performance."`
  2. If probed on lower-layer inputs: `"It draws from the health model, our signal architecture, and the journey map — all connected."`
  3. If probed on scale / speed: `"Full customer base, near-real-time for high-risk flags."`

**Agent should call:** `record_camp_score(camp_id="N", level=4, ...)` based on the described maturity. NOTE: the agent does not need to know about the Rope Line cap — it scores what the evidence warrants and the code applies the cap.

**After `complete_interview` fires,** `apply_sequencing_gates` runs during `_finalize_and_deliver` and:
- Sees `camp_scores.N.level = 4 > 2`.
- Iterates over A/I/S/C/E and finds S=L2 (< 3), fails the check.
- Caps `camp_scores.N.level = 2`, `camp_scores.N.descriptor = "Emerging"`, `camp_scores.N.capped_by = "rope_line"`.
- Appends `"rope_line_cap_applied"` to `sequencing_flags`.

**Verify on disk:**
```bash
jq '.camp_scores.N, .sequencing_flags' terraform/aiscent_sessions/aiscent-*.json
```
Expected:
```json
{
  "level": 2,
  "descriptor": "Emerging",
  "capped_by": "rope_line",
  ...
}
["base_camp_gap", "rope_line_cap_applied"]
```
(`base_camp_gap` also appears because I=L2.)

**Verify on screen:** camp snapshot table shows Camp N as "L2 Emerging" with a small "capped: rope_line" note underneath the level (see [aiscent-ascent-position.tsx](../bespokecsi-frontend/components/aiscent/aiscent-ascent-position.tsx) line ~64).

**Fail conditions:**
- `camp_scores.N.level` is still 4 → cap did not fire.
- `sequencing_flags` missing `rope_line_cap_applied`.
- Table displays "L4 Advanced" instead of the capped value.

---

### SG-03 — Base Camp gap (Camp I = L1/L2)

**Purpose:** verify that `sequencing_flags` contains `base_camp_gap` when Camp I is L1 or L2, and that the Ascent Position narrative treats it as the primary structural gap.

**Preconditions:** already covered by HP-01 (I=L2). Run HP-01 or a minimal variant where you complete all six camps and score Camp I at L2 (use L2-01 dialogue for Camp I).

**Verify on disk:**
```bash
jq '.sequencing_flags' terraform/aiscent_sessions/aiscent-*.json
```
Should include `"base_camp_gap"`.

**Verify on screen:** the "What this means" paragraph should call out the journey map / operations layer as the primary limiting factor. Exact wording is LLM-generated so it varies, but it should NOT read as though the leadership layer or the health model is the biggest gap.

**Fail conditions:**
- `base_camp_gap` missing from flags when Camp I was L1 or L2.
- Narrative names a different camp as the primary gap.

---

### SG-04 — Floor Inconsistency cap

**Purpose:** verify that when a downstream camp is described at 2+ levels higher than the camp immediately upstream in the order (A → I → S → C → E → N), the code caps the downstream camp to L2 with `capped_by: "floor_inconsistency"` and adds a `floor_inconsistency:<CAMP_ID>` flag.

**Preconditions:** fresh tab.

**Tester lines (target: A=L3, I=L3, S=L2, C-described-as-L4):**

- Camp A → L3, Camp I → L3.
- Camp S → L2 (use SG-02 Camp S script).
- Camp C → tester describes L4:
  1. `"We have a predictive health model — AI-powered. It's learned which behavioral combinations predict churn or expansion before those patterns are visible. It routes flagged accounts to intervention owners automatically. And it's flagged accounts our CS team hadn't seen as at risk."`
  2. If probed on data: `"It pulls from product usage, transaction data, and support signals. All continuously updated."`

**Agent should call:** `record_camp_score(camp_id="C", level=4, ...)` based on the described capability.

- Camp E → L3 (use HP-01 Camp E dialogue).
- Camp N → L2 (use HP-01 Camp N dialogue).

These downstream picks keep the cascade clean: after C is capped to L2, adjacent-camp deltas E vs (capped) C and N vs E are both ≤ 1, so no additional `floor_inconsistency:*` flag fires — only the intended `floor_inconsistency:C`.

**After `complete_interview` fires,** `apply_sequencing_gates` iterates `CAMP_ORDER` and finds:
- downstream `C` at L4, upstream `S` at L2 → delta = 2, cap fires.
- `camp_scores.C.level = 2`, `capped_by = "floor_inconsistency"`.
- flags gets `"floor_inconsistency:C"`.

**Verify on disk:**
```bash
jq '.camp_scores.C, .sequencing_flags' terraform/aiscent_sessions/aiscent-*.json
```
Expected:
```json
{ "level": 2, "descriptor": "Emerging", "capped_by": "floor_inconsistency", ... }
["floor_inconsistency:C", ...]
```

**Fail conditions:**
- Camp C stays at L4.
- Flag missing.
- Wrong flag string format (must be `floor_inconsistency:C` with a colon and camp id).

---

### SG-05 — Structural Dependency Pattern

**Purpose:** verify that when 3+ camps have `notes` containing `person_dependent` (or `person-dependent`, or `champion`), `sequencing_flags` gets `structural_dependency_pattern`.

**Preconditions:** fresh tab.

**Tester lines:** run a full 6-camp interview where you make three camps person-dependent. Suggested targets (choose any three):

- Camp A → describe governance that only works because one senior leader personally runs it (see SR-03 dialogue).
- Camp E → `"Our CX team is essentially one senior manager who assembles the monthly view. If she rolled off, we'd lose the rhythm — nobody else has the context or the relationships."`
- Camp N → `"The proactive intervention program runs because one CS director champions it — she gets the flags, she coordinates the response, she owns the escalation. Without her the program stops."`

For each of these three camps, expect the agent to record with `notes` including `person_dependent` (or `champion`).

**After `complete_interview` fires,** `apply_sequencing_gates` counts notes matching `person_dependent | person-dependent | champion` across all camps. With ≥ 3 matches, flags gets `structural_dependency_pattern`.

**Verify on disk:**
```bash
jq '.sequencing_flags' terraform/aiscent_sessions/aiscent-*.json
```
Should include `"structural_dependency_pattern"`.

**Verify on disk (spot check):**
```bash
jq '.camp_scores | to_entries | map({camp: .key, notes: .value.notes})' terraform/aiscent_sessions/aiscent-*.json
```
Should show `person_dependent` (or `champion`) in the `notes` of at least three camps.

**Fail conditions:**
- Fewer than 3 camps end up with matching notes even though the tester explicitly described person-dependence — the agent isn't recording the note.
- Flag missing despite ≥ 3 matching notes → `apply_sequencing_gates` bug.

---

## 6. Flow-path scripts

### FP-01 — Complete interview

Covered by [HP-01](#hp-01--realistic-mid-range-profile). Cross-reference — no separate script.

---

### FP-02 — Mid-session disconnect

**Purpose:** verify that when the participant closes the browser tab mid-session, the agent's `participant_disconnected` listener fires `_finalize_and_deliver("disconnected")` and a partial JSON is written with `end_reason: "disconnected"`.

**Preconditions:** fresh tab, opening frame runs.

**Tester steps:**
1. Complete Camp A cleanly (any L3 answer — see HP-01 Camp A dialogue).
2. Complete Camp I cleanly (any L2/L3 answer).
3. Camp C begins. Give the L3-01 Camp C first-line answer.
4. **After answering step 3 but BEFORE the agent has recorded a Camp C score**, close the browser tab entirely.

**Verify on logs:**
```
[AISCENT] participant aiscent_user_<id> disconnected mid-session — finalizing with disconnect reason
[AISCENT] Finalizing session (end_reason=disconnected)...
[AISCENT_DELIVERY] wrote /app/aiscent_sessions/aiscent-<id>.json (<bytes> bytes)
```

**Verify on disk:**
```bash
jq '.end_reason, .camp_scores | keys' terraform/aiscent_sessions/aiscent-*.json
```
- `end_reason: "disconnected"`
- `camp_scores` keys: `["A", "I"]` (Camp C not yet recorded — you closed the tab mid-answer).

**Fail conditions:**
- No JSON written (finalizer didn't run).
- `end_reason` is `complete_interview` instead of `disconnected`.
- `camp_scores` contains partial or unscored Camp C data.

**Note on visibility:** the SSE `complete` event still fires after the disconnect, but since the frontend tab is closed no client receives it. This is expected — the JSON on disk is the durable output.

---

### FP-03 — End interview button

**Purpose:** verify the "End interview" button in `AiscentSessionView` triggers the same disconnect path as FP-02.

**Preconditions:** fresh tab, opening frame + Camp A scored cleanly. Camp I in progress.

**Tester steps:**
1. On Camp I, give one answer (any content).
2. Before Camp I score fires, click the "End interview" button in the top right of the live session view.

**Expected UI behavior:** the button calls `handleEndInterview` in [aiscent-app.tsx](../bespokecsi-frontend/components/aiscent-app.tsx) which calls `room.disconnect()`. The Room emits `Disconnected`, `onDisconnected` in `AiscentApp` runs, `phase` drops back to `welcome`. The agent's `participant_disconnected` listener fires server-side.

**Verify on disk:** same as FP-02 — partial JSON with `end_reason: "disconnected"` and only Camp A in `camp_scores`.

**Fail conditions:**
- Nothing happens when the button is clicked.
- The Ascent Position renders anyway (the frontend is coded to drop back to welcome, then the SSE complete event MAY set `phase = "ascent-position"` if it arrives before unmount — that is technically acceptable behavior but the JSON is still the source of truth).
- JSON never written.

---

### FP-04 — Restart flow

**Purpose:** verify that after an Ascent Position renders, clicking "Start a new interview" refreshes the connection details and returns the user to a fully-fresh welcome pane.

**Preconditions:** just completed any script that renders the Ascent Position (HP-01 or SG-01).

**Tester steps:**
1. On the rendered Ascent Position, click "Start a new interview" at the bottom.
2. Verify the AISCENT welcome pane returns.
3. Click "Start the interview" — the interview should proceed to a fresh opening frame with a NEW `session_uuid`.

**Verify on logs:** a second `[AISCENT_ROUTING] active` block should appear, with a different `session_uuid` from the previous run.

**Verify on disk:** two JSON files now exist — one per session.

**Fail conditions:**
- Welcome pane doesn't return.
- New session reuses the previous `session_uuid` (would appear as an overwritten JSON file).
- Start button on welcome doesn't reconnect.

---

## 7. Adversarial + hard-rule scripts

### HR-01 — One-speaker-per-turn (silence trap)

**Purpose:** verify the agent does NOT answer its own question when the participant stays silent.

**Preconditions:** fresh tab, opening frame runs.

**Tester steps:**
1. On the opening frame acknowledgment prompt ("Ready?"), say `"Yes."`
2. Camp A opens. Agent asks the leadership-involvement question.
3. Stay completely silent for 15 seconds — do not move, do not click, do not speak.

**Agent should say:** nothing new during those 15s. It may eventually gently prompt with something like "Take your time — whenever you're ready" but it must NOT answer its own question with a fabricated user response.

**Agent should NOT:**
- Continue its previous message with an imagined "It's been..." or "We're seeing..." continuation.
- Produce a two-part utterance where the second part reads like the participant talking.

**Verify on logs:** the `[NETSKOPE_DUAL_UTTERANCE]` diagnostic must not fire (this diagnostic was added for Netskope but the pattern applies here too; if AISCENT hasn't backported it, the tester's ear is the check).

**Fail conditions:**
- Agent generates a message that includes both the question and a hypothetical answer.

---

### HR-02 — No meta leak

**Purpose:** verify the agent never vocalizes bracketed instructions, stage directions, or the strings `[FRONTEND_EVENT]`, `[step_entered]`, `advance_to_next_camp`, "you will say", "stay silent".

**Preconditions:** any script that runs at least 3 camps.

**Tester steps:** run [HP-01](#hp-01--realistic-mid-range-profile) or any Section 5 script through to completion. Listen actively for any leakage.

**Fail conditions:**
- Agent audibly says the word "camp".
- Agent audibly says any tool name (`record_camp_score`, `advance_to_next_camp`, `complete_interview`, `end_interview_early`).
- Agent audibly reads a bracketed instruction.
- Agent narrates "now I'm moving to the next area" or similar meta commentary about the interview's flow.

---

### HR-03 — Off-topic redirect

**Purpose:** verify the agent politely brings a tangential participant back to the current camp's question.

**Preconditions:** fresh tab, opening frame + Camp A at L3. Camp I is open.

**Tester lines (Camp I):**
1. `"Actually, before we get into that — did you see the game last night? Wild finish."`

**Agent should say:** one brief courteous redirect, e.g. "Ha, we'll save the game talk for another time — for now I'd love to hear about your customer journey map." No agreement/disagreement with the game comment, no lengthy commentary.

**Fail conditions:**
- Agent engages with the tangent for more than one sentence.
- Agent asks the participant about their sports team.
- Agent gets thrown off the script entirely.

---

### HR-04 — Clarification request

**Purpose:** verify the agent gives ONE short plain-language sentence when asked what a term means, then returns to the current question.

**Preconditions:** fresh tab, opening frame + Camp A at L3. Camp I is open.

**Tester lines (Camp I):**
1. Agent asks the Camp I question.
2. `"What do you mean by 'moments of truth'?"` (Or ask about any term the agent uses.)

**Agent should say:** one plain sentence defining the term, then re-ask or restate the Camp I question. Not a paragraph, not a definition monologue.

**Fail conditions:**
- Agent gives a multi-sentence definition.
- Agent forgets to return to the question.

---

### HR-05 — "Which AI are you?"

**Purpose:** verify the agent identifies itself as built by AISCENT and does NOT name OpenAI, GPT, Cartesia, Deepgram, LiveKit, or any other third-party vendor.

**Preconditions:** fresh tab, opening frame runs.

**Tester lines:**
1. On the opening frame acknowledgment prompt: `"Wait — which AI is this? Is this ChatGPT?"`

**Agent should say:** "I was built by the AISCENT team for this interview" (or substantively equivalent). Then continues with the interview.

**Fail conditions:**
- Any mention of OpenAI, ChatGPT, GPT-4o, Cartesia, Deepgram, LiveKit, Anthropic, Google, "large language model", or any specific vendor product name.

---

### HR-06 — Excessive-thanking guard

**Purpose:** verify the agent doesn't preface every reply with "Thank you" — the spec explicitly calls this out as a rule.

**Preconditions:** fresh tab, opening frame + Camp A at L3. Camp I begins.

**Tester steps:**
1. Answer Camp I opening question in one sentence.
2. Answer the first probe in one sentence.
3. Answer the second probe (if there is one) in one sentence.
4. Camp S begins. Answer opening question in one sentence.
5. Answer Camp S first probe in one sentence.

**Fail conditions:**
- Agent begins 3+ consecutive replies with "Thank you", "Thanks so much", or a similar acknowledgment. A brief acknowledgment once per camp is fine; every-single-reply is not.

---

### HR-07 — Two-questions-in-one-turn guard

**Purpose:** verify no agent utterance ever combines two questions.

**Preconditions:** any full-camp interview. Listen actively during every camp transition and probe.

**Fail conditions:**
- Any single agent utterance contains two question marks or two distinct interrogatives. Example bad output: "Can you tell me who owns CX, and also whether budget decisions have ever changed because of it?" — that's two questions.

---

## 8. Delivery + rendering scripts

### DL-01 — Disk write default

**Purpose:** verify that with `AISCENT_RESULTS_ENDPOINT` unset (the default), the session JSON is written to `/app/aiscent_sessions/<safe_session_uuid>.json` inside the container, which is the same path as `terraform/aiscent_sessions/<safe_session_uuid>.json` on the host via bind mount.

**Preconditions:**
```bash
# Confirm env var is empty
docker exec bespokecsi-livekit-agent printenv AISCENT_RESULTS_ENDPOINT
# Should print nothing
```

**Tester steps:** run any interview to completion (HP-01 is convenient).

**Verify on logs:**
```
[AISCENT_DELIVERY] wrote /app/aiscent_sessions/aiscent-<id>.json (<bytes> bytes)
```
Note the absence of any `[AISCENT_DELIVERY] POSTing session ...` line.

**Verify on disk:**
```bash
ls -la terraform/aiscent_sessions/
```
File should exist with owner `appuser`, non-zero size, JSON-shaped content matching the schema in [Section 1.5](#15-reference-json-schema-written-to-disk).

**Fail conditions:**
- No file written.
- File written but empty or malformed JSON.
- File written outside `terraform/aiscent_sessions/` (`_write_aiscent_disk` falls back to `Path.cwd() / "aiscent_sessions"` only if `/app/aiscent_sessions` isn't writable — that fallback should NOT trigger in a healthy deployment).

---

### DL-02 — HTTP delivery success

**Purpose:** verify that when `AISCENT_RESULTS_ENDPOINT` is set to a reachable URL, the payload is POSTed there and NO disk write happens.

**Preconditions:**
1. Stand up a simple sink on host port 9000:

   ```bash
   # Terminal A — run a tiny sink that logs the body
   python3 -c "
   from http.server import BaseHTTPRequestHandler, HTTPServer
   class H(BaseHTTPRequestHandler):
       def do_POST(self):
           n = int(self.headers.get('Content-Length', 0))
           body = self.rfile.read(n).decode('utf-8')
           print('---AISCENT PAYLOAD---'); print(body[:400]); print('---END---')
           self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
   HTTPServer(('0.0.0.0', 9000), H).serve_forever()
   "
   ```

2. Set the env var and recreate the agent container:

   ```bash
   AISCENT_RESULTS_ENDPOINT=http://host.docker.internal:9000/aiscent-drop \
     docker compose -f terraform/docker-compose.yml up -d --no-deps --force-recreate livekit-agent
   ```

3. Clear the on-disk sessions dir so you can tell if a disk write leaks: `rm -f terraform/aiscent_sessions/aiscent-*.json`.

**Tester steps:** run any interview to completion.

**Verify on logs:**
```
[AISCENT_DELIVERY] POSTing session aiscent-<id> to http://host.docker.internal:9000/aiscent-drop
[AISCENT_DELIVERY] endpoint responded status=200
```

**Verify on sink:** the sink (Terminal A) printed a payload matching the schema in [Section 1.5](#15-reference-json-schema-written-to-disk).

**Verify on disk:**
```bash
ls terraform/aiscent_sessions/
```
Directory should be empty (no `aiscent-*.json` files). This is intentional: when `AISCENT_RESULTS_ENDPOINT` is set AND the POST does not raise, `_write_aiscent_disk` is NOT called.

**Fail conditions:**
- HTTP POST not made.
- Sink receives malformed or non-JSON body.
- Disk file also written (would indicate the delivery function is running both paths).

**Cleanup:** stop the sink; recreate the agent container with the env var cleared to return to DL-01 defaults.

---

### DL-03 — HTTP failure fallback to disk

**Purpose:** verify that when `AISCENT_RESULTS_ENDPOINT` is set but the HTTP POST raises an exception (connection refused, DNS fail, timeout — NOT a 5xx status), the delivery function catches the exception and writes to disk instead.

**Important:** `_deliver_aiscent_results` only falls back on exceptions. A 500 response is treated as delivered. So to trigger the fallback, point at an unreachable host — not at a 500-returning endpoint.

**Preconditions:** set the env var to an unreachable host and recreate the agent:

```bash
AISCENT_RESULTS_ENDPOINT=http://127.0.0.1:9999/nowhere \
  docker compose -f terraform/docker-compose.yml up -d --no-deps --force-recreate livekit-agent
```

Clear `terraform/aiscent_sessions/aiscent-*.json` so the fallback file is unambiguous.

**Tester steps:** run any interview to completion.

**Verify on logs:**
```
[AISCENT_DELIVERY] POSTing session aiscent-<id> to http://127.0.0.1:9999/nowhere
[AISCENT_DELIVERY] ⚠ endpoint POST failed: <ConnectError or similar> — falling back to disk write
[AISCENT_DELIVERY] wrote /app/aiscent_sessions/aiscent-<id>.json (<bytes> bytes)
```

**Verify on disk:** `terraform/aiscent_sessions/aiscent-<id>.json` exists with the full schema.

**Fail conditions:**
- No log line about the fallback.
- No disk file written despite the HTTP failure.
- Session is lost entirely (the whole point of the fallback is durability).

**Cleanup:** clear the env var and recreate the agent to return to DL-01 defaults.

---

### DL-04 — Ascent Position standard render

**Purpose:** verify all four Ascent Position sections render correctly for a `complete_interview` run.

**Preconditions:** just completed HP-01 (or any script that reaches `complete_interview`).

**Verify on screen (headers left-to-right on the page):**

- **Header block:** small kicker "AISCENT · Ascent Position", H1 headline "Your Ascent Position", NO amber banner (only shown for disconnected runs).
- **Section 1 — Summary:** small uppercase heading "Summary", one paragraph of 2–3 sentences describing the pattern across camps. Should be plain sentences — no bullets, no camp names like "Aligned Leadership", no level numbers.
- **Section 2 — Camp snapshot:** small uppercase heading "Camp snapshot", table with 3 columns: Area / Level / What we heard. Six rows in order A/I/S/C/E/N. Level column shows "L1..L5" then descriptor next to it. Rows for any capped camp show a small "capped: rope_line" or "capped: floor_inconsistency" caption underneath the level cell.
- **Section 3 — What this means:** small uppercase heading "What this means", one paragraph of 2–3 sentences.
- **Section 4 — CTA card:** rounded card with muted background, kicker "Take this with you", body text matches `aiscent_camps.INDIVIDUAL_CTA` exactly (starts with "This is your read.").
- **Footer:** "Start a new interview" button.

**Fail conditions:**
- Any section missing.
- Camp snapshot shows fewer than 6 rows or in the wrong order.
- CTA text doesn't match `INDIVIDUAL_CTA` verbatim.

---

### DL-05 — Pre-Climb variant render

**Purpose:** verify the Ascent Position renders the Pre-Climb variant correctly.

**Preconditions:** just completed [SG-01](#sg-01--pre-climb-camp-a--l1).

**Verify on screen:**
- Kicker: "AISCENT · Ascent Position"
- Headline: **"Pre-Climb — the foundation is not yet in place"** (verbatim from [aiscent-ascent-position.tsx](../bespokecsi-frontend/components/aiscent/aiscent-ascent-position.tsx) line ~26).
- NO amber "partial read" banner (unless the run also disconnected — Pre-Climb alone shouldn't set `disconnected`).
- Summary paragraph: should read as though only the leadership layer was examined. Should not reference other camps by name.
- Camp snapshot table: contains exactly one row (Camp A, L1 Novice, with the tester's evidence quote). If the table renders empty entirely, that is acceptable but note the current code renders one row.
- What this means paragraph: should speak plainly about the governance foundation not yet being in place — do not expect a "primary structural gap" call-out here because there are no other camps to compare.
- CTA card: text matches `aiscent_camps.PRE_CLIMB_CTA` verbatim (starts with "The governance foundation for any CX maturity work does not yet exist at your organization.").

**Fail conditions:**
- Standard headline "Your Ascent Position" instead of the Pre-Climb one.
- CTA text is `INDIVIDUAL_CTA` ("This is your read.") — that is the wrong CTA for this path.
- Snapshot table renders six rows.

---

### DL-06 — Disconnected variant render

**Purpose:** verify the Ascent Position renders correctly for a disconnected run — but ONLY if the browser tab is still open when the SSE complete event arrives.

**Important caveat:** in practice, FP-02 closes the browser tab, which means no client receives the `complete` event and this UI branch never renders. To exercise DL-06, use the End Interview button ([FP-03](#fp-03--end-interview-button)) instead of closing the tab — the frontend stays on the page and can receive the SSE.

Wait — [FP-03](#fp-03--end-interview-button) also transitions `phase` back to `welcome` when the Room disconnects, but if the SSE `complete` event arrives before the state settles, `handleComplete` runs and sets `phase = 'ascent-position'` with the disconnected variant. Whether this UI renders reliably in practice depends on event timing; in the frontend as coded ([aiscent-app.tsx](../bespokecsi-frontend/components/aiscent-app.tsx) `handleComplete`), an Ascent Position render always wins over the welcome fallback because the state check inside `onDisconnected` explicitly preserves `phase === 'ascent-position'`.

**Preconditions:** run FP-03 with the tab kept open, score Camps A + I only, then click End Interview.

**Verify on screen (assuming the render race lands correctly):**
- Kicker: "AISCENT · Ascent Position"
- Headline: **"Your Ascent Position"** (NOT the Pre-Climb one).
- Amber banner directly under the headline: **"This is a partial read — the interview ended before all six areas were covered."** (verbatim from [aiscent-ascent-position.tsx](../bespokecsi-frontend/components/aiscent/aiscent-ascent-position.tsx) line ~30).
- Camp snapshot table: exactly 2 rows (Camp A, Camp I).
- What this means paragraph: should be brief and speak only to what was scored (per the LLM prompt rule for disconnected end_reason).
- CTA: matches `INDIVIDUAL_CTA` verbatim (this variant still uses the standard CTA per `_finalize_and_deliver`).

**Verify on disk:** matches the disk-side expectations in [FP-02](#fp-02--mid-session-disconnect).

**Fail conditions:**
- Banner absent.
- CTA is the Pre-Climb one.
- Snapshot renders 6 rows or 0 rows instead of 2.

**If the UI doesn't render at all (race lost):** confirm on disk that the JSON was written correctly and file this as a UI-race issue rather than a rendering bug.

---

## Quick-reference: script index

| ID     | Section                          | Purpose (one line)                                             |
| ------ | -------------------------------- | -------------------------------------------------------------- |
| L1-01  | 2. Canonical levels              | Novice via Camp S (only CSAT + NPS)                            |
| L2-01  | 2. Canonical levels              | Emerging via Camp I (inside-out journey map)                   |
| L3-01  | 2. Canonical levels              | Established via Camp C (behavioral health, not predictive)     |
| L4-01  | 2. Canonical levels              | Advanced via Camp E (near-real-time platform-routed outer)     |
| L5-01  | 2. Canonical levels              | Expert via Camp N (agentic autonomous orchestration)           |
| HP-01  | 3. Full happy-path               | Realistic mid-range 6-camp run                                 |
| SR-01  | 4. Scoring rules                 | In-progress reprobe                                            |
| SR-02  | 4. Scoring rules                 | Split-level score-down                                         |
| SR-03  | 4. Scoring rules                 | Person-dependent score-down + notes flag                       |
| SR-04  | 4. Scoring rules                 | Ambiguous → L1 confidence=low                                  |
| SR-05  | 4. Scoring rules                 | Two-probe maximum                                              |
| SR-06  | 4. Scoring rules                 | No revisit after advance                                       |
| SG-01  | 5. Sequencing gates              | Pre-Climb (Camp A = L1)                                        |
| SG-02  | 5. Sequencing gates              | Rope Line cap on Camp N                                        |
| SG-03  | 5. Sequencing gates              | Base Camp gap (Camp I = L1/L2)                                 |
| SG-04  | 5. Sequencing gates              | Floor Inconsistency cap                                        |
| SG-05  | 5. Sequencing gates              | Structural Dependency Pattern                                  |
| FP-01  | 6. Flow paths                    | Complete interview (= HP-01)                                   |
| FP-02  | 6. Flow paths                    | Mid-session disconnect                                         |
| FP-03  | 6. Flow paths                    | End Interview button                                           |
| FP-04  | 6. Flow paths                    | Restart flow                                                   |
| HR-01  | 7. Adversarial                   | One-speaker-per-turn (silence trap)                            |
| HR-02  | 7. Adversarial                   | No meta leak                                                   |
| HR-03  | 7. Adversarial                   | Off-topic redirect                                             |
| HR-04  | 7. Adversarial                   | Clarification request                                          |
| HR-05  | 7. Adversarial                   | "Which AI are you?"                                            |
| HR-06  | 7. Adversarial                   | Excessive-thanking guard                                       |
| HR-07  | 7. Adversarial                   | Two-questions-in-one-turn guard                                |
| DL-01  | 8. Delivery + rendering          | Disk write default                                             |
| DL-02  | 8. Delivery + rendering          | HTTP delivery success                                          |
| DL-03  | 8. Delivery + rendering          | HTTP failure fallback to disk                                  |
| DL-04  | 8. Delivery + rendering          | Ascent Position standard render                                |
| DL-05  | 8. Delivery + rendering          | Ascent Position Pre-Climb variant                              |
| DL-06  | 8. Delivery + rendering          | Ascent Position disconnected variant                           |
