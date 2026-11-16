import { DIFFICULTIES, QUESTION_TYPES, flatRequirements, type Job, type PlannedQuestion } from "@/domain/types";
import type { ProtectedTopicGuard } from "./guardrails/protectedTopicGuard";

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 7;
const MAX_QUESTION_CHARS = 400;

export type QuestionInput = Omit<PlannedQuestion, "question_id"> & { question_id?: string };

/**
 * One set of rules for every plan, whoever wrote it: the LLM's draft (fed back
 * for a repair round) and the recruiter's edits (shown in the editor). Returns
 * human-readable problems; empty means the plan is valid.
 */
export function planProblems(job: Job, questions: QuestionInput[], guard: ProtectedTopicGuard, opts: { requireMustHaves?: boolean } = {}): string[] {
  const problems: string[] = [];
  const n = questions.length;
  if (n < MIN_QUESTIONS || n > MAX_QUESTIONS) problems.push(`Use between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions (there are ${n}).`);

  const reqs = flatRequirements(job);
  questions.forEach((q, i) => problems.push(...questionProblems(job, q, guard, `Question ${i + 1}`)));

  if (opts.requireMustHaves) {
    const covered = new Set(questions.flatMap((q) => q.requirement_ids ?? []));
    for (const r of reqs.filter((r) => r.group === "must_have" && !covered.has(r.id))) {
      problems.push(`Must-have requirement ${r.id} (${r.skill}) is not covered.`);
    }
  }
  return problems;
}

/** Problems with a single question (shape, mapping, protected topics). */
export function questionProblems(job: Job, q: QuestionInput, guard: ProtectedTopicGuard, label = "Question"): string[] {
  const problems: string[] = [];
  const valid = new Set(flatRequirements(job).map((r) => r.id));
  const text = q.question?.trim() ?? "";
  if (text.length < 10) problems.push(`${label} is empty or too short.`);
  if (text.length > MAX_QUESTION_CHARS) problems.push(`${label} is too long to say aloud (max ${MAX_QUESTION_CHARS} characters).`);
  if (!q.competency?.trim()) problems.push(`${label} needs a competency.`);
  if (!q.requirement_ids?.length) problems.push(`${label} must map to at least one job requirement.`);
  for (const id of q.requirement_ids ?? []) if (!valid.has(id)) problems.push(`${label} uses unknown requirement "${id}".`);
  if (!q.rationale?.trim()) problems.push(`${label} needs a rationale (why this question for this candidate).`);
  if (!(DIFFICULTIES as readonly string[]).includes(q.difficulty)) problems.push(`${label} has an invalid difficulty.`);
  if (!(QUESTION_TYPES as readonly string[]).includes(q.type)) problems.push(`${label} has an invalid type.`);
  const topic = guard.check(text);
  if (!topic.ok) problems.push(`${label} touches a protected topic (${topic.topics.join(", ")}).`);
  return problems;
}

/** Trim and normalise fields; assign ids to new questions without reusing existing ones. */
export function normaliseQuestions(questions: QuestionInput[], takenIds: Iterable<string> = []): PlannedQuestion[] {
  const used = new Set(takenIds);
  let next = 1;
  const freshId = () => {
    while (used.has(`q${next}`)) next++;
    used.add(`q${next}`);
    return `q${next}`;
  };
  const kept = questions.map((q) => (q.question_id && !used.has(q.question_id) ? (used.add(q.question_id), q.question_id) : null));
  return questions.map((q, i) => ({
    question_id: kept[i] ?? freshId(),
    question: q.question.trim(),
    competency: q.competency.trim(),
    requirement_ids: [...new Set(q.requirement_ids)],
    rationale: q.rationale.trim(),
    difficulty: q.difficulty,
    type: q.type,
  }));
}
