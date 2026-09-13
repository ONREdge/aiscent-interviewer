from __future__ import annotations

print("\n" + "=" * 80)
print("🚀 AISCENT AGENT MODULE LOADING...")
print("=" * 80)

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

print("[IMPORT] Standard libraries imported")

import aiohttp
import httpx
from dotenv import load_dotenv

print("[IMPORT] Third-party libraries imported (aiohttp, httpx)")

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    ConversationItemAddedEvent,
    FunctionToolsExecutedEvent,
    JobContext,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    llm,
)
from livekit.plugins import cartesia, deepgram, openai, silero

print("[IMPORT] LiveKit libraries imported")

import aiscent_camps

print("[IMPORT] AISCENT camp spec module imported")

_AISCENT_NARRATIVE_LLM = openai.LLM(model="gpt-4o", temperature=0.3)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    force=True,
)
logger = logging.getLogger(__name__)

print("[SETUP] Logging configured")

load_dotenv()
print("[SETUP] Environment variables loaded from .env")
print(f"[SETUP] LIVEKIT_URL: {os.getenv('LIVEKIT_URL', 'NOT SET')}")
print(f"[SETUP] LIVEKIT_API_KEY: {'SET' if os.getenv('LIVEKIT_API_KEY') else 'NOT SET'}")
print(f"[SETUP] API_BASE_URL: {os.getenv('API_BASE_URL', 'NOT SET')}")
print(f"[SETUP] AISCENT_RESULTS_ENDPOINT: {os.getenv('AISCENT_RESULTS_ENDPOINT', 'NOT SET')}")
print("=" * 80 + "\n")


# ============================================================================
# AISCENT INTERVIEWER AGENT (Tier 1)
# ============================================================================

AISCENT_INSTRUCTIONS = aiscent_camps.build_system_prompt()


class AiscentInterviewer(Agent):
    def __init__(self) -> None:
        print("[AISCENT_AGENT] Initializing AiscentInterviewer...")

        super().__init__(
            instructions=AISCENT_INSTRUCTIONS,
            vad=silero.VAD.load(),
            stt=deepgram.STT(model="nova-3", language="en"),
            llm=openai.LLM(model="gpt-4o"),
            tts=cartesia.TTS(
                model="sonic-2",
                voice="79a125e8-cd45-4c13-8a67-188112f4dd22",
            ),
        )
        print("[AISCENT_AGENT] ✓ AiscentInterviewer fully initialized")

    @function_tool()
    async def record_camp_score(
        self,
        context: RunContext,
        camp_id: str,
        level: int,
        evidence_quote: str,
        dimensions_covered: list[str],
        confidence: str,
        notes: str = "",
    ) -> dict:
        """
        Record the maturity level for one of the six camps.

        Call this silently as soon as you have enough evidence to score the
        current camp. After this returns, call advance_to_next_camp() unless
        the returned status indicates the interview should end (e.g. pre_climb).

        Arguments:
          camp_id: one of "A", "I", "S", "C", "E", "N"
          level: integer 1-5 based on the camp's rubric
          evidence_quote: short quote in the participant's own words
          dimensions_covered: list of dimension names from the LISTEN FOR list
          confidence: one of "high", "medium", "low"
          notes: optional short internal notes (e.g. "person_dependent", "ambiguous")

        Do NOT mention this tool or its arguments in your spoken text.
        """
        print(
            f"[AISCENT_TOOL] record_camp_score camp_id={camp_id} level={level} "
            f"confidence={confidence} dims={dimensions_covered} notes={notes!r}"
        )
        return {
            "status": "scored",
            "camp_id": camp_id,
            "level": level,
            "evidence_quote": evidence_quote,
            "dimensions_covered": dimensions_covered,
            "confidence": confidence,
            "notes": notes,
        }

    @function_tool()
    async def advance_to_next_camp(
        self,
        context: RunContext,
    ) -> dict:
        """
        Advance the participant's on-screen progress stepper to the next camp.

        Call this silently right after record_camp_score returns successfully,
        and BEFORE you verbally transition into the next camp's opening question.
        Do NOT mention this tool in your spoken text.
        """
        print("[AISCENT_TOOL] advance_to_next_camp() called by LLM")
        return {"status": "advancing", "message": "Advancing to next camp"}

    @function_tool()
    async def end_interview_early(
        self,
        context: RunContext,
        reason: str,
    ) -> dict:
        """
        End the interview before all camps are covered.

        Currently used only for the Pre-Climb path: when Camp A is scored L1,
        call this with reason="pre_climb" instead of advance_to_next_camp().
        After calling this, speak one warm closing sentence and stop.

        Do NOT mention this tool in your spoken text.
        """
        print(f"[AISCENT_TOOL] end_interview_early(reason={reason!r}) called by LLM")
        return {"status": "ended_early", "reason": reason}

    @function_tool()
    async def complete_interview(
        self,
        context: RunContext,
    ) -> dict:
        """
        Mark the AISCENT interview as fully complete after all six camps have
        been scored. Call this silently after your final spoken closing sentence
        (thanking them and telling them the Ascent Position is being prepared).

        Do NOT mention this tool in your spoken text.
        """
        print("[AISCENT_TOOL] complete_interview() called by LLM")
        return {"status": "complete", "message": "AISCENT interview complete"}


