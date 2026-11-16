import type { AgentLogEntry, Candidate, Decision, InterviewReport, InterviewSession, Turn } from "@/domain/types";
import { FollowUpPolicy } from "@/domain/followUpPolicy";
import { applyScoring } from "@/domain/scoring";
import {
  MAX_CHUNKS,
  MAX_CHUNK_BYTES,
  RECORDING_TIMESLICE_MS,
  UPLOAD_GRACE_MS,
  type RecordingContentType,
  type RecordingManifest,
} from "@/domain/recording";
import { PROCTORING_EVENTS, summarizeProctoring, type ProctoringEvent, type ProctoringEventType } from "@/domain/proctoring";
import type {
  AssessmentRepository,
  CandidateRepository,
  Clock,
  ContentModerator,
  IdGenerator,
  ProctoringRepository,
  RecordingStore,
  SchemaValidator,
  SessionRepository,
  SessionSummary,
  SpeechSynthesizer,
} from "@/ports";
import type { AnswerAnalyzer, AnalyzerResult } from "./agents/answerAnalyzer";
import type { ReportWriter } from "./agents/reportWriter";
import { BadRequestError, ConflictError, NotFoundError } from "./errors";
import { PromptInjectionDetector } from "./guardrails/promptInjection";
import { ProtectedTopicGuard } from "./guardrails/protectedTopicGuard";
import { normaliseQuestions, planProblems, type QuestionInput } from "./planRules";
import { scripts } from "./prompts";
import { toCandidateView, toRecruiterView, type CandidateView, type RecruiterView } from "./views";

const MAX_ANSWER_CHARS = 4000;

export interface InterviewServiceDeps {
  assessments: AssessmentRepository;
  candidates: CandidateRepository;
  sessions: SessionRepository;
  proctoring: ProctoringRepository;
  recordings: RecordingStore;
  analyzer: AnswerAnalyzer;
  reporter: ReportWriter;
  policy: FollowUpPolicy;
  topicGuard: ProtectedTopicGuard;
  injection: PromptInjectionDetector;
  moderator: ContentModerator;
  validator: SchemaValidator;
  /** Optional: used only to pre-warm audio for the next line (latency). */
  speech?: SpeechSynthesizer;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Application service: the interview state machine.
 *
 *   create (assessment + candidate → private link)
 *     → updatePlan any time for questions not yet asked
 *   interview: join → [ask → answer → analyse → policy → follow-up | next | end]* → complete → report
 *
 * Recruiter operations take ids; candidate operations take the invite token
 * and only ever return the redacted CandidateView.
 */
export class InterviewService {
  constructor(private readonly d: InterviewServiceDeps) {}

  // ── Interviews (recruiter) ──────────────────────────────────────────────

  /**
   * Invite one candidate to an assessment: their interview uses the
   * assessment's approved questions and call length, and a private link.
   */
  async create(assessmentId: string, candidateId: string): Promise<RecruiterView> {
    const [assessment, candidate] = await Promise.all([this.d.assessments.get(assessmentId), this.d.candidates.get(candidateId)]);
    if (!assessment) throw new NotFoundError("Assessment");
    if (!candidate) throw new NotFoundError("Candidate");
    const job = assessment.job;
    const problems = planProblems(job, assessment.questions, this.d.topicGuard);
    if (problems.length) throw new BadRequestError(problems.join(" "));

    const id = this.d.ids.next("int");
    const session: InterviewSession = {
      id,
      assessment_id: assessment.assessment_id,
      duration_seconds: assessment.config.duration_minutes * 60,
      invite_token: this.d.ids.secret(),
      version: 0,
      job,
      candidate,
      plan: {
        interview_id: id,
        job_id: job.job_id,
        candidate_id: candidate.candidate_id,
        created_at: this.now(),
        candidate_summary: summaryOf(candidate),
        questions: normaliseQuestions(assessment.questions),
      },
      turns: [],
      cursor: 0,
      status: "invited",
      log: [],
      flags: [],
      utterances: {},
      created_at: this.now(),
    };
    this.validatePlan(session);

    const injection = this.d.injection.detect(`${candidate.bio}\n${candidate.summary ?? ""}`);
    if (injection.detected) {
      session.flags.push("prompt_injection:candidate_profile");
      this.log(session, "guardrail", `Ignored instructions found in candidate profile: "${injection.matches.join('", "')}"`);
    }
    this.log(session, "plan", `Created from assessment "${assessment.title}" (${session.plan.questions.length} questions, ${assessment.config.duration_minutes} min).`);

    await this.d.sessions.save(session);
    return toRecruiterView(session);
  }

