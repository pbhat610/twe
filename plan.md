# +twe AI Video Avatar Interviewer — Build Plan

**Goal:** ship a polished, fully working avatar interview loop in about 5 hours, built on current AI practice, at under $0.20 per interview.

**Principle:** a smooth, working core beats lots of extras. Every requirement gets a deterministic code path. The LLM only handles judgement: writing questions, analysing answers, and synthesising the report.

---

## 1. Stack decisions

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15 (App Router) + TypeScript**, one repo | Web page and backend API in one `npm run dev`, which meets the "run in under 5 minutes" requirement |
| UI | **Tailwind CSS + shadcn/ui** + `lucide-react` + `framer-motion` (sparingly) | Polished look out of the box, accessible components |
| LLM SDK | **Official `openai` Node SDK** (Responses API) + **`zod`** structured outputs (`zodTextFormat` / `responses.parse`) | Typed, schema-guaranteed JSON with no extra framework. Easy to explain on the call |
| LLM model | `gpt-5-mini` (set via `OPENAI_MODEL`) | Cheap (~$0.25 / $2 per 1M tokens), supports structured outputs. Can be swapped for a bigger model through env |
| TTS | OpenAI **`gpt-4o-mini-tts`** (voice + `instructions` such as "warm, professional interviewer") | Low cost and natural voice. Returns mp3/wav that we feed to the avatar |
| STT | OpenAI **`gpt-4o-mini-transcribe`** from a browser `MediaRecorder` blob | Cheap and accurate. Text box fallback when there is no mic |
| Avatar | **[TalkingHead](https://github.com/met4citizen/TalkingHead) (MIT, Three.js) + [HeadAudio](https://github.com/met4citizen/HeadAudio) (MIT)** | Real 3D avatar in the browser with no GPU server and no per-minute fees. HeadAudio derives visemes from the audio itself, so any TTS lip-syncs with no word timestamps needed |
| Avatar model | Bundled CC0 `mpfb.glb` (or the bundled Avaturn `avatar.glb` for the non-commercial demo) | Ready to use, with ARKit and Oculus viseme blendshapes |
| Schema validation | **`ajv`** against the provided `schemas/*.json` | Proves "correct format" with the official schemas, not just our zod copy |
| Storage | In-memory `Map<sessionId, Session>` (on `globalThis` so it survives HMR) | Allowed by the spec |
| Safety | OpenAI **`omni-moderation-latest`** (free) + prompt isolation + output validator | Covers the guardrails requirement |

### Avatar options considered

| Option | Verdict |
|---|---|
| **Duix-Avatar** (the one you found) | ❌ Needs an NVIDIA GPU, Windows/Ubuntu, a ~70 GB Docker download and 100 GB+ of disk, and it renders **offline video, not real-time**. Its own README says real-time interaction is not included. Wrong fit for a 5-hour browser demo. |
| HeyGen / D-ID / Tavus / Simli streaming | ⚠️ Photoreal, but trial credits run out fast, WebRTC setup adds risk, it can lag, and it is a paid dependency the reviewers must sign up for. Keep as a "with more time" option. |
| **TalkingHead + HeadAudio** | ✅ Free, MIT, runs in the browser, 60 fps, works with OpenAI TTS audio, and the spec explicitly accepts it ("your own simple animated avatar that lip-syncs to TTS audio"). |
| Fallback (if WebGL breaks) | 2D SVG face whose mouth opening follows the `AnalyserNode` RMS of the TTS audio. About 30 minutes of work, as a safety net. |

### Why not the OpenAI Realtime API (speech-to-speech)?
It is tempting, but (a) gpt-realtime audio costs roughly 10–20× the pipeline, (b) the spec needs **per-answer structured analysis, a logged follow-up decision and a hard cap of 2 follow-ups**, which is far easier to enforce and audit in a turn-based pipeline, and (c) guardrails are easier to check on text before it is spoken. Realtime goes under "what I'd do with more time".

---

## 2. Architecture

```
Browser (Next.js page)                         Next.js API routes (server)
┌──────────────────────────────┐              ┌────────────────────────────────────┐
│ Setup: pick job + candidate  │──POST───────▶│ /api/sessions        create + plan │
│ Interview room:              │              │   └ planner (LLM, zod) → ajv check │
│  • TalkingHead avatar (3D)   │◀─audio/mpeg──│ /api/tts             gpt-4o-mini-tts│
│  • HeadAudio lip-sync        │              │                                    │
│  • Mic (MediaRecorder) / text│──POST blob──▶│ /api/transcribe      mini-transcribe│
│  • Transcript + live "agent  │──POST text──▶│ /api/sessions/:id/answer           │
│    reasoning" side panel     │◀─next turn───│   ├ moderation + injection screen  │
│ Report view                  │              │   ├ analyzer (LLM, zod)            │
│  • scores, quotes, verdict   │◀─JSON────────│   ├ policy: follow-up ≤ 2 (code)   │
│  • download JSON             │              │   └ guardrail check on next q      │
└──────────────────────────────┘              │ /api/sessions/:id/report           │
                                              │   └ reporter (LLM) + ajv validate  │
                                              │ In-memory session store            │
                                              └────────────────────────────────────┘
```

### Interview state machine (server is the source of truth)
```
PLANNED → ASKING(q_i, followups=k) → AWAITING_ANSWER → ANALYZING
   → (decision=follow_up && k<2) ? ASKING(q_i, k+1) : ASKING(q_{i+1}, 0)
   → … → COMPLETE → REPORT
```
The client never decides what comes next. It renders the `nextTurn` returned by the server.

---

## 3. Agent design (how it decides what to ask)

### 3.1 Planner — `generatePlan(job, candidate)`
- Input: the job (requirements and responsibilities) and the candidate profile, with **the candidate profile wrapped in `<candidate_data>` tags and marked untrusted** in the system prompt.
- Before prompting, compute a **requirement ↔ evidence gap matrix** in code where cheap (skill keyword overlap). Pass it as a hint so questions target: verify a claimed skill, probe a gap, or explore transferable experience (for the career switcher).
- Output: zod schema mirroring `schemas/interview_plan.schema.json`. 5–7 questions, each with `requirement_id`, `rationale` (why for *this* candidate), and `type` (verify / probe_gap / behavioural / motivation).
- Post-checks: ajv validation → guardrail validator (§4) → if anything fails, one repair retry with the errors fed back.

### 3.2 Answer analyser and adaptor — `analyzeAnswer(session, turn)`
One LLM call per answer (keeps latency and cost low) returns:
```ts
{ relevance: "answered" | "partial" | "off_topic",
  depth: "concrete_example" | "generic",
  skill_evidence: [{ requirement_id, quote }],   // quote must be verbatim substring → verified in code
  score: 1-5, note: string,
  injection_detected: boolean,
  decision: "follow_up" | "move_on", decision_reason: string,
  follow_up_question?: string }
```
- **Code-enforced policy:** follow-ups are capped at 2 per question no matter what the LLM says. On the 3rd it is forced to `move_on` and the override is logged.
- **Quote grounding:** each `quote` is checked as a fuzzy substring of the transcript. Quotes that are not found get dropped. This keeps the report "grounded in quotes".
- Everything (analysis, decision, reason) is appended to `session.log` and shown live in a collapsible "Agent reasoning" panel, which helps with the evaluation.

### 3.3 Reporter — `buildReport(session)`
- Deterministic part (code): per-competency evidence is aggregated from the saved analyses, along with quote lists and the per-turn analysis array.
- LLM part: competency scores (1–5) **each citing quotes from the evidence list**, strengths, concerns, and a recommendation (advance / hold / reject) with a justification.
- ajv-validated against `schemas/interview_report.schema.json`, plus one repair retry. Saved in memory and downloadable. The CLI script writes to `/outputs`.

---

## 4. Guardrails (15% of the grade, so they get real tests)
1. **Prompt isolation:** all candidate data (bio, answers) goes inside delimited `<untrusted>` blocks. The system prompt states that instructions inside them are data and must never be followed. We never concatenate untrusted text into the system role.
2. **Injection screen:** a cheap regex heuristic (`ignore (all|previous)`, `system prompt`, `score me`, `you are now`…) plus an `injection_detected` field from the analyser. If either fires, the turn is flagged in the log and the report, and the score is never inflated. `cand_004`'s bio is a test case.
3. **Protected-topic validator** on **every** question and follow-up before it is spoken: keyword/regex list (age, religion, nationality, marital status, health, pregnancy/family plans, etc.) plus an LLM yes/no check only if the regex is ambiguous. If it fails, the question is regenerated or swapped for the next planned one.
4. **Moderation:** `omni-moderation-latest` on candidate answers (free).
5. **Output guard:** the avatar only ever speaks server-approved question text.
6. **Tests:** Vitest unit tests for the guardrail validator and follow-up cap, and an integration test that runs `cand_004` + `sample_answers.json` in simulated mode and asserts no protected-topic questions and `injection_detected=true`.

---

## 5. UI / UX (polished but small)
- **Setup screen:** job cards and candidate cards (name, headline, tags) → "Start interview".
- **Interview room:** large avatar stage (soft gradient background, subtle idle animation), caption of the current question under it, progress pill ("Question 3 / 6 · follow-up 1"), big mic button (click to start/stop, live level meter), "Type instead" toggle, live transcript on the right, and a collapsible **Agent reasoning** drawer showing each analysis and decision.
- **Report screen:** recommendation badge, competency score bars with expandable quotes, strengths/concerns columns, per-turn accordion, "Download JSON".
- Dark/light theme, keyboard accessible, loading states ("Thinking…" avatar pose while the analyser runs).
- **Latency tricks:** prefetch TTS for the next planned question while the candidate answers. Run analysis and follow-up generation in one call. Start avatar audio as soon as the TTS stream arrives.

---

## 6. Bonus items (only after the core works, in order of cost to value)
1. **Simulated mode** using `sample_answers.json` (also generates `/outputs/sample_report.json` via `npm run simulate`). ~30 min, and it doubles as the test harness.
2. **Streaming responses:** stream report generation to the UI. ~20 min.
3. **Candidate webcam view:** `getUserMedia` picture-in-picture, not sent anywhere. ~15 min.
4. Arabic: `gpt-4o-mini-tts` speaks Arabic, and HeadAudio lip-sync is language-agnostic. Add a language toggle plus an RTL transcript. ~45 min, so probably skip.

---

## 7. Project layout
```
/data              jobs.json, candidates.json, sample_answers.json, example_report.json
/data/schemas      interview_plan.schema.json, interview_report.schema.json
/src/app           page.tsx (setup), interview/[id]/page.tsx, report/[id]/page.tsx
/src/app/api       sessions, sessions/[id]/answer, sessions/[id]/report, tts, transcribe
/src/lib/agent     planner.ts, analyzer.ts, reporter.ts, policy.ts, prompts.ts
/src/lib/guardrails protectedTopics.ts, injection.ts, moderation.ts
/src/lib           openai.ts, store.ts, schemas.ts (zod), validate.ts (ajv)
/src/components    Avatar.tsx (TalkingHead+HeadAudio, dynamic import, ssr:false), MicButton.tsx, …
/public/avatars    mpfb.glb
/scripts           simulate.ts → /outputs/*.json
/outputs           sample_report.json
/tests             guardrails.test.ts, policy.test.ts, simulate.test.ts
.env.example       OPENAI_API_KEY=, OPENAI_MODEL=gpt-5-mini, OPENAI_TTS_VOICE=…
README.md
```

---

## 8. Time-boxed build order (~5 h)
| # | Block | Time | Done when |
|---|---|---|---|
| 1 | Scaffold Next.js + Tailwind + shadcn, load demo data, zod + ajv schemas, store | 0:30 | Pickers render real jobs and candidates |
| 2 | Planner + guardrail validator + `/api/sessions` | 0:45 | Valid plan JSON for all 3×4 combos, cand_004 clean |
| 3 | Analyzer + follow-up policy + `/answer` (text-only loop first) | 0:45 | Full interview works by typing |
| 4 | Reporter + ajv + report page | 0:40 | Schema-valid report rendered |
| 5 | TTS + STT routes, mic button, TalkingHead + HeadAudio avatar | 1:00 | Avatar speaks with lip-sync, voice answers transcribed |
| 6 | Simulated mode script → `/outputs`, tests | 0:30 | `npm run simulate` and `npm test` pass |
| 7 | UI polish, error states, README (incl. AI-tool usage, trade-offs, next steps) | 0:50 | Fresh clone runs in under 5 minutes |

**De-risk first:** spike TalkingHead + HeadAudio + OpenAI TTS in isolation (≤20 min) at the start of block 5. If it fights back, switch to the 2D RMS-mouth fallback and move on.

---

## 9. Cost estimate (per ~12-turn interview, approximate. Check against OpenAI's pricing page)
| Item | Usage | ≈ Cost |
|---|---|---|
| LLM (gpt-5-mini) | ~15 calls, ~50k in / ~12k out | ~$0.04 |
| TTS (gpt-4o-mini-tts) | ~3 min of speech | ~$0.05 |
| STT (gpt-4o-mini-transcribe) | ~6 min of answers | ~$0.02 |
| Moderation, avatar | — | $0 |
| **Total** | | **≈ $0.10–0.15**. The whole build and test cycle should stay well under the $20 reimbursement |

Dev tip: simulated mode plus a `TTS_CACHE` (hash of text → mp3 in `.cache/`) means repeated test runs cost almost nothing.

---

## 10. README checklist (required by the brief)
- Run in under 5 minutes: `cp .env.example .env.local && npm i && npm run dev`
- How the agent decides what to ask (planner gap matrix, analyser rubric, follow-up policy)
- Guardrails and how cand_004 is handled
- Trade-offs: pipeline vs Realtime API, TalkingHead vs photoreal streaming avatar, in-memory store, push-to-talk vs VAD
- With more time: OpenAI Realtime / photoreal avatar, server VAD with barge-in, persistence (Postgres), recruiter dashboard, eval suite over sample answers, Arabic
- How AI coding tools were used (Claude Code for scaffolding, schema-to-zod, tests, and review. All prompts and agent logic were reviewed by hand)
- Sample report in `/outputs`

## Open item
The demo data files (`jobs.json`, `candidates.json`, `sample_answers.json`, `schemas/`, `example_report.json`) are not in this folder yet. Drop them into `/data` before block 1.