# ============================================================================
# ROOM HELPERS
# ============================================================================


def _iter_remote_participants(room: rtc.Room):
    participants = getattr(room, "remote_participants", None)
    if isinstance(participants, dict):
        return participants.values()
    if participants:
        return participants
    return []


# ============================================================================
# ENTRYPOINT
# ============================================================================


async def entrypoint(ctx: JobContext):
    print("\n" + "=" * 80)
    print("[ENTRYPOINT] Starting AISCENT LiveKit agent entrypoint...")
    print("=" * 80)

    print("[ENTRYPOINT] Step 1: Connecting to room...")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    print("[ENTRYPOINT] ✓ Connected to room successfully")

    my_room = ctx.room
    print(f"[ENTRYPOINT] Room name: {my_room.name}")

    # ------------------------------------------------------------------
    # Detect the AISCENT participant. We accept either the identity prefix
    # (aiscent_user_<uuid>) or JWT metadata with aiscent_type=true. This is
    # the only participant shape this worker serves.
    # ------------------------------------------------------------------
    _aiscent_detected = False
    _aiscent_session_uuid: Optional[str] = None
    _dispatch_source: Optional[str] = None

    for _p in _iter_remote_participants(my_room):
        _identity = getattr(_p, "identity", None) or ""
        _meta_raw = getattr(_p, "metadata", None) or ""
        if _identity.startswith("aiscent_user_"):
            _aiscent_detected = True
            _aiscent_session_uuid = _identity[len("aiscent_user_"):] or None
            _dispatch_source = "identity_fallback"
            print(f"[AISCENT_ROUTING] identity prefix matched: {_identity}")
        if _meta_raw: 
            try:
                _meta_json = json.loads(_meta_raw)
                if _meta_json.get("aiscent_type") == "true":
                    _aiscent_detected = True
                    if not _aiscent_session_uuid:
                        _aiscent_session_uuid = _meta_json.get("session_uuid")
                    _dispatch_source = "jwt_metadata"
                    print(
                        f"[AISCENT_ROUTING] JWT metadata aiscent_type=true "
                        f"(session_uuid={_aiscent_session_uuid})"
                    )
            except (json.JSONDecodeError, TypeError):
                pass
        if _aiscent_detected:
            break

    # If we haven't seen a participant yet, register a listener and poll for
    # up to 3 seconds. This handles the race where the worker starts before
    # the participant fully joins.
    if not _aiscent_detected:
        _aiscent_ready_evt = asyncio.Event()

        def _on_aiscent_probe_participant(participant):
            nonlocal _aiscent_detected, _aiscent_session_uuid, _dispatch_source
            identity = getattr(participant, "identity", None) or ""
            meta_raw = getattr(participant, "metadata", None) or ""
            matched = False
            if identity.startswith("aiscent_user_"):
                matched = True
                if not _aiscent_session_uuid:
                    _aiscent_session_uuid = identity[len("aiscent_user_"):] or None
                _dispatch_source = "identity_fallback"
            if meta_raw:
                try:
                    meta_json = json.loads(meta_raw)
                    if meta_json.get("aiscent_type") == "true":
                        matched = True
                        if not _aiscent_session_uuid:
                            _aiscent_session_uuid = meta_json.get("session_uuid")
                        _dispatch_source = "jwt_metadata"
                except (json.JSONDecodeError, TypeError):
                    pass
            if matched:
                _aiscent_detected = True
                _aiscent_ready_evt.set()
                print(
                    f"[AISCENT_ROUTING] deferred match on participant identity={identity}"
                )

        def _on_aiscent_probe_attrs(_changed, participant):
            _on_aiscent_probe_participant(participant)

        def _on_aiscent_probe_meta(participant, *_a, **_k):
            _on_aiscent_probe_participant(participant)

        if hasattr(my_room, "on"):
            my_room.on("participant_connected", _on_aiscent_probe_participant)
            my_room.on("participant_attributes_changed", _on_aiscent_probe_attrs)
            try:
                my_room.on("participant_metadata_changed", _on_aiscent_probe_meta)
            except Exception:
                pass

        try:
            await asyncio.wait_for(_aiscent_ready_evt.wait(), timeout=3.0)
        except asyncio.TimeoutError:
            pass

    if not _aiscent_detected:
        print(
            "[AISCENT_ROUTING] ⚠ no AISCENT participant matched — exiting entrypoint. "
            "This worker only serves AISCENT sessions."
        )
        return

    print("\n" + "=" * 80)
    print("[AISCENT_ROUTING] active — starting AiscentInterviewer flow")
    print(
        f"[AISCENT_ROUTING] session_uuid={_aiscent_session_uuid} "
        f"dispatch_source={_dispatch_source}"
    )
    print("=" * 80 + "\n")

    aiscent_finalized = False

    aiscent_state: dict = {
        "session_uuid": _aiscent_session_uuid,
        "tier": "tier1",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "duration_seconds": None,
        "end_reason": None,
        "camp_scores": {},
        "sequencing_flags": [],
        "ascent_position": None,
        "transcript": [],
        "pre_climb_deferred": False,
    }

    aiscent_session = AgentSession(min_endpointing_delay=1, user_away_timeout=90.0)
    aiscent_interviewer = AiscentInterviewer()

    await aiscent_session.start(
        agent=aiscent_interviewer,
        room=my_room,
        room_input_options=RoomInputOptions(text_enabled=True),
    )
    print("[AISCENT] ✓ AiscentInterviewer session started")

    try:
        await aiscent_session.generate_reply(
            instructions=(
                "Greet the participant warmly and deliver the opening frame described in your instructions "
                "(about the 12-15 minute length, six areas, evidence-not-plans framing, and 'ready?' check). "
                "Do NOT ask the Camp A opening question yet — wait for their acknowledgment."
            )
        )
        print("[AISCENT] ✓ Opening frame delivered")
    except Exception as e:
        print(f"[AISCENT] ✗ Error delivering opening frame: {e}")

    # ------------------------------------------------------------------
    # Helpers: notify the backend of camp advances and completion.
    # ------------------------------------------------------------------

    async def _post_aiscent_advance(camp_id: str) -> None:
        if not aiscent_state["session_uuid"]:
            return
        try:
            api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
            async with aiohttp.ClientSession() as session_http:
                async with session_http.post(
                    f"{api_base_url}/aiscent-advance",
                    json={
                        "session_uuid": aiscent_state["session_uuid"],
                        "camp_id": camp_id,
                    },
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    response_data = await response.json()
                    print(f"[AISCENT] Advance notification result: {response_data}")
        except Exception as e:
            print(f"[AISCENT] ⚠ Error notifying aiscent advance: {e}")

    async def _post_aiscent_complete(payload: dict) -> None:
        if not aiscent_state["session_uuid"]:
            return
        try:
            api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
            async with aiohttp.ClientSession() as session_http:
                async with session_http.post(
                    f"{api_base_url}/aiscent-complete",
                    json={
                        "session_uuid": aiscent_state["session_uuid"],
                        "ascent_position": payload.get("ascent_position"),
                        "end_reason": payload.get("end_reason"),
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as response:
                    response_data = await response.json()
                    print(f"[AISCENT] Complete notification result: {response_data}")
        except Exception as e:
            print(f"[AISCENT] ⚠ Error notifying aiscent complete: {e}")

    async def _deliver_aiscent_results(session_uuid: str, payload: dict) -> None:
        """POST the full AISCENT session payload to the backend email endpoint.

        No disk fallback — if the POST fails we log and continue. The backend
        forwards the JSON to SendGrid so a human operator receives it. Session
        data lives in memory only for the duration of the call.
        """
        endpoint = (
            os.getenv("AISCENT_RESULTS_ENDPOINT")
            or f"{os.getenv('API_BASE_URL', 'http://localhost:3000').rstrip('/')}/aiscent-session"
        )
        body_json = json.dumps(payload, indent=2, default=str)
        try:
            print(f"[AISCENT_DELIVERY] POSTing session {session_uuid} to {endpoint}")
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    endpoint,
                    content=body_json,
                    headers={"Content-Type": "application/json"},
                )
                print(
                    f"[AISCENT_DELIVERY] endpoint responded status={resp.status_code} "
                    f"body={resp.text[:200]!r}"
                )
        except Exception as e:
            print(f"[AISCENT_DELIVERY] ⚠ endpoint POST failed: {e}")

    async def _generate_ascent_position_narrative(
        scores: dict, flags: list, end_reason: str
    ) -> dict:
        """Call the LLM once (no tools) to draft summary + what_this_means."""
        user_prompt = aiscent_camps.build_ascent_position_llm_prompt(
            scores, flags, end_reason
        )
        try:
            chat_ctx = llm.ChatContext()
            chat_ctx.add_message(
                role="system",
                content=(
                    "You draft short, precise senior-leader-facing paragraphs for a CX "
                    "maturity assessment. Return only a strict JSON object with two "
                    "string keys: 'summary' and 'what_this_means'. Do not wrap the JSON in "
                    "markdown, do not add commentary."
                ),
            )
            chat_ctx.add_message(role="user", content=user_prompt)
            collected_parts: list[str] = []
            stream = _AISCENT_NARRATIVE_LLM.chat(chat_ctx=chat_ctx)
            try:
                async for chunk in stream:
                    delta = getattr(chunk, "delta", None)
                    if delta is None:
                        continue
                    piece = getattr(delta, "content", None)
                    if piece:
                        collected_parts.append(piece)
            finally:
                _aclose = getattr(stream, "aclose", None)
                if callable(_aclose):
                    try:
                        await _aclose()
                    except Exception:
                        pass
            collected = "".join(collected_parts).strip()
            if collected.startswith("```"):
                collected = re.sub(r"^```(?:json)?\s*", "", collected)
                collected = re.sub(r"\s*```$", "", collected)
            parsed = json.loads(collected)
            return {
                "summary": str(parsed.get("summary", "")).strip(),
                "what_this_means": str(parsed.get("what_this_means", "")).strip(),
            }
        except Exception as e:
            print(f"[AISCENT] ⚠ narrative LLM call failed: {e} — using fallback text")
            if end_reason == "pre_climb":
                return {
                    "summary": (
                        "The governance foundation for customer experience is not yet in place at "
                        "your organization. Without a named executive owner, decision authority, and "
                        "operational governance, further CX maturity has nothing to build on."
                    ),
                    "what_this_means": (
                        "This is where the climb begins. Aligned leadership is the precondition for "
                        "everything downstream — signal, health, experience management, and orchestration. "
                        "The most important next move is establishing real, durable ownership of CX at the top of the organization."
                    ),
                }
            return {
                "summary": (
                    "This is a partial read across the six areas of customer experience maturity. "
                    "The pattern shows a mix of governance, listening, and operational strengths and gaps "
                    "that vary by camp."
                ),
                "what_this_means": (
                    "The most valuable next step is to close the primary structural gap identified across "
                    "your camps — that unlocks the layers above it. This is your read; the sharpest view "
                    "will come from comparing it with how your leadership team independently assesses the same organization."
                ),
            }

    async def _finalize_and_deliver(end_reason: str) -> None:
        nonlocal aiscent_finalized
        if aiscent_finalized:
            return
        aiscent_finalized = True

        print(f"[AISCENT] Finalizing session (end_reason={end_reason})...")
        aiscent_state["end_reason"] = end_reason
        aiscent_state["ended_at"] = datetime.now(timezone.utc).isoformat()
        try:
            started = datetime.fromisoformat(
                aiscent_state["started_at"].replace("Z", "+00:00")
            )
            ended = datetime.fromisoformat(
                aiscent_state["ended_at"].replace("Z", "+00:00")
            )
            aiscent_state["duration_seconds"] = int((ended - started).total_seconds())
        except Exception:
            aiscent_state["duration_seconds"] = None

        capped_scores, flags = aiscent_camps.apply_sequencing_gates(
            aiscent_state["camp_scores"]
        )
        aiscent_state["camp_scores"] = capped_scores
        aiscent_state["sequencing_flags"] = flags

        narrative = await _generate_ascent_position_narrative(
            capped_scores, flags, end_reason
        )
        snapshot: list[dict] = []
        for camp_id in aiscent_camps.camp_order():
            entry = capped_scores.get(camp_id)
            if not entry:
                continue
            level = entry.get("level")
            descriptor = entry.get("descriptor") or ""
            snapshot.append(
                {
                    "camp_id": camp_id,
                    "area": aiscent_camps.CAMPS[camp_id].display_name,
                    "level": f"L{level}" if level is not None else "—",
                    "level_number": level,
                    "descriptor": descriptor,
                    "quote": entry.get("evidence_quote") or "",
                    "capped_by": entry.get("capped_by"),
                }
            )

        cta_text = (
            aiscent_camps.PRE_CLIMB_CTA
            if end_reason == "pre_climb"
            else aiscent_camps.INDIVIDUAL_CTA
        )
        aiscent_state["ascent_position"] = {
            "summary": narrative["summary"],
            "camp_snapshot": snapshot,
            "what_this_means": narrative["what_this_means"],
            "cta": cta_text,
        }

        await _deliver_aiscent_results(
            aiscent_state["session_uuid"] or "unknown", aiscent_state
        )

        # Wait for the agent's closing utterance to finish playing back on
        # the client before broadcasting the SSE that flips the UI to the
        # Ascent Position. Otherwise the results page loads while the final
        # sentence is still being spoken (e.g. "Thank you—" cut off).
        if end_reason != "disconnected":
            try:
                grace_ticks = 0
                for _ in range(10):
                    state = getattr(aiscent_session, "agent_state", None)
                    if state == "speaking":
                        break
                    await asyncio.sleep(0.05)
                    grace_ticks += 1

                settled = False
                wait_ticks = 0
                for _ in range(500):
                    state = getattr(aiscent_session, "agent_state", None)
                    if state != "speaking":
                        settled = True
                        break
                    await asyncio.sleep(0.05)
                    wait_ticks += 1

                waited_ms = (grace_ticks + wait_ticks) * 50
                if settled:
                    print(
                        f"[AISCENT] closing utterance finished after {waited_ms}ms — firing complete SSE"
                    )
                else:
                    print(
                        f"[AISCENT] ⚠ closing utterance still speaking after {waited_ms}ms — firing complete SSE anyway"
                    )
            except Exception as e:
                print(
                    f"[AISCENT] ⚠ wait-for-speech failed: {e} — firing complete SSE anyway"
                )

        await _post_aiscent_complete(
            {
                "ascent_position": aiscent_state["ascent_position"],
                "end_reason": end_reason,
            }
        )

        await asyncio.sleep(2)
        print("[AISCENT] Shutting down aiscent session...")
        try:
            aiscent_session.shutdown()
        except Exception as e:
            print(f"[AISCENT] ⚠ shutdown failed (non-fatal): {e}")

    async def _camp_n_completion_watchdog(delay_s: float = 30.0) -> None:
        """Defensive backstop for the observed failure mode where the LLM
        scores Camp N (the final camp) but never emits the
        `complete_interview` tool call — instead speaking meta-instructions
        ("Note the interview has concluded..."). Idempotent:
        `_finalize_and_deliver` guards against double-firing, so if the LLM
        eventually calls the tool, this becomes a no-op."""
        await asyncio.sleep(delay_s)
        if aiscent_finalized:
            return
        print(
            f"[AISCENT_WATCHDOG] Camp N scored but complete_interview not "
            f"called after {delay_s}s — auto-finalizing"
        )
        aiscent_state["sequencing_flags"].append("auto_completed_no_tool_call")
        await _finalize_and_deliver("complete_interview")

    # ------------------------------------------------------------------
    # Event handlers.
    # ------------------------------------------------------------------

    @aiscent_session.on("conversation_item_added")
    def _on_aiscent_item_added(event: ConversationItemAddedEvent):
        try:
            item = event.item
            role = getattr(item, "role", None) or "assistant"
            text = getattr(item, "text_content", None) or ""
            if not text:
                return
            aiscent_state["transcript"].append(
                {
                    "role": str(role),
                    "text": text,
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            )
        except Exception as e:
            print(f"[AISCENT] ⚠ transcript append failed: {e}")

    _L1_HINT_FALLBACKS: dict[str, list[str]] = {
        "A": ["decision impact", "budget", "priority", "priorities"],
        "I": ["existence", "map exists"],
        "S": ["signal depth", "between surveys", "instrument portfolio"],
        "C": ["model existence", "health model"],
        "E": ["cx team role", "cx function", "refresh cadence"],
        "N": ["orchestration type", "orchestration layer"],
    }

    def _dim_matches_l1(dims: list, camp_id: str) -> bool:
        """True if any entry in `dims` contains the camp's L1 hint or an alias."""
        camp = aiscent_camps.CAMPS.get(camp_id)
        hints: list[str] = []
        if camp and getattr(camp, "l1_required_dim_hint", ""):
            hints.append(camp.l1_required_dim_hint)
        hints.extend(_L1_HINT_FALLBACKS.get(camp_id, []))
        if not hints:
            return True
        dims_lower = [(d or "").lower() for d in (dims or [])]
        for h in hints:
            h_low = h.lower()
            for d in dims_lower:
                if h_low in d:
                    return True
        return False

    async def _nudge_coverage(camp_id: str, level: int, dims: list) -> None:
        try:
            camp = aiscent_camps.CAMPS.get(camp_id)
            if not camp:
                return
            listen_for_lines = "\n".join(f"  - {d}" for d in camp.listen_for)
            current = ", ".join(dims) if dims else "(none)"
            await aiscent_session.generate_reply(
                instructions=(
                    f"Your record_camp_score call for Camp {camp_id} at L{level} was "
                    f"NOT accepted: dimensions_covered had fewer than 2 entries and "
                    f"confidence was not 'low'. Current dimensions_covered: {current}. "
                    f"Ask ONE more probe that targets an uncovered LISTEN FOR "
                    f"dimension for this camp, wait for the participant's answer, then "
                    f"re-call record_camp_score with at least two distinct "
                    f"dimensions_covered entries. Do NOT verbally acknowledge this "
                    f"correction — just ask the probe. LISTEN FOR dimensions for this "
                    f"camp are:\n{listen_for_lines}"
                )
            )
        except Exception as e:
            print(f"[AISCENT] ⚠ _nudge_coverage failed: {e}")

    async def _nudge_l1_distinguisher(camp_id: str) -> None:
        try:
            camp = aiscent_camps.CAMPS.get(camp_id)
            if not camp:
                return
            probe = camp.l1_distinguisher_probe or "the L1 distinguisher probe"
            await aiscent_session.generate_reply(
                instructions=(
                    f"Your record_camp_score call for Camp {camp_id} at L1 was NOT "
                    f"accepted: you have not yet asked the L1 DISTINGUISHER probe for "
                    f"this camp. Before you can record L1, ask the participant this "
                    f"question (adapt phrasing, do not read verbatim): \"{probe}\" "
                    f"Wait for their answer, then re-call record_camp_score with the "
                    f"corresponding LISTEN FOR dimension added to dimensions_covered. "
                    f"If their answer rules L1 out, score L2 or higher instead and "
                    f"continue the interview normally. Do NOT verbally acknowledge "
                    f"this correction — just ask the probe."
                )
            )
        except Exception as e:
            print(f"[AISCENT] ⚠ _nudge_l1_distinguisher failed: {e}")

    async def _recover_pre_climb_probe() -> None:
        """Cut off any in-flight closing utterance, then re-prompt the LLM to
        ask the Camp A L1 DISTINGUISHER probe before ending the interview."""
        try:
            interrupt_fn = getattr(aiscent_session, "interrupt", None)
            if callable(interrupt_fn):
                res = interrupt_fn()
                if hasattr(res, "__await__"):
                    await res
                print("[AISCENT] cut off closing utterance for pre-climb recovery")
        except Exception as e:
            print(f"[AISCENT] ⚠ session.interrupt() failed (non-fatal): {e}")
        await _nudge_l1_distinguisher("A")

    @aiscent_session.on("function_tools_executed")
    def _on_aiscent_tools_executed(event: FunctionToolsExecutedEvent):
        for function_call, output in event.zipped():
            fn_name = getattr(function_call, "name", "")
            print(f"[AISCENT_TOOLS] Function called: {fn_name}")
            args = {}
            raw_args = getattr(function_call, "arguments", None)
            if isinstance(raw_args, str) and raw_args.strip():
                try:
                    args = json.loads(raw_args)
                except Exception as _e:
                    print(
                        f"[AISCENT_TOOLS] ⚠ could not parse function_call.arguments: {_e}"
                    )
            elif isinstance(raw_args, dict):
                args = raw_args
            try:
                output_content = getattr(output, "content", None)
                if isinstance(output_content, str) and output_content.strip():
                    parsed_output = json.loads(output_content)
                    if isinstance(parsed_output, dict):
                        for k, v in parsed_output.items():
                            args.setdefault(k, v)
                elif isinstance(output_content, dict):
                    for k, v in output_content.items():
                        args.setdefault(k, v)
            except Exception as _e:
                print(f"[AISCENT_TOOLS] ⚠ output fallback parse failed: {_e}")

            if fn_name == "record_camp_score":
                camp_id = args.get("camp_id")
                level = args.get("level")
                dims = args.get("dimensions_covered") or []
                if not isinstance(dims, list):
                    dims = []
                confidence = (args.get("confidence") or "medium").lower()

                if (
                    camp_id not in aiscent_camps.CAMPS
                    or not isinstance(level, int)
                    or not (1 <= level <= 5)
                ):
                    print(
                        f"[AISCENT] ⚠ invalid record_camp_score args camp_id={camp_id} level={level}"
                    )
                elif len(dims) < 2 and confidence != "low":
                    aiscent_state["sequencing_flags"].append(f"thin_coverage:{camp_id}")
                    print(
                        f"[AISCENT] ⚠ rejecting {camp_id} L{level} — only {len(dims)} dim(s) "
                        f"with confidence={confidence}; nudging LLM to probe further"
                    )
                    asyncio.create_task(_nudge_coverage(camp_id, level, list(dims)))
                elif level == 1 and not _dim_matches_l1(dims, camp_id):
                    aiscent_state["sequencing_flags"].append(
                        f"l1_probe_missing:{camp_id}"
                    )
                    print(
                        f"[AISCENT] ⚠ rejecting {camp_id} L1 — L1 DISTINGUISHER dim not "
                        f"covered (dims={dims}); nudging LLM to ask distinguisher probe"
                    )
                    asyncio.create_task(_nudge_l1_distinguisher(camp_id))
                else:
                    descriptor = aiscent_camps.CAMPS[camp_id].rubric[level - 1].descriptor
                    aiscent_state["camp_scores"][camp_id] = {
                        "level": level,
                        "descriptor": descriptor,
                        "evidence_quote": args.get("evidence_quote", ""),
                        "dimensions_covered": dims,
                        "confidence": args.get("confidence", "medium"),
                        "notes": args.get("notes", ""),
                        "recorded_at": datetime.now(timezone.utc).isoformat(),
                    }
                    print(
                        f"[AISCENT] recorded score for camp {camp_id}: L{level} {descriptor}"
                    )
                    # Auto-finalize watchdog: if this was the final camp,
                    # ensure the session finalizes even when the LLM fails
                    # to call `complete_interview` after speaking the closing
                    # sentence.
                    if camp_id == aiscent_camps.CAMP_ORDER[-1]:
                        asyncio.create_task(_camp_n_completion_watchdog())

            elif fn_name == "advance_to_next_camp":
                last_camp = None
                for cid in reversed(aiscent_camps.camp_order()):
                    if cid in aiscent_state["camp_scores"]:
                        last_camp = cid
                        break
                asyncio.create_task(_post_aiscent_advance(last_camp or ""))

            elif fn_name == "end_interview_early":
                reason = args.get("reason") or "pre_climb"

                # Pre-Climb recovery: reject the exit if Camp A wasn't
                # validly scored L1 with the decision-impact dimension
                # covered. Cut off the closing utterance and re-prompt the
                # LLM to run the L1 DISTINGUISHER probe. Fires at most once
                # per session — a second attempt falls through to the
                # defensive fallback and finalizes.
                if reason == "pre_climb":
                    camp_a = aiscent_state["camp_scores"].get("A")
                    a_valid = (
                        isinstance(camp_a, dict)
                        and camp_a.get("level") == 1
                        and _dim_matches_l1(
                            camp_a.get("dimensions_covered") or [], "A"
                        )
                    )
                    already_deferred = aiscent_state.get("pre_climb_deferred", False)
                    if not a_valid and not already_deferred:
                        aiscent_state["pre_climb_deferred"] = True
                        if camp_a is not None:
                            aiscent_state["camp_scores"].pop("A", None)
                        if (
                            "pre_climb_probe_missing"
                            not in aiscent_state["sequencing_flags"]
                        ):
                            aiscent_state["sequencing_flags"].append(
                                "pre_climb_probe_missing"
                            )
                        print(
                            "[AISCENT_TOOL] ⚠ Pre-Climb exit lacks decision-impact "
                            "coverage — deferring finalize and re-prompting"
                        )
                        asyncio.create_task(_recover_pre_climb_probe())
                        continue
                    elif not a_valid and already_deferred:
                        if (
                            "pre_climb_deferred_twice"
                            not in aiscent_state["sequencing_flags"]
                        ):
                            aiscent_state["sequencing_flags"].append(
                                "pre_climb_deferred_twice"
                            )
                        print(
                            "[AISCENT_TOOL] ⚠ Pre-Climb exit still missing "
                            "decision-impact coverage after retry — proceeding to "
                            "finalize as last resort"
                        )

                # Defensive fallback: FLOW_RULES require record_camp_score
                # before end_interview_early. If camp_scores is empty at
                # Pre-Climb time, synthesize a Camp A L1 record so the JSON
                # is never `camp_scores: {}` and the Ascent Position has
                # something to render.
                if reason == "pre_climb" and not aiscent_state["camp_scores"]:
                    print(
                        "[AISCENT_TOOL] ⚠ end_interview_early called without prior "
                        "record_camp_score — inserting defensive Camp A L1 record"
                    )
                    aiscent_state["camp_scores"]["A"] = {
                        "level": 1,
                        "descriptor": aiscent_camps.CAMPS["A"].rubric[0].descriptor,
                        "evidence_quote": "(no explicit score recorded before Pre-Climb early exit)",
                        "dimensions_covered": [],
                        "confidence": "low",
                        "notes": "auto_recorded_on_pre_climb_early_exit — LLM did not call record_camp_score",
                        "recorded_at": datetime.now(timezone.utc).isoformat(),
                    }
                asyncio.create_task(_finalize_and_deliver(reason))

            elif fn_name == "complete_interview":
                asyncio.create_task(_finalize_and_deliver("complete_interview"))

    def _on_aiscent_participant_disconnected(participant):
        identity = getattr(participant, "identity", None) or ""
        if not identity.startswith("aiscent_user_"):
            return
        if aiscent_finalized:
            return
        print(
            f"[AISCENT] participant {identity} disconnected mid-session — finalizing with disconnect reason"
        )
        asyncio.create_task(_finalize_and_deliver("disconnected"))

    try:
        my_room.on("participant_disconnected", _on_aiscent_participant_disconnected)
        print("[AISCENT] ✓ participant_disconnected listener registered")
    except Exception as e:
        print(f"[AISCENT] ⚠ could not register participant_disconnected: {e}")

    print("[AISCENT] ✓ AISCENT session fully configured. Waiting for interactions...")


# ============================================================================
# CLI ENTRY
# ============================================================================


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("🎬 MAIN BLOCK EXECUTING - AISCENT agent starting...")
    print("=" * 80)
    print("[MAIN] Python version:", os.sys.version)
    print("[MAIN] Working directory:", os.getcwd())
    print("[MAIN] Calling cli.run_app with entrypoint function...")
    print("[MAIN] This will register the agent with LiveKit server as 'aiscent'")
    print("[MAIN] Waiting for job dispatch from LiveKit...")
    print("=" * 80 + "\n")

    try:
        cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="aiscent"))
    except Exception as e:
        print(f"\n❌ ERROR: cli.run_app failed: {e}")
        import traceback

        traceback.print_exc()
        raise