  /**
   * Recruiter edits the plan at any time. Questions already asked (and the
   * one being asked now) are locked; everything after can be edited, added,
   * removed or reordered. Completed interviews can't change.
   */
  async updatePlan(sessionId: string, edited: { candidate_summary?: string; questions: QuestionInput[] }): Promise<RecruiterView> {
    const session = await this.load(sessionId);
    if (session.status === "completed") throw new ConflictError("This interview has finished; its questions can't change.");

    const lockedCount = session.status === "in_progress" ? session.cursor + 1 : 0;
    const locked = session.plan.questions.slice(0, lockedCount);
    const lockedIds = new Set(locked.map((q) => q.question_id));
    const editable = edited.questions.filter((q) => !q.question_id || !lockedIds.has(q.question_id));
    const merged = [...locked, ...normaliseQuestions(editable, lockedIds)];

    const problems = planProblems(session.job, merged, this.d.topicGuard);
    if (problems.length) throw new BadRequestError(problems.join(" "));

    session.plan = {
      ...session.plan,
      candidate_summary: edited.candidate_summary?.trim() ?? session.plan.candidate_summary,
      questions: merged,
    };
    this.validatePlan(session);
    this.log(session, "edit", `Recruiter updated the plan (${merged.length} questions, ${lockedCount} locked).`);
    await this.d.sessions.save(session);
    return toRecruiterView(session, await this.d.proctoring.list(session.id));
  }

  async get(sessionId: string): Promise<RecruiterView> {
    const session = await this.load(sessionId);
    return toRecruiterView(session, await this.d.proctoring.list(session.id));
  }

  list(limit?: number): Promise<SessionSummary[]> {
    return this.d.sessions.list(limit);
  }

  async report(sessionId: string): Promise<InterviewReport> {
    const session = await this.load(sessionId);
    if (session.status !== "completed") throw new ConflictError("Interview is not finished yet");
    if (!session.turns.some((t) => t.analysis)) throw new ConflictError("No answers to report on");
    if (!session.report) {
      session.report = await this.d.reporter.write(session, await this.d.proctoring.list(session.id));
      const s = session.report.overall.score;
      this.log(session, "report", `Report generated: score ${s?.value ?? "?"}/100, ${session.report.overall.recommendation} (${session.report.overall.confidence} confidence)`);
      await this.d.sessions.save(session);
    }
    // Scores are re-derived with the current SCORING rules on every read, so a weight change
    // applies to past reports too. The recording link points at the report page's player.
    return { ...applyScoring(session.job, session.report), recording: { path: `/report/${session.id}#recording`, consented: Boolean(session.recording_consent_at) } };
  }

  /** Recruiter: ordered recording chunks with fetchable URLs. */
  async recording(sessionId: string): Promise<RecordingManifest> {
    const session = await this.load(sessionId);
    const { content_type, chunks } = await this.d.recordings.list(session.id);
    return {
      content_type,
      chunks,
      total_bytes: chunks.reduce((a, c) => a + c.bytes, 0),
      approx_seconds: Math.round((chunks.length * RECORDING_TIMESLICE_MS) / 1000),
    };
  }

  /** Recruiter: one chunk's bytes (playback for stores without signed URLs). */
  async recordingChunk(sessionId: string, seq: number) {
    const session = await this.load(sessionId);
    const chunk = await this.d.recordings.read(session.id, seq);
    if (!chunk) throw new NotFoundError("Recording chunk");
    return chunk;
  }

  // ── Candidate (by invite token) ─────────────────────────────────────────

  async view(token: string): Promise<CandidateView> {
    return toCandidateView(await this.loadByToken(token));
  }

