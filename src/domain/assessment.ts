import type { Job, PlannedQuestion } from "./types";

/**
 * A video assessment: a role (the pasted JD, structured by the AI into
 * requirements) plus the recruiter-approved questions and call settings.
 * Candidates are invited to it; each invite becomes one interview.
 */
export interface AssessmentConfig {
  /** How many questions the AI drafts (the official plan schema allows 5–7). */
  max_questions: number;
  /** Total call length; the candidate sees a countdown and the server enforces it. */
  duration_minutes: number;
}

export interface Assessment {
  assessment_id: string;
  title: string;
  /** The JD exactly as the recruiter pasted it. */
  jd_text: string;
  /** Structured version of the JD (same shape as data/jobs.json): requirements power mapping and the report. */
  job: Job;
  questions: PlannedQuestion[];
  config: AssessmentConfig;
  source: "seed" | "recruiter";
  created_at: string;
  updated_at: string;
}

export const QUESTION_COUNT = { min: 5, max: 7, default: 6 } as const;
export const DURATION_MINUTES = { min: 5, max: 60, default: 15 } as const;

export function clampConfig(c: Partial<AssessmentConfig>): AssessmentConfig {
  const q = Math.round(c.max_questions ?? QUESTION_COUNT.default);
  const d = Math.round(c.duration_minutes ?? DURATION_MINUTES.default);
  return {
    max_questions: Math.min(QUESTION_COUNT.max, Math.max(QUESTION_COUNT.min, q)),
    duration_minutes: Math.min(DURATION_MINUTES.max, Math.max(DURATION_MINUTES.min, d)),
  };
}
