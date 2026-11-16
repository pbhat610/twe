import type { Job, RequirementItem } from "@/domain/types";
import type { StructuredLLM } from "@/ports";
import type { ProtectedTopicGuard } from "../guardrails/protectedTopicGuard";
import { jobWriterPrompt } from "../prompts";
import { JobDraftOutput } from "./schemas";

const MAX_BRIEF_CHARS = 12_000;

export interface JobDraft {
  /** Ready to edit: same shape as data/jobs.json, without the id. */
  job: Omit<Job, "job_id">;
  removed_criteria: string[];
  assumptions: string[];
}

/**
 * Turns a pasted job ad or rough notes into a structured job the recruiter
 * then edits. Discriminatory criteria are dropped (by the prompt, and again
 * here by the protected-topic guard) and reported back, never silently kept.
 */
export class JobWriter {
  constructor(
    private readonly llm: StructuredLLM,
    private readonly guard: ProtectedTopicGuard,
  ) {}

  async draft(brief: string): Promise<JobDraft> {
    const out = await this.llm.generate({
      name: "job_draft",
      schema: JobDraftOutput,
      system: jobWriterPrompt.system,
      user: jobWriterPrompt.user(brief.slice(0, MAX_BRIEF_CHARS)),
      context: { brief: brief.slice(0, MAX_BRIEF_CHARS) },
    });

    const removed = [...out.removed_criteria];
    const clean = (items: JobDraftOutput["must_have"]): RequirementItem[] =>
      items
        .filter((r) => {
          const ok = this.guard.check(`${r.skill} ${r.detail ?? ""}`).ok;
          if (!ok) removed.push(r.skill);
          return ok && r.skill.trim();
        })
        .map((r, i) => ({ id: `draft_${i}`, skill: r.skill.trim(), ...(r.detail?.trim() ? { detail: r.detail.trim() } : {}) }));

    const salary =
      out.salary_min_aed_monthly && out.salary_max_aed_monthly
        ? { min: out.salary_min_aed_monthly, max: out.salary_max_aed_monthly }
        : null;

    return {
      job: {
        title: out.title.trim(),
        company: {
          name: out.company.name.trim(),
          ...(out.company.industry ? { industry: out.company.industry } : {}),
          ...(out.company.size ? { size: out.company.size } : {}),
          ...(out.company.about ? { about: out.company.about } : {}),
        },
        location: out.location.trim(),
        ...(out.work_mode ? { work_mode: out.work_mode } : {}),
        ...(out.employment_type ? { employment_type: out.employment_type } : {}),
        ...(out.experience_level ? { experience_level: out.experience_level } : {}),
        salary_range_aed_monthly: salary,
        description: out.description.trim(),
        responsibilities: out.responsibilities.map((r) => r.trim()).filter(Boolean),
        requirements: {
          must_have: clean(out.must_have),
          nice_to_have: clean(out.nice_to_have),
          soft_skills: clean(out.soft_skills),
        },
        screening_focus: out.screening_focus,
        interview_language: out.interview_language || "English",
        source: "recruiter",
      },
      removed_criteria: [...new Set(removed)],
      assumptions: out.assumptions,
    };
  }
}