  /**
   * Candidate opens the link and clicks Join. Idempotent. The interview is
   * recorded, so the first join requires explicit consent (stored with a timestamp).
   */
  async join(token: string, opts: { recordingConsent: boolean }): Promise<CandidateView> {
    const session = await this.loadByToken(token);
    if (session.status === "invited") {
      if (!opts.recordingConsent) throw new BadRequestError("Please agree to the interview being recorded to join");
      session.recording_consent_at = this.now();
      const first = session.plan.questions[0];
      session.status = "in_progress";
      session.started_at = this.now();
      if (session.duration_seconds) {
        session.deadline_at = new Date(this.d.clock.now().getTime() + session.duration_seconds * 1000).toISOString();
      }
      this.pushTurn(session, {
        question_id: first.question_id,
        question: first.question,
        spoken: `${scripts.intro(session.candidate.name, session.job.title, session.job.company.name, session.duration_seconds)} ${first.question}`,
        is_follow_up: false,
        follow_up_index: 0,
      });
      await this.d.sessions.save(session);
    }
    return toCandidateView(session);
  }

  async submitAnswer(token: string, turnId: string, rawAnswer: string, via: Turn["answered_via"] = "text"): Promise<CandidateView> {
    const session = await this.loadByToken(token);
    if (session.status === "invited") throw new ConflictError("Interview hasn't started yet");
    if (session.status !== "in_progress") throw new ConflictError("Interview already completed");

    const turn = session.turns[session.turns.length - 1];
    if (!turn || turn.turn_id !== turnId) throw new ConflictError("Answer is for a stale turn");
    if (turn.answer !== undefined) throw new ConflictError("Turn already answered");

    const answer = rawAnswer.trim().slice(0, MAX_ANSWER_CHARS);
    const planned = session.plan.questions[session.cursor];
    const thread = session.turns.filter((t) => t.question_id === planned.question_id);
    turn.answer = answer;
    turn.answered_via = via;

    const result = answer ? await this.analyse(session, turn, planned, thread, answer) : this.emptyAnswer(turn);

    // Follow-up text must clear the protected-topic guard before it can be spoken.
    let followUp = result.follow_up_question;
    if (followUp && !this.d.topicGuard.check(followUp).ok) {
      this.log(session, "guardrail", `Blocked follow-up touching a protected topic: "${followUp}"`, turn.turn_id);
      followUp = null;
    }

    const verdict = this.d.policy.decide(result.decision, turn.follow_up_index, Boolean(followUp));
    turn.analysis = result.analysis;
    turn.decision = verdict.decision;
    turn.decision_reason = verdict.override_reason
      ? `${result.decision_reason} Overridden: ${verdict.override_reason}`
      : result.decision_reason;

    const a = turn.analysis;
    this.log(session, "analysis", `${turn.turn_id}: ${a.score === null ? "no score" : `score ${a.score}/5`}, ${a.relevance}, ${a.depth}. ${a.note}`, turn.turn_id);
    if (verdict.override_reason) this.log(session, "policy_override", verdict.override_reason, turn.turn_id);
    this.log(session, "decision", `${DECISION_LABEL[verdict.decision]}: ${result.decision_reason}`, turn.turn_id);

    const ack = this.d.topicGuard.check(result.acknowledgement).ok ? result.acknowledgement : "Thank you.";
    this.advance(session, verdict.decision, followUp, ack, turn);

    await this.d.sessions.save(session);
    return toCandidateView(session);
  }

  /** Candidate ends early; the report covers what was answered. */
  async finish(token: string): Promise<CandidateView> {
    const session = await this.loadByToken(token);
    if (session.status === "in_progress") {
      const last = session.turns[session.turns.length - 1];
      if (last && last.answer === undefined) session.turns.pop();
      this.complete(session, "");
      await this.d.sessions.save(session);
    }
    return toCandidateView(session);
  }

  /**
   * Integrity signals from the candidate's browser. Severity, time and turn are
   * assigned server-side (not trusted from the client).
   */
  async recordProctoring(token: string, raw: { type: ProctoringEventType; detail?: string }[]) {
    const session = await this.loadByToken(token);
    if (session.status !== "in_progress" || raw.length === 0) {
      return summarizeProctoring(await this.d.proctoring.list(session.id));
    }
    const turn = session.turns[session.turns.length - 1];
    const events: ProctoringEvent[] = raw.slice(0, 20).map((e) => ({
      type: e.type,
      severity: PROCTORING_EVENTS[e.type].severity,
      at: this.now(),
      turn_id: turn?.turn_id,
      detail: e.detail?.slice(0, 120),
    }));
    await this.d.proctoring.append(session.id, events);
    return summarizeProctoring(await this.d.proctoring.list(session.id));
  }

