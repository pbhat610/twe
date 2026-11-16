import type { Candidate, Job, PlannedQuestion } from "@/domain/types";
import type { StructuredLLM } from "@/ports";
import type { ProtectedTopicGuard } from "../guardrails/protectedTopicGuard";
import { MAX_QUESTIONS, MIN_QUESTIONS, normaliseQuestions, planProblems, questionProblems } from "../planRules";
import { plannerPrompt } from "../prompts";
import { PlanOutput } from "./schemas";

export interface PlanDraft {
  candidate_summary: string;
  questions: PlannedQuestion[];
  /** Problems still present after the repair round (shown to the recruiter). */
  warnings: string[];
}

/**
 * Requirement 1: 5–7 questions tailored to the job AND the candidate, each
 * mapped to requirement ids with a rationale.
 *
 * Draft → check with the shared plan rules → one repair round with the
 * problems fed back → drop anything still unsafe. The recruiter then edits
 * the draft before the interview is created.
 */
export class QuestionPlanner {
  constructor(
    private readonly llm: StructuredLLM,
    private readonly guard: ProtectedTopicGuard,
  ) {}

  /** Role-based when `candidate` is null (an assessment); tailored when given. */
  async draft(job: Job, candidate: Candidate | null, count: number = MAX_QUESTIONS - 1): Promise<PlanDraft> {
    const want = Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, count));
    const countProblem = (n: number) => (n !== want ? [`Write exactly ${want} questions (you wrote ${n}).`] : []);
    let out = await this.ask(job, candidate, want);
    let problems = [...countProblem(out.questions.length), ...planProblems(job, out.questions, this.guard, { requireMustHaves: true })];

    if (problems.length) {
      out = await this.ask(job, candidate, want, problems);
      problems = planProblems(job, out.questions, this.guard, { requireMustHaves: true });
    }

    // Never pass on a question that is unsafe or unmapped, even after repair.
    const safe = out.questions.filter((q) => questionProblems(job, q, this.guard).length === 0).slice(0, want);
    if (safe.length < MIN_QUESTIONS) {
      throw new Error(`The planner could only produce ${safe.length} usable questions; please try again or write them yourself.`);
    }

    return {
      candidate_summary: out.candidate_summary.trim(),
      questions: normaliseQuestions(safe),
      warnings: planProblems(job, safe, this.guard, { requireMustHaves: true }),
    };
  }

  private ask(job: Job, candidate: Candidate | null, count: number, repairNotes?: string[]) {
    return this.llm.generate({
      name: "interview_plan",
      schema: PlanOutput,
      system: plannerPrompt.system,
      user: plannerPrompt.user(job, candidate, count, repairNotes),
      context: { job_id: job.job_id, candidate_id: candidate?.candidate_id ?? "", count, repair: repairNotes?.length ?? 0 },
    });
  }
}
