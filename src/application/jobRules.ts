import { REQUIREMENT_GROUPS, type Job, type RequirementItem } from "@/domain/types";
import type { ProtectedTopicGuard } from "./guardrails/protectedTopicGuard";

/** A role as the recruiter submits it: requirement ids are optional (new items get one). */
export type JobInput = Omit<Job, "job_id" | "source" | "created_at" | "updated_at" | "requirements"> & {
  requirements: Record<(typeof REQUIREMENT_GROUPS)[number], (Omit<RequirementItem, "id"> & { id?: string })[]>;
};

/** Problems that block saving a role. Empty means it can be saved. */
export function jobProblems(job: JobInput, guard: ProtectedTopicGuard): string[] {
  const problems: string[] = [];
  if (!job.title?.trim()) problems.push("Add a job title.");
  if (!job.company?.name?.trim()) problems.push("Add the company name.");
  if (!job.location?.trim()) problems.push("Add a location.");
  if (!job.description?.trim()) problems.push("Add a short description.");
  if (!job.requirements?.must_have?.length) problems.push("Add at least one must-have requirement.");
  for (const group of REQUIREMENT_GROUPS) {
    for (const r of job.requirements?.[group] ?? []) {
      if (!r.skill?.trim()) problems.push(`A ${group.replace("_", "-")} requirement has no skill name.`);
      const topic = guard.check(`${r.skill} ${r.detail ?? ""}`);
      if (!topic.ok) problems.push(`"${r.skill}" screens on a protected characteristic (${topic.topics.join(", ")}); remove it.`);
    }
  }
  return problems;
}

/**
 * Give every requirement a stable id like the seed data's `req_001_3`.
 * Existing ids are kept on edit, because interview plans reference them.
 */
export function assignRequirementIds(job: JobInput, jobId: string, previous?: Job): Job["requirements"] {
  const prefix = `req_${jobId.replace(/^job_/, "")}_`;
  const keep = new Set(
    previous ? REQUIREMENT_GROUPS.flatMap((g) => previous.requirements[g].map((r) => r.id)) : [],
  );
  let n = 1;
  const taken = new Set<string>();
  const fresh = () => {
    while (keep.has(`${prefix}${n}`) || taken.has(`${prefix}${n}`)) n++;
    taken.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
  const withIds = (items: JobInput["requirements"]["must_have"]): RequirementItem[] =>
    items.map((r) => {
      const id = r.id && keep.has(r.id) && !taken.has(r.id) ? (taken.add(r.id), r.id) : fresh();
      return { id, skill: r.skill.trim(), ...(r.detail?.trim() ? { detail: r.detail.trim() } : {}) };
    });
  return {
    must_have: withIds(job.requirements.must_have ?? []),
    nice_to_have: withIds(job.requirements.nice_to_have ?? []),
    soft_skills: withIds(job.requirements.soft_skills ?? []),
  };
}
