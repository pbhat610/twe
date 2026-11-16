import type { Assessment } from "@/domain/assessment";
import { flatRequirements, type Candidate, type Job, type PlannedQuestion } from "@/domain/types";
import rolePlans from "../../../fixtures/llm/role_plans.json";
import candidatesJson from "../../../data/candidates.json";
import jobsJson from "../../../data/jobs.json";

/**
 * The official demo data from the task brief (data/*.json), as the app's own
 * entities. Loaded into the database only on request (`npm run db:setup -- --demo`)
 * and into the in-memory stores used by tests and offline runs.
 */
export const SEED_JOBS: Job[] = (jobsJson as Job[]).map((j) => ({ ...j, source: "seed" as const }));
export const SEED_CANDIDATES: Candidate[] = (candidatesJson as Candidate[]).map((c) => ({ ...c, source: "seed" as const }));

/** A JD as a recruiter would paste it, rebuilt from the structured demo job. */
export function jdTextOf(job: Job): string {
  const reqs = flatRequirements(job)
    .map((r) => `- ${r.skill}${r.detail ? `: ${r.detail}` : ""} (${r.group.replace("_", " ")})`)
    .join("\n");
  return `${job.title} at ${job.company.name} · ${job.location}${job.work_mode ? ` · ${job.work_mode}` : ""}
${job.description}

Responsibilities:
${job.responsibilities.map((r) => `- ${r}`).join("\n")}

Requirements:
${reqs}`;
}

const SEEDED_AT = "2026-11-15T00:00:00.000Z";

/** One read-only demo assessment per official job, with Claude-written role-based questions. */
export const SEED_ASSESSMENTS: Assessment[] = SEED_JOBS.map((job) => {
  const plan = (rolePlans as unknown as Record<string, { questions: Omit<PlannedQuestion, "question_id">[] }>)[job.job_id];
  return {
    assessment_id: job.job_id,
    title: job.title,
    jd_text: jdTextOf(job),
    job,
    questions: plan.questions.map((q, i) => ({ ...q, question_id: `q${i + 1}` })),
    config: { max_questions: plan.questions.length, duration_minutes: 15 },
    source: "seed",
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  };
});
