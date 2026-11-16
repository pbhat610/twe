# Mental Map: +twe AI Avatar Interviewer

A one-page map of how the system fits together: what each piece does, which way the dependencies point, and where each requirement in the brief lives. Diagrams are Mermaid, which GitHub renders.

---

## 1. The big picture

```mermaid
mindmap
  root((AI Avatar<br/>Interviewer))
    Requirements
      R1 Generate questions
        QuestionPlanner
        5–7 Qs, each → requirement_id + rationale
      R2 Talk face to face
        Avatar engine Simli → 3D → 2D
        TTS → lip-sync
        Mic → STT, text fallback
      R3 Analyse and adapt
        AnswerAnalyzer
        FollowUpPolicy max 2
        Agent log
      R4 Report
        ReportWriter
        Quote grounding
        ajv vs official schema
      R5 Guardrails
        ProtectedTopicGuard
        PromptInjectionDetector + fences
        Moderation
        Approved-utterance TTS
      R6 App
        Recruiter: create link, monitor, report
        Candidate: /i/token, redacted view
        Supabase or in-memory store
      Integrity
        Browser signals: tab, blur, fullscreen, displays, clipboard
        MediaPipe face: presence, gaze, lips
        Append-only events, server-side severity
    Layers
      domain: pure types + rules
      ports: interfaces
      application: agents + use case
      infrastructure: OpenAI, ElevenLabs, ajv, files, memory
      container: wiring
      UI: pages, hooks, components
    Modes
      openai: real LLM/TTS/STT
      offline: HeuristicLLM + browser voice
      simulated: sample_answers.json
```

---

## 2. Layers and dependency direction (SOLID "D")

Arrows point **toward what a module depends on**. Nothing in `domain/` or `application/` imports a vendor SDK.

```mermaid
flowchart LR
  subgraph UI["UI (client)"]
    Pages["app/* pages"] --> Room["InterviewRoom"]
    Room --> Flow["useInterviewFlow"]
    Room --> AvatarC["Avatar → AvatarEngine"]
    Flow --> ApiClient["lib/api.ts"]
  end

  subgraph API["Route handlers (thin controllers)"]
    R["/api/sessions/**"]
  end

  ApiClient -- HTTP --> R
  R --> Container["container.ts<br/>(composition root)"]
  R --> Service

  subgraph APP["application"]
    Service["InterviewService<br/>(state machine)"]
    Planner["QuestionPlanner"]
    Analyzer["AnswerAnalyzer"]
    Writer["ReportWriter"]
    Guards["guardrails/*"]
    Prompts["prompts/*"]
    Service --> Planner & Analyzer & Writer & Guards
    Planner & Analyzer & Writer --> Prompts
  end

  subgraph DOMAIN["domain"]
    Types["types.ts"]
    Policy["FollowUpPolicy"]
    Ground["quoteGrounding"]
  end

  subgraph PORTS["ports (interfaces)"]
    P["StructuredLLM · SpeechSynthesizer · SpeechTranscriber<br/>ContentModerator · SessionRepository · CatalogRepository<br/>SchemaValidator · Clock · IdGenerator"]
  end

  APP --> DOMAIN
  APP --> PORTS

  subgraph INFRA["infrastructure (adapters)"]
    OA["OpenAI: LLM / TTS / STT / Moderation"]
    EL["ElevenLabs TTS"]
    Simli["SimliSessionIssuer (photoreal face token)"]
    Cache["CachingSpeechSynthesizer (decorator)"]
    Fake["HeuristicLLM (offline)"]
    Mem["InMemorySessionRepository"]
    Files["FileCatalogRepository"]
    Ajv["AjvSchemaValidator"]
  end

  INFRA -. implements .-> PORTS
  Container --> INFRA
  Container --> APP
```

---

## 3. One interview turn (sequence)

```mermaid
sequenceDiagram
  autonumber
  actor C as Candidate
  participant UI as Browser (Room + Avatar)
  participant API as Route handlers
  participant S as InterviewService
  participant A as AnswerAnalyzer (LLM)
  participant G as Guardrails
  participant P as FollowUpPolicy
  participant T as TTS (cached)

  UI->>API: GET /speech/:utteranceId
  API->>T: synthesize(approved text)
  T-->>UI: mp3 → Avatar lip-syncs (HeadAudio)
  C->>UI: speaks (MediaRecorder) or types
  UI->>API: POST /transcribe (audio) → text
  UI->>API: POST /answers {turnId, answer}
  API->>S: submitAnswer()
  par in parallel
    S->>G: injection heuristic + moderation
    S->>A: analyse (fenced answer)
  end
  A-->>S: relevance, depth, evidence, score, decision, follow-up?
  S->>S: drop quotes not found verbatim
  S->>G: protected-topic check on follow-up
  S->>P: decide(follow-ups so far ≤ 2)
  S->>S: log analysis + decision + overrides
  S->>T: pre-warm next line (fire and forget)
  S-->>UI: SessionView (next turn | completed)
```

---

## 4. Interview state machine

