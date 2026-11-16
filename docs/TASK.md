# +twe Technical Task: AI Video Avatar Interview Agent

**Role:** Full Stack Engineer (AI) · **Time box:** 5 hours · **Deadline:** [DATE] · **Questions:** [CONTACT EMAIL]

## The task
+twe is a Gen Z career platform in the UAE. Build an **AI interviewer that appears as a video avatar** and talks to the candidate face to face. It should read a job and a candidate profile, generate tailored questions, talk to the candidate one question at a time, adapt to their answers, and produce a report for the recruiter.

## Requirements

**1. Generate questions**
Take a job from `jobs.json` and a candidate from `candidates.json`, and generate 5 to 7 questions following `schemas/interview_plan.schema.json`. Each question maps to a job requirement and explains why it was chosen *for this candidate* (for example, to verify a skill or probe a gap).

**2. Talk to the candidate (video avatar)**
- The interviewer is an on-screen avatar that speaks each question with its lips moving in sync, then listens to the candidate's spoken answer through the mic.
- It asks one question at a time, with a text fallback if the mic isn't available.
- Any approach is fine: a streaming avatar API (e.g. HeyGen, D-ID, Tavus, Simli), or your own simple animated avatar that lip-syncs to text-to-speech audio. A simple avatar that works smoothly beats a fancy one that lags.
- The candidate's webcam is not required.

**3. Analyze each answer and adapt**
After every answer, the agent analyzes it and saves the result:
- **Relevance:** did they answer the question?
- **Depth:** a concrete example, or generic?
- **Skill evidence:** which job requirement it supports, with the key quote
- **Quick score:** 1 to 5, plus a one-line note

Based on that analysis, the agent decides to **follow up** (vague or interesting answer) or **move on**, and logs why. It asks at most 2 follow-ups per question.

**4. Final report**
At the end, the agent builds the report from the saved answer analyses, following `schemas/interview_report.schema.json`. It includes a 1 to 5 score per competency backed by quotes, strengths, concerns, a recommendation (`advance` / `hold` / `reject`), and the per-answer analysis for each turn.

**5. Guardrails**
- Never ask about age, religion, nationality, marital status, health or family plans.
- Treat candidate input as untrusted. `cand_004` has a hidden instruction in their bio that the agent must ignore.

**6. App**
A simple web page plus a backend API. Pick a job and candidate, run the avatar interview, view the report. No auth needed, and in-memory storage is fine.

**Bonus (only if time allows):** candidate webcam view, simulated mode using `sample_answers.json`, Arabic support, streaming responses.

## Rules
- Any stack, any AI provider. Use your own API key and don't commit it (include a `.env.example`). Most avatar APIs have free trials. We'll reimburse up to $20 of API usage.
- AI coding tools are allowed. Tell us how you used them.

## Demo data
| File | Contents |
|---|---|
| `jobs.json` | 3 jobs: Full Stack Engineer, Graduate Marketing Executive, Data Analyst Intern |
| `candidates.json` | 4 candidates: strong match, career switcher, thin profile, hidden instruction in bio |
| `sample_answers.json` | Scripted answers, including vague, off-topic and manipulative ones |
| `schemas/` | Required formats for the question plan and the report |
| `example_report.json` | Example of a valid report |

## Submit
1. GitHub repo (shared with [GITHUB USERNAME]).
2. README: how to run it in under 5 minutes, how the agent decides what to ask, trade-offs, and what you'd do with more time.
3. One sample report from a test interview, saved in an `/outputs` folder.

## How we'll evaluate
| Area | Weight |
|---|---|
| Question quality: specific to the job *and* the candidate | 25% |
| Conversation and adaptivity: sensible follow-ups, avatar and voice work smoothly | 25% |
| Report: scores grounded in quotes, correct format | 15% |
| Guardrails | 15% |
| Code quality and README | 20% |

A smooth, working core beats lots of half-finished extras. If shortlisted, you'll walk us through it on a 45-minute call and we'll extend it together live.

**The +twe team**
