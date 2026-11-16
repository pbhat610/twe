import type { OverallScore } from "./scoring";
/**
 * Domain model. Pure data shapes with no framework or I/O dependencies.
 * Job, candidate, plan and report mirror the official demo data and the JSON
 * schemas in /data/schemas, so they validate against the contract with no
 * mapping layer in between.
 */

// ── Jobs (data/jobs.json shape) ──────────────────────────────────────────

export interface RequirementItem {
  id: string;
  skill: string;
  detail?: string;
}

export const REQUIREMENT_GROUPS = ["must_have", "nice_to_have", "soft_skills"] as const;
export type RequirementGroup = (typeof REQUIREMENT_GROUPS)[number];

export interface Job {
  job_id: string;
  title: string;
  company: { name: string; industry?: string; size?: string; about?: string };
  location: string;
  work_mode?: string;
  employment_type?: string;
  experience_level?: string;
  salary_range_aed_monthly?: { min: number; max: number } | null;
  description: string;
  responsibilities: string[];
  requirements: Record<RequirementGroup, RequirementItem[]>;
  screening_focus?: string[];
  interview_language?: string;
  /** "seed" = data/jobs.json (read-only); "recruiter" = created in the app. */
  source?: "seed" | "recruiter";
  created_at?: string;
  updated_at?: string;
}

/** Every requirement with its group, in a stable order. */
export interface FlatRequirement extends RequirementItem {
  group: RequirementGroup;
}

export function flatRequirements(job: Job): FlatRequirement[] {
  return REQUIREMENT_GROUPS.flatMap((group) => (job.requirements[group] ?? []).map((r) => ({ ...r, group })));
}

// ── Candidates (data/candidates.json shape) ──────────────────────────────

export interface Candidate {
  candidate_id: string;
  /** Grader hint in the demo data. Never shown to the LLM or the candidate. */
  persona_note?: string;
  name: string;
  headline: string;
  location: string;
  education: {
    institution: string;
    degree: string;
    graduation_year?: number;
    gpa?: string | null;
    relevant_courses?: string[];
  }[];
  experience: { title: string; company: string; start?: string; end?: string; summary: string }[];
  projects: { name: string; description: string; link?: string }[];
  extracurriculars?: { role: string; organisation: string; summary: string }[];
  skills: string[];
  languages?: string[];
  bio: string;
  // Added by the app (not in the demo file): contact details and a short summary,
  // extracted from an uploaded resume or entered by the recruiter.
  email?: string;
  phone?: string;
  current_title?: string;
  summary?: string;
  source?: "seed" | "import" | "resume";
  created_at?: string;
}

// ── Interview plan (schemas/interview_plan.schema.json) ──────────────────

export const QUESTION_TYPES = ["technical", "behavioral", "situational", "motivation"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface PlannedQuestion {
  question_id: string;
  question: string;
  competency: string;
  requirement_ids: string[];
  rationale: string;
  difficulty: Difficulty;
  type: QuestionType;
}

export interface InterviewPlan {
  interview_id: string;
  job_id: string;
  candidate_id: string;
  created_at: string;
  candidate_summary: string;
  questions: PlannedQuestion[];
}

// ── Per-answer analysis (report turns[].analysis) ────────────────────────

export type Relevance = "on_topic" | "partial" | "off_topic" | "no_answer";
export type Depth = "specific_example" | "general" | "vague";
export type Decision = "follow_up" | "move_on" | "end";

/** What the analyser saves after every answer (requirement 3). */
export interface AnswerAnalysis {
  relevance: Relevance;
  depth: Depth;
  requirement_ids: string[];
  /** Verbatim from the answer (checked in code), or null if none. */
  key_quote: string | null;
  /** 1–5, or null when there is nothing to score (e.g. empty answer). */
  score: number | null;
  note: string;
}

export interface Turn {
  turn_id: string;
  question_id: string;
  /** The bare question. */
  question: string;
  /** Full line the avatar speaks: optional acknowledgement/intro + question. */
  spoken_text: string;
  /** Id of the approved utterance the TTS endpoint is allowed to speak. */
  utterance_id: string;
  is_follow_up: boolean;
  follow_up_index: number;
  answer?: string;
  analysis?: AnswerAnalysis;
  decision?: Decision;
  decision_reason?: string;
  /** Guardrail events observed on this turn (injection, moderation…). */
  flags: string[];
  answered_via?: "voice" | "text" | "simulated";
}

export type SessionStatus = "invited" | "in_progress" | "completed";

export interface AgentLogEntry {
  at: string;
  turn_id?: string;
  kind: "plan" | "analysis" | "decision" | "guardrail" | "policy_override" | "report" | "edit";
  message: string;
}

export interface InterviewSession {
  /** Recruiter-side id (dashboard, report). Also the plan's interview_id. */
  id: string;
  /** The assessment this interview was created from (absent for older interviews). */
  assessment_id?: string;
  /** Call length limit; the countdown starts when the candidate joins. */
  duration_seconds?: number;
  /** started_at + duration: after this, the interview wraps up after the current answer. */
  deadline_at?: string;
  /** Secret token in the candidate's link. Never reveals recruiter data. */
  invite_token: string;
  /** Optimistic-concurrency counter, bumped on every save. */
  version: number;
  job: Job;
  candidate: Candidate;
  plan: InterviewPlan;
  turns: Turn[];
  /** Index into plan.questions of the question currently being discussed. */
  cursor: number;
  status: SessionStatus;
  log: AgentLogEntry[];
  /** Session-level guardrail events (e.g. injection found in the candidate profile). */
  flags: string[];
  /** Every line the avatar may speak, keyed by id. TTS only reads from here. */
  utterances: Record<string, string>;
  closing_utterance_id?: string;
  report?: InterviewReport;
  created_at: string;
  started_at?: string;
  /** When the candidate agreed to video + audio recording (required to join). */
  recording_consent_at?: string;
  completed_at?: string;
}

// ── Report (schemas/interview_report.schema.json) ────────────────────────

export type Recommendation = "advance" | "hold" | "reject";
export type Confidence = "low" | "medium" | "high";
export type ReportFlagType = "injection_attempt" | "off_topic" | "empty_answer" | "inappropriate" | "other";

export interface CompetencyScore {
  competency: string;
  requirement_ids: string[];
  /** null when there isn't enough evidence. */
  score: number | null;
  evidence: string[];
  notes: string;
}

export interface ReportTurn {
  turn: number;
  question_id: string | null;
  agent_message: string;
  candidate_answer: string;
  analysis: AnswerAnalysis;
  decision: Decision;
  decision_reason: string;
}

export interface InterviewReport {
  interview_id: string;
  job_id: string;
  candidate_id: string;
  completed_at: string;
  competencies: CompetencyScore[];
  overall: {
    strengths: string[];
    concerns: string[];
    recommendation: Recommendation;
    confidence: Confidence;
    summary: string;
    suggested_next_round_focus: string[];
    /** Weighted 0-100 score from src/domain/scoring.ts (extra field; the official schema allows it). */
    score?: OverallScore;
  };
  flags: { type: ReportFlagType; detail: string }[];
  turns: ReportTurn[];
  /** Where the recruiter can watch the recording (extra field). */
  recording?: { path: string; consented: boolean };
}
