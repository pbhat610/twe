# +twe AI Video Avatar Interviewer

An AI interviewer that appears as a talking avatar, reads a job and a candidate profile, asks tailored questions one at a time, adapts with follow-ups, and writes a recruiter report grounded in the candidate's own words.

> 🧭 Architecture and "mental map": [docs/MENTAL_MAP.md](docs/MENTAL_MAP.md) · Original plan: [plan.md](plan.md)

## Run it in under 5 minutes

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY (optional, see below)
npm run dev                  # http://localhost:3000
```

- **AI brain (`LLM_PROVIDER`)**
  - `fixtures` (default, **free**): replays outputs written by Claude for the official demo data (tailored plans for the four intended job–candidate pairs, an analysis for every scripted answer, an example role). Anything else falls back to simple offline rules.
  - `openai` (billed): real calls. `OPENAI_MODEL` (default `gpt-6.1-sol`) writes JDs, plans and reports; `OPENAI_MODEL_FAST` (default `gpt-6.1-terra`) analyses each answer. The server log prints tokens and estimated cost for every call, plus a running total.
  - `heuristic` (free): offline rules only.
- **With `OPENAI_API_KEY`:** mic answers are transcribed and answers moderated (free), whatever the brain.
- **With `ELEVENLABS_API_KEY`:** ElevenLabs voice; otherwise OpenAI TTS, or the free browser voice with `TTS_PROVIDER=none`.
- **With `SIMLI_API_KEY`** (`AVATAR_PROVIDER=simli`): a photoreal avatar. Otherwise the open-source 3D/2D avatar.
- **Without any keys** every screen and flow still works at zero cost.

Other commands:

```bash
npm test                              # unit + integration tests (offline, free)
npm run simulate -- job_003 cand_004  # scripted interview → outputs/<job>_<cand>_report.json
npm run typecheck
```

## Recruiter login
Recruiter pages and APIs need a sign-in; candidates never log in (their access is the private link).
Credentials live in env: `RECRUITER_EMAIL`, `RECRUITER_PASSWORD`, and `AUTH_SECRET` (32+ random chars, signs the session cookie: `openssl rand -base64 32`). Put them in `.env.local` locally and in the Vercel project settings for production.

How it's enforced: a signed HttpOnly cookie (HMAC-SHA256, 8 h, `Secure` in production). `src/proxy.ts` redirects to `/login` or returns 401, every recruiter API route re-checks the cookie, and comparisons are constant-time. Failed sign-ins are rate-limited to 5 per IP per 5 minutes (per server instance).

## Recruiter → candidate flow

The recruiter app has a side navigation: **Dashboard**, **Video pipeline**, **Candidates** and **Settings**.

1. **Video pipeline → New video assessment** (right-hand panel, no modal): give it a **title**, **paste the JD**, choose how many questions the AI drafts (5–7, the official plan schema's range) and the **call duration**, then **Generate questions**. The AI structures the JD into requirements (removing and reporting any discriminatory criteria) and drafts role-based questions. **Add, edit, reorder or delete** them, then **Save**. The brief's three jobs are available as read-only demo assessments (duplicate one to edit it).
2. **Candidates**: **Import JSON** (an array like the brief's `candidates.json`), **Upload resume** (PDF, DOCX or TXT: the AI extracts name, email, phone and current title and writes a short summary; contact details are only kept if they appear in the resume) or **Add manually**. Review, then save.
3. **Invite** on an assessment: pick candidates and each gets a personal interview with its own private link. The approved questions are asked as written; the AI uses the candidate's summary to make follow-ups specific to them. Questions not yet asked can still be edited per interview (**Edit questions** on the interview page).
4. The candidate sees a **countdown** for the call length. When time is up, Aria wraps up after the current answer (enforced on the server), and the report notes it.
5. Copy the private link `/i/<token>` and send it to the candidate (or click **Open as candidate (demo mode)**, which adds a "simulated answer" button).
6. **Candidate**: device check (camera **required**, mic when voice is on) → **agrees to recording** → joins in full screen → talks to Aria. They only ever receive a redacted view: no scores, notes, rationales or reasoning.
7. **Recruiter** monitors live (`/interviews/<id>`): transcript with per-answer scores, agent reasoning, **integrity events** and the **recording so far**. When the interview finishes they open the report, which includes the full recording.

## Interview recording

Every interview is recorded so the hiring team can review and audit it: **candidate camera + candidate mic + Aria's voice**, mixed into a single track.

- **Consent first.** The candidate must tick "I agree to this interview being recorded" to join. The server refuses to join (400) and refuses uploads (409) without it, and stores `recording_consent_at` on the interview.
- **Captured in the browser** with `MediaRecorder` (WebM VP8/Opus; MP4 on Safari) at ~500 kbps video / 64 kbps audio, about 2.7 MB per minute. The mic uses echo cancellation, and Aria's voice is mixed in from the clean TTS audio rather than picked up from the speakers.
- **Uploaded while the interview runs** as ordered 5-second chunks (`POST /api/i/<token>/recording?seq=N`), each retried with backoff. A closed tab loses at most the last 5 s, and every request stays far under Vercel's 4.5 MB body limit. Chunks are accepted only while the interview is live, plus 10 minutes for the final flush, and are capped at 3 MB each.
- **Stored** in a **private Supabase Storage bucket** (`interview-recordings/<interview_id>/<seq>.webm`, created by `0003_interview_recordings.sql`), or in memory locally. Only the server's service-role key can access it.
- **Playback** on the monitor and report pages (recruiter-only). The browser receives one-hour signed URLs, fetches the chunks directly from Storage and joins them into one playable, downloadable file, so no large response passes through a serverless function.
- **Retention** is not automated yet. Delete old recordings with a scheduled job using the Storage API, per your policy.
- Limitation: when no TTS key is set, Aria uses the browser's built-in voice, which can't be captured. Her questions are still in the transcript.

## Interview integrity (proctoring)

Built only from browser APIs and **open-source** models. The analysis runs on the candidate's device. Integrity events are stored as metadata; the video itself is the separate, consented recording above.

| Signal | How | Severity |
|---|---|---|
| Tab switch / minimise | `visibilitychange` | critical |
| Another window or app focused | `window.blur` | warning |
| Left full screen | Fullscreen API (interview starts in full screen) | warning |
| Second display connected | Window Management API `screen.isExtended` (Chromium) | critical |
| Copy / paste | clipboard events (blocked) | warning |
| No face, or more than one face | **MediaPipe Face Landmarker** (Apache-2.0) | critical |
| Looking away / down for 5 s+ | head pose from landmarks + eye-gaze blendshapes | warning |
| Voice heard while lips are still (someone else answering) | mic level vs mouth-opening variance | critical |
| Camera turned off | media track `ended` | critical |

Each violation shows the candidate a warning right away. Each type is rate-limited to once per 8 s, and short glances or blinks are ignored (sustained-duration rules in `integrityRules.ts`). Severity, timestamp and question are assigned **server-side**. Violations appear live for the recruiter and as a separate "integrity" section in the report. They are **not** fed to the LLM and don't change competency scores: a human decides what a tab switch means.

## How it works

1. **Plan (R1).** `JobWriter` structures the pasted JD into requirements; `QuestionPlanner` drafts the requested number of questions with a strict zod schema (role-based for an assessment, or tailored when given a candidate profile, fenced as untrusted). Each question maps to `requirement_ids` with a rationale. Code then checks the count (5–7), the requirement ids, must-have coverage and protected topics. One repair round feeds the problems back. The plan is validated against `data/schemas/interview_plan.schema.json`.
2. **Talk (R2).** The server keeps a list of **approved utterances**, and the TTS endpoint only voices those ids. The avatar plays the audio, and the mouth is driven *from the audio itself* (HeadAudio), so any TTS lip-syncs without timestamps. The mic is recorded with `MediaRecorder` and transcribed server-side. A text box is always available as a fallback.
3. **Analyse and adapt (R3).** After each answer, `AnswerAnalyzer` returns relevance, depth, skill evidence (verbatim quote), a 1–5 score with a note, and a follow-up suggestion. Code then:
   - drops quotes that aren't actually in the answer,
   - blocks follow-ups that touch protected topics,
   - applies `FollowUpPolicy` (**hard cap of 2 follow-ups per question**, enforced in code),
   - logs the analysis, the decision and any override (visible live in the "Agent reasoning" tab).
4. **Report (R4).** `ReportWriter` asks the LLM for competency scores, strengths, concerns and a recommendation. Code assembles the factual parts (per-turn analyses, flags, ids), re-checks every quote against the transcript, and caps unevidenced competencies at 2. The report is validated against `interview_report.schema.json`.

### How the agent decides what to ask
- **Verify** skills the candidate claims, anchored to their real experience ("At Souqly you migrated checkout…").
- **Probe gaps** where a must-have requirement has no evidence in the profile.
- **Transferable experience** for career switchers. **Accessible behavioural questions** for thin profiles.
- **Follow up** when an answer is vague, partial, off-topic (one polite redirect) or interesting enough to go one level deeper. **Move on** when it's concrete and complete, after 2 follow-ups, or when the candidate tries to manipulate the interviewer.

### Guardrails (R5)
| Risk | Defence |
|---|---|
| Asking about age, religion, nationality, marital status, health or family plans | Prompt rule, plus a regex guard on **every** question and follow-up before it can be spoken (repair, drop or replace) |
| Hidden instruction in `cand_004`'s bio | Profile fenced in `<untrusted>` tags. Injection detector flags it in the log and report. It never affects scores |
| Manipulative answers | Analyser `injection_attempt` plus heuristic detector → turn flag, score reflects genuine content only |
| Invented evidence | Quote grounding plus a score cap when no verbatim quote exists |
| Arbitrary text-to-speech | TTS speaks only server-approved utterance ids |

## Open-source first
| Concern | Tool (license) |
|---|---|
| App framework | Next.js, React (MIT) |
| Avatar | TalkingHead + HeadAudio (MIT) with a 2D fallback. Simli is an **optional** hosted extra |
| Face / gaze / lip tracking | MediaPipe Tasks Vision (Apache-2.0) |
| Schema validation | Ajv (MIT), Zod (MIT) |
| Database | Supabase Postgres (Apache-2.0, self-hostable) |
| Tests | Vitest (MIT) |

Paid APIs are only used where open source can't match quality cheaply: the **LLM** (OpenAI), **voice** (ElevenLabs) and **speech-to-text** (OpenAI). Each sits behind a port, so it can be swapped for a self-hosted model (e.g. Whisper, Piper or Kokoro TTS) in one adapter.

## Deploy (Vercel + Supabase)
1. Create a Supabase project. Put `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the secret key) and `SUPABASE_DB_URL` (Connect → connection string with your DB password) in `.env.local`, then run `npm run db:setup`. It creates every table and the private recordings bucket. Add `-- --demo` to also load the brief's three assessments and four candidates. Safe to re-run.
2. Import the repo in Vercel and set the env vars from `.env.example`. **`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required on Vercel**, because serverless instances don't share memory.
3. Deploy. Without Supabase variables the app falls back to in-memory storage, which only suits local dev.

**One source of truth:** with Supabase configured, assessments, candidates, interviews, integrity events and recordings all live in the database; `data/*.json` is only the seed for `db:setup` and the in-memory store used by tests and offline runs.

Notes: the service-role key is only used server-side, and both tables have RLS on with no policies, so the public anon key can't read anything. Writes use optimistic locking (`version`), so two instances can't overwrite the same interview. Integrity events are stored append-only in their own table so they never conflict with answer submission.

## Stack and trade-offs
| Choice | Why | Trade-off |
|---|---|---|
| Next.js 16 (App Router), one repo | Page and API in one `npm run dev` | No separate scalable backend |
| OpenAI Responses API + zod structured outputs (`gpt-5.4-mini`) | Typed, schema-guaranteed JSON, cheap | One provider by default, but swappable via the `StructuredLLM` port |
| Turn-based pipeline (LLM + TTS + STT) instead of the speech-to-speech Realtime API | Per-answer analysis, logged decisions, guardrails *before* speaking, ~10× cheaper | ~1–2 s gap between answer and next question, no barge-in |
| **Simli** photoreal streaming face (free 50 min/month, ~$0.01/min after), used *only as a face*: we stream our own TTS audio as PCM16 16 kHz | Human-looking interviewer like commercial products, while our agent, guardrails and voice stay in control | Needs a Simli account. Falls back automatically |
| Fallbacks: TalkingHead + HeadAudio 3D (MIT, released Oct 2026), then a 2D face | Works with no account or GPU | Stylised, not photoreal |
| Voice: **ElevenLabs `eleven_v4_turbo`** (default), OpenAI `gpt-4o-mini-tts` as automatic fallback | Most natural interviewer voice at real-time latency | Costs more than OpenAI TTS (Flash/Turbo tier listed at ~$0.04 per 1K chars ≈ $0.10–0.15 per interview) |
| ElevenLabs used as **TTS only**, not ElevenLabs Agents | Agents run their own LLM turn-taking, so per-answer analysis, the 2-follow-up cap and pre-speech guardrails couldn't be guaranteed | We build turn-taking ourselves (push-to-talk) |
| Push-to-talk mic | Reliable, no false end-of-speech cuts | One extra tap per answer |
| Supabase Postgres (session as JSONB + hot columns) with in-memory fallback for dev | Works on Vercel serverless; schema can evolve without migrations | JSONB is less queryable than fully normalised tables |
| Single recruiter account from env (signed cookie) instead of a full user system | Simple, no extra service; candidate links are unguessable secret tokens | One shared login; for teams move to Supabase Auth (multiple users, password reset) |

Approximate cost per ~12-turn interview: **~$0.10–0.15** (LLM ~$0.04, TTS ~$0.05, STT ~$0.02, moderation free).

## With more time
- Photoreal streaming avatar (Tavus/Anam/Simli) as another `AvatarEngine`, or a Realtime voice mode with voice-activity detection and barge-in.
- Voice activity detection (auto-stop recording on silence).
- Postgres persistence and a recruiter dashboard to compare candidates.
- An eval suite: run all job × candidate combos through `simulate` and score question specificity and report grounding with an LLM judge.
- Arabic (TTS and HeadAudio are language-agnostic; needs an RTL UI and prompts).

## Bonus items done
- ✅ Simulated mode (`sample_answers.json`) in the UI ("Simulated answer" button) and the CLI (`npm run simulate`)
- ✅ Candidate webcam self-view (local only, never uploaded)
- ⬜ Arabic · ⬜ Streaming responses

## How AI coding tools were used
Built with Claude Code as a pair programmer: researching options (avatar libraries, model deprecations), scaffolding the layered architecture, writing tests, and driving the browser to verify the UI flow. Prompts, guardrail rules and the agent decision logic were designed and reviewed by hand.

## Demo data
`data/` holds the **official** demo data and schemas from the task (`jobs.json`, `candidates.json`, `sample_answers.json`, `example_report.json`, `schemas/` in JSON Schema 2020-12). Plans and reports are validated against those schemas with Ajv; a test also validates the official `example_report.json`.

- `persona_note` in `candidates.json` is a hint for graders: it is never sent to the LLM, the candidate or the browser.
- Simulated mode picks the scripted answer **by topic** (keyword match on the current question), uses `*_probed` answers for follow-ups, and plays the edge cases (injection, off-topic, rude, empty) on questions 3, 5 and 7 so every run exercises the guardrails.
- Sample reports for the four intended pairs are in [`/outputs`](outputs/), generated with `npm run simulate`.
