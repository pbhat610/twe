import { clampConfig, type Assessment, type AssessmentConfig } from "@/domain/assessment";
import type { Job, PlannedQuestion } from "@/domain/types";
import type { AssessmentRepository, Clock, IdGenerator } from "@/ports";
import type { JobWriter } from "./agents/jobWriter";
import type { QuestionPlanner } from "./agents/questionPlanner";
import { BadRequestError, ConflictError, NotFoundError } from "./errors";
import type { ProtectedTopicGuard } from "./guardrails/protectedTopicGuard";
import { assignRequirementIds, jobProblems } from "./jobRules";
import { normaliseQuestions, planProblems, type QuestionInput } from "./planRules";

const MIN_JD_CHARS = 40;

export interface AssessmentDraft {
  /** Reserved id; send it back on save so requirement ids stay stable. */
  assessment_id: string;
  job: Job;
  questions: PlannedQuestion[];
  removed_criteria: string[];
  assumptions: string[];
  warnings: string[];
}

export interface AssessmentInput {
  assessment_id?: string;
  title: string;
  jd_text: string;
  job: Job;
  questions: QuestionInput[];
  config: Partial<AssessmentConfig>;
}

/**
 * Video assessments: paste a JD → the AI structures it and drafts N
 * role-based questions → the recruiter edits → save. Candidates are invited
 * later (InterviewService.create), so nothing here is candidate-specific.
 */
export class AssessmentService {
  constructor(
    private readonly d: {
      assessments: AssessmentRepository;
      jobWriter: JobWriter;
      planner: QuestionPlanner;
      topicGuard: ProtectedTopicGuard;
      clock: Clock;
      ids: IdGenerator;
    },
  ) {}

  list() {
    return this.d.assessments.list();
  }

  async get(id: string): Promise<Assessment> {
    const a = await this.d.assessments.get(id);
    if (!a) throw new NotFoundError("Assessment");
    return a;
  }

  /** AI: structure the JD and draft questions. Nothing is saved. */
  async draft(input: { title: string; jd_text: string; max_questions?: number; assessment_id?: string }): Promise<AssessmentDraft> {
    if (input.jd_text.trim().length < MIN_JD_CHARS) throw new BadRequestError("Paste the job description (at least a few lines).");
    const id = input.assessment_id ?? this.d.ids.next("asmt");
    const config = clampConfig({ max_questions: input.max_questions });

    const role = await this.d.jobWriter.draft(input.jd_text);
    const job: Job = {
      ...role.job,
      job_id: id,
      title: input.title.trim() || role.job.title,
      requirements: assignRequirementIds(role.job, id),
      source: "recruiter",
    };
    if (!job.requirements.must_have.length) throw new BadRequestError("Couldn't find any requirements in that JD. Add a few lines about the skills you need.");

    const plan = await this.d.planner.draft(job, null, config.max_questions);
    return {
      assessment_id: id,
      job,
      questions: plan.questions,
      removed_criteria: role.removed_criteria,
      assumptions: role.assumptions,
      warnings: plan.warnings,
    };
  }

  /** Create or update. The recruiter's questions are validated with the same rules as the AI's. */
  async save(input: AssessmentInput): Promise<Assessment> {
    const previous = input.assessment_id ? await this.d.assessments.get(input.assessment_id) : undefined;
    if (previous?.source === "seed") throw new ConflictError("Demo assessments are read-only. Create a new one instead.");

    const id = input.assessment_id ?? this.d.ids.next("asmt");
    const title = input.title.trim();
    if (!title) throw new BadRequestError("Give the assessment a title.");
    // Keep requirement ids the questions already reference; give new requirements fresh ids.
    const job: Job = {
      ...input.job,
      job_id: id,
      title: input.job.title?.trim() || title,
      requirements: assignRequirementIds(input.job, id, input.job),
      source: "recruiter",
    };
    const jobIssues = jobProblems(job, this.d.topicGuard);
    if (jobIssues.length) throw new BadRequestError(jobIssues.join(" "));
    const questionIssues = planProblems(job, input.questions, this.d.topicGuard);
    if (questionIssues.length) throw new BadRequestError(questionIssues.join(" "));

    const now = this.d.clock.now().toISOString();
    const assessment: Assessment = {
      assessment_id: id,
      title,
      jd_text: input.jd_text.trim(),
      job,
      questions: normaliseQuestions(input.questions),
      config: clampConfig(input.config),
      source: "recruiter",
      created_at: previous?.created_at ?? now,
      updated_at: now,
    };
    await this.d.assessments.save(assessment);
    return assessment;
  }
}