```mermaid
stateDiagram-v2
  [*] --> Planned: start(job, candidate)
  Planned --> Asking: q1 + intro
  Asking --> Analyzing: answer submitted
  Analyzing --> Asking: follow_up (k < 2, guard ok)
  Analyzing --> Asking: move_on → next planned question
  Analyzing --> Completed: no questions left
  Asking --> Completed: candidate ends early
  Completed --> Reported: report() (cached)
  Reported --> [*]
```

---

## 5. Where SOLID shows up

| Principle | Where | What it buys us |
|---|---|---|
| **S**ingle responsibility | `QuestionPlanner`, `AnswerAnalyzer`, `ReportWriter` each do one job. `prompts/` holds only prompt text. `InterviewService` only sequences. `useRecorder`, `useInterviewFlow` and `Avatar` are separate client concerns | Prompts can be tuned without touching control flow. Each piece is testable alone |
| **O**pen/closed | `CachingSpeechSynthesizer` decorates any TTS. New avatar engines implement `AvatarEngine`. New TTS providers (ElevenLabs) are added without editing the service | Features are added by writing new classes, not by editing old ones |
| **L**iskov substitution | `HeuristicLLM` ↔ `OpenAIStructuredLLM`. `simliEngine` ↔ `talkingHeadEngine` ↔ `faceEngine`. `ElevenLabs` ↔ `OpenAI` TTS | Offline mode, tests and fallbacks reuse the exact same flow |
| **I**nterface segregation | Small ports (`SpeechSynthesizer` has 1 method, `ContentModerator` has 1) instead of one "AIProvider" | Adapters implement only what they need |
| **D**ependency inversion | `application/` depends on `ports/`. Only `container.ts` imports concrete classes | Swap OpenAI→other, memory→Postgres in one file |

---

## 6. Guardrail map (defence in depth)

| Threat | Layer 1 (prompt) | Layer 2 (code) | Layer 3 (output) |
|---|---|---|---|
| Protected-topic questions | `ProtectedTopicGuard.promptRule` in planner/analyser prompts | Regex guard on every planned question → repair retry → drop | TTS only speaks **approved utterance ids**, never arbitrary text |
| Hidden instruction in profile (cand_004) | Bio fenced in `<untrusted>` + rule | `PromptInjectionDetector` on bio → session flag + log | Report adds the flag + a concern. Scores capped without evidence |
| Manipulative answers | Answer fenced + "score only genuine content" | Detector + analyser `injection_attempt` → turn flag | Quote grounding: no verbatim evidence means a competency scores ≤ 2 |
| Fabricated evidence | "quotes must be verbatim" | `quoteGrounding` drops quotes not found in the transcript | ajv validation against the official schema |
| Runaway follow-ups | "max 2" in prompt | `FollowUpPolicy` hard cap + logged override | — |
| Toxic content | — | `omni-moderation-latest` (free) | Flag in report |

---

## 7. Who sees what

```mermaid
flowchart LR
  R["Recruiter<br/>/ · /interviews/:id · /report/:id"] -- "RecruiterView<br/>(plan, scores, reasoning, integrity)" --- API
  C["Candidate<br/>/i/:token"] -- "CandidateView<br/>(questions + own answers only)" --- API
  C -- "integrity events (metadata)" --> API
  API["Route handlers"] --> S["InterviewService"]
  S --> DB[("Supabase: interviews (JSONB, versioned)<br/>proctoring_events (append-only)<br/>Storage: interview-recordings (private, 5 s chunks)")]
```

## 8. File index (where to look)

| Concern | File |
|---|---|
| Domain types | `src/domain/types.ts` |
| Follow-up cap | `src/domain/followUpPolicy.ts` |
| Quote grounding | `src/domain/quoteGrounding.ts` |
| Ports | `src/ports/index.ts` |
| Planner / Analyzer / Writer | `src/application/agents/*.ts` |
| LLM output schemas (zod) | `src/application/agents/schemas.ts` |
| Prompts | `src/application/prompts/index.ts` |
| Guardrails | `src/application/guardrails/*.ts` |
| State machine | `src/application/interviewService.ts` |
| Wiring | `src/container.ts` |
| OpenAI / ElevenLabs adapters | `src/infrastructure/openai/*`, `src/infrastructure/elevenlabs/*` |
| Avatar engines (Simli / TalkingHead / 2D) | `src/components/interview/avatar/*` |
| Avatar session token (keeps the Simli key server-side) | `src/infrastructure/simli/simliSessionIssuer.ts`, `src/app/api/avatar/session/route.ts` |
| Conversation loop (client) | `src/hooks/useInterviewFlow.ts` |
| Simulated run → `/outputs` | `scripts/simulate.ts` |
| Recruiter vs candidate read models | `src/application/views.ts` |
| Integrity rules (domain) | `src/domain/proctoring.ts` |
| Face model + sustained-violation rules | `src/components/interview/proctoring/*` |
| Proctoring hook (browser signals, warnings, batching) | `src/hooks/useProctoring.ts` |
| Supabase repositories + SQL | `src/infrastructure/supabase/*`, `supabase/migrations/*` |
| Interview recording (consent, chunked upload, playback) | `src/domain/recording.ts`, `components/interview/recording/sessionRecorder.ts`, `hooks/useSessionRecording.ts`, `components/recruiter/RecordingPlayer.tsx`, `RecordingStore` port + memory/Supabase adapters |
| Tests | `tests/*.test.ts` |