  /**
   * One ordered slice of the candidate's recording. Accepted only after consent,
   * while the interview runs (plus a short grace period for the final flush).
   */
  async recordChunk(token: string, seq: number, data: ArrayBuffer, contentType: RecordingContentType) {
    const session = await this.loadByToken(token);
    if (!session.recording_consent_at) throw new ConflictError("Recording consent not given");
    if (session.status === "invited") throw new ConflictError("Interview hasn't started yet");
    if (session.status === "completed") {
      const doneAt = Date.parse(session.completed_at ?? "");
      if (!Number.isFinite(doneAt) || this.d.clock.now().getTime() - doneAt > UPLOAD_GRACE_MS) {
        throw new ConflictError("Interview has ended");
      }
    }
    if (!Number.isInteger(seq) || seq < 0 || seq >= MAX_CHUNKS) throw new BadRequestError("Invalid chunk index");
    if (data.byteLength === 0) throw new BadRequestError("Empty chunk");
    if (data.byteLength > MAX_CHUNK_BYTES) throw new BadRequestError("Chunk too large");
    await this.d.recordings.putChunk(session.id, seq, data, contentType);
  }

  /** Output guard: only lines the server approved can be voiced. */
  async utterance(token: string, utteranceId: string): Promise<string> {
    const session = await this.loadByToken(token);
    const text = session.utterances[utteranceId];
    if (!text) throw new NotFoundError("Utterance");
    return text;
  }

  /** Job vocabulary to bias speech recognition for this interview. */
  async keywords(token: string): Promise<string[]> {
    const { job } = await this.loadByToken(token);
    return [...job.requirements.must_have, ...job.requirements.nice_to_have].map((r) => r.skill);
  }

