import type { AgentLogEntry, AnswerAnalysis, Decision, InterviewSession, Job, PlannedQuestion } from "@/domain/types";
import { summarizeProctoring, type ProctoringEvent, type ProctoringSummary } from "@/domain/proctoring";

/**
 * Two read models of one session (Interface Segregation for the API):
 *  - RecruiterView: everything (plan rationale, per-answer analysis, agent log).
 *  - CandidateView: only what the candidate may see. No scores, notes,
 *    rationales or reasoning ever leave the server through the candidate link.
 */

interface TurnBase {
  turn_id: string;
  question_id: string;
  question: string;
  spoken_text: string;
  utterance_id: string;
  is_follow_up: boolean;
  follow_up_index: number;
  question_number: number;
  answer?: string;
}

export interface RecruiterTurnView extends TurnBase {
  analysis?: AnswerAnalysis;
  decision?: Decision;
  decision_reason?: string;
  flags: string[];
}

export type CandidateTurnView = TurnBase;

interface ViewBase<T> {
  status: InterviewSession["status"];
  /** Call length in seconds; the countdown runs from started_at. */
  duration_seconds?: number;
  deadline_at?: string;
  /** Server clock when this view was built, so the browser can correct for skew. */
  server_now: string;
  job: { id: string; title: string; company: string };
  candidate: { id: string; name: string };
  total_questions: number;
  current_turn: T | null;
  turns: T[];
  closing_utterance_id?: string;
  closing_text?: string;
}

export interface RecruiterView extends ViewBase<RecruiterTurnView> {
  id: string;
  assessment_id?: string;
  invite_token: string;
  /** Requirements are needed by the recruiter's question editor. */
  role: Pick<Job, "job_id" | "title" | "requirements">;
  candidate: { id: string; name: string; headline: string };
  plan: PlannedQuestion[];
  candidate_summary: string;
  /** Questions already asked (plus the current one): shown read-only in the editor. */
  locked_questions: number;
  log: AgentLogEntry[];
  flags: string[];
  proctoring: ProctoringEvent[];
  proctoring_summary: ProctoringSummary;
  has_report: boolean;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface CandidateView extends ViewBase<CandidateTurnView> {
  token: string;
}

function baseTurns(s: InterviewSession): RecruiterTurnView[] {
  const indexOf = new Map(s.plan.questions.map((q, i) => [q.question_id, i + 1]));
  return s.turns.map((t) => ({
    turn_id: t.turn_id,
    question_id: t.question_id,
    question: t.question,
    spoken_text: t.spoken_text,
    utterance_id: t.utterance_id,
    is_follow_up: t.is_follow_up,
    follow_up_index: t.follow_up_index,
    question_number: indexOf.get(t.question_id) ?? 0,
    answer: t.answer,
    analysis: t.analysis,
    decision: t.decision,
    decision_reason: t.decision_reason,
    flags: t.flags,
  }));
}

function current<T extends { answer?: string }>(s: InterviewSession, turns: T[]): T | null {
  const last = turns[turns.length - 1];
  return s.status === "in_progress" && last && last.answer === undefined ? last : null;
}

function closing(s: InterviewSession) {
  return {
    duration_seconds: s.duration_seconds,
    deadline_at: s.deadline_at,
    server_now: new Date().toISOString(),
    closing_utterance_id: s.closing_utterance_id,
    closing_text: s.closing_utterance_id ? s.utterances[s.closing_utterance_id] : undefined,
  };
}

export function toRecruiterView(s: InterviewSession, proctoring: ProctoringEvent[] = []): RecruiterView {
  const turns = baseTurns(s);
  return {
    id: s.id,
    assessment_id: s.assessment_id,
    invite_token: s.invite_token,
    status: s.status,
    job: { id: s.job.job_id, title: s.job.title, company: s.job.company.name },
    role: { job_id: s.job.job_id, title: s.job.title, requirements: s.job.requirements },
    candidate: { id: s.candidate.candidate_id, name: s.candidate.name, headline: s.candidate.headline },
    plan: s.plan.questions,
    candidate_summary: s.plan.candidate_summary,
    locked_questions: s.status === "completed" ? s.plan.questions.length : s.status === "in_progress" ? s.cursor + 1 : 0,
    total_questions: s.plan.questions.length,
    current_turn: current(s, turns),
    turns,
    log: s.log,
    flags: s.flags,
    proctoring,
    proctoring_summary: summarizeProctoring(proctoring),
    has_report: Boolean(s.report),
    created_at: s.created_at,
    started_at: s.started_at,
    completed_at: s.completed_at,
    ...closing(s),
  };
}

export function toCandidateView(s: InterviewSession): CandidateView {
  // Explicitly rebuild each turn so analysis/flags can't leak by accident.
  const turns: CandidateTurnView[] = baseTurns(s).map((t) => ({
    turn_id: t.turn_id,
    question_id: t.question_id,
    question: t.question,
    spoken_text: t.spoken_text,
    utterance_id: t.utterance_id,
    is_follow_up: t.is_follow_up,
    follow_up_index: t.follow_up_index,
    question_number: t.question_number,
    answer: t.answer,
  }));
  return {
    token: s.invite_token,
    status: s.status,
    job: { id: s.job.job_id, title: s.job.title, company: s.job.company.name },
    candidate: { id: s.candidate.candidate_id, name: s.candidate.name },
    total_questions: s.plan.questions.length,
    current_turn: current(s, turns),
    turns,
    ...closing(s),
  };
}