  /** What simulated mode needs to pick a scripted answer for the current question. */
  async simulationContext(token: string) {
    const s = await this.loadByToken(token);
    const turn = s.turns[s.turns.length - 1];
    const planned = s.plan.questions[s.cursor];
    return {
      candidateId: s.candidate.candidate_id,
      question: turn?.question ?? "",
      competency: planned?.competency ?? "",
      isFollowUp: Boolean(turn?.is_follow_up),
      questionNumber: s.cursor + 1,
      used: s.turns.map((t) => t.answer).filter((a): a is string => a !== undefined),
      previousAnswer: [...s.turns].reverse().find((t) => t.answer !== undefined)?.answer,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async analyse(session: InterviewSession, turn: Turn, planned: InterviewSession["plan"]["questions"][number], thread: Turn[], answer: string): Promise<AnalyzerResult> {
    // Guardrails run alongside the analysis to keep latency down.
    const injection = this.d.injection.detect(answer);
    let moderation, result: AnalyzerResult;
    try {
      [moderation, result] = await Promise.all([
        this.d.moderator.moderate(answer),
        this.d.analyzer.analyze({
          job: session.job,
          planned,
          thread,
          answer,
          followUpsSoFar: turn.follow_up_index,
          candidateSummary: session.plan.candidate_summary,
        }),
      ]);
    } catch (err) {
      // Release the turn so the candidate can retry instead of getting stuck.
      turn.answer = undefined;
      turn.answered_via = undefined;
      throw err;
    }

    if (injection.detected || result.injection_attempt) {
      turn.flags.push(`prompt_injection:${turn.turn_id}`);
      this.log(session, "guardrail", `Manipulation attempt ignored in ${turn.turn_id}${injection.matches.length ? `: "${injection.matches.join('", "')}"` : ""}`, turn.turn_id);
      // Never follow up on, or reward, a manipulation attempt.
      if (result.decision === "follow_up") result = { ...result, decision: "move_on", decision_reason: "Answer tried to instruct the interviewer; ignored and moving on." };
    }
    if (moderation.flagged) {
      turn.flags.push(`moderation:${turn.turn_id}:${moderation.categories.join("|")}`);
      this.log(session, "guardrail", `Moderation flagged answer (${moderation.categories.join(", ")})`, turn.turn_id);
    }
    if (result.dropped_quote) {
      this.log(session, "guardrail", "Dropped a key quote that wasn't verbatim in the answer", turn.turn_id);
    }
    return result;
  }

  /** No words at all: nothing to analyse or pay for. Record it and move on. */
  private emptyAnswer(turn: Turn): AnalyzerResult {
    turn.flags.push("empty_answer");
    return {
      analysis: { relevance: "no_answer", depth: "vague", requirement_ids: [], key_quote: null, score: null, note: "No answer given." },
      decision: "move_on",
      decision_reason: "Empty answer; moving on so the candidate can show evidence on the next question.",
      injection_attempt: false,
      follow_up_question: null,
      acknowledgement: scripts.emptyAnswer,
      dropped_quote: false,
    };
  }

  private advance(session: InterviewSession, decision: Decision, followUp: string | null, ack: string, turn: Turn) {
    const planned = session.plan.questions[session.cursor];
    if (this.timeIsUp(session) && decision !== "end") {
      this.log(session, "decision", "Time limit reached: wrapping up after this answer.", turn.turn_id);
      this.complete(session, ack, scripts.timeUp(session.candidate.name));
      session.flags.push("time_limit_reached");
    } else if (decision === "end") {
      this.complete(session, "", scripts.endedEarly(session.candidate.name));
    } else if (decision === "follow_up" && followUp) {
      this.pushTurn(session, {
        question_id: planned.question_id,
        question: followUp,
        spoken: `${ack} ${followUp}`,
        is_follow_up: true,
        follow_up_index: turn.follow_up_index + 1,
      });
    } else if (session.cursor + 1 < session.plan.questions.length) {
      session.cursor += 1;
      const next = session.plan.questions[session.cursor];
      this.pushTurn(session, {
        question_id: next.question_id,
        question: next.question,
        spoken: `${ack} ${next.question}`,
        is_follow_up: false,
        follow_up_index: 0,
      });
    } else {
      this.complete(session, ack);
    }
  }

  private timeIsUp(session: InterviewSession) {
    return Boolean(session.deadline_at) && this.d.clock.now().getTime() >= Date.parse(session.deadline_at!);
  }

  private validatePlan(session: InterviewSession) {
    const result = this.d.validator.validatePlan(session.plan);
    if (!result.valid) throw new BadRequestError(`Plan doesn't match the interview_plan schema: ${result.errors.join("; ")}`);
  }

  private async load(id: string) {
    const s = await this.d.sessions.get(id);
    if (!s) throw new NotFoundError("Interview");
    return s;
  }

  private async loadByToken(token: string) {
    const s = await this.d.sessions.getByInviteToken(token);
    if (!s) throw new NotFoundError("Interview link");
    return s;
  }

  private pushTurn(session: InterviewSession, t: { question_id: string; question: string; spoken: string; is_follow_up: boolean; follow_up_index: number }) {
    const utterance_id = this.approveUtterance(session, t.spoken);
    session.turns.push({
      turn_id: `t${session.turns.length + 1}`,
      question_id: t.question_id,
      question: t.question,
      spoken_text: t.spoken,
      utterance_id,
      is_follow_up: t.is_follow_up,
      follow_up_index: t.follow_up_index,
      flags: [],
    });
  }

  private complete(session: InterviewSession, ack: string, closing = scripts.closing(session.candidate.name)) {
    session.status = "completed";
    session.completed_at = this.now();
    session.closing_utterance_id = this.approveUtterance(session, `${ack} ${closing}`.trim());
  }

  private approveUtterance(session: InterviewSession, text: string): string {
    const id = this.d.ids.next("utt");
    session.utterances[id] = text;
    // Fire-and-forget pre-warm so audio is ready by the time the client asks.
    this.d.speech?.synthesize(text).catch(() => undefined);
    return id;
  }

  private log(session: InterviewSession, kind: AgentLogEntry["kind"], message: string, turn_id?: string) {
    session.log.push({ at: this.now(), kind, message, turn_id });
  }

  private now() {
    return this.d.clock.now().toISOString();
  }
}

/** What the AI knows about the candidate: their summary, else a line built from the profile. */
function summaryOf(c: Candidate): string {
  if (c.summary?.trim()) return c.summary.trim();
  const recent = c.experience[0];
  return [c.headline, recent ? `Recent: ${recent.title} at ${recent.company}.` : "", c.skills.length ? `Skills: ${c.skills.slice(0, 8).join(", ")}.` : ""]
    .filter(Boolean)
    .join(" ");
}

const DECISION_LABEL: Record<Decision, string> = { follow_up: "Follow up", move_on: "Move on", end: "End interview" };
