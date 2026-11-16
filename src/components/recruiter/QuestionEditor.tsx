"use client";

import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { ProtectedTopicGuard } from "@/application/guardrails/protectedTopicGuard";
import { MAX_QUESTIONS, planProblems, type QuestionInput } from "@/application/planRules";
import { DIFFICULTIES, QUESTION_TYPES, type FlatRequirement, type Job } from "@/domain/types";
import { Badge, cn } from "@/components/ui/primitives";

const guard = new ProtectedTopicGuard();
const GROUP = { must_have: "must", nice_to_have: "nice", soft_skills: "soft" } as const;

const field = "w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[13.5px] outline-none transition-colors focus:border-brand disabled:bg-surface-2 disabled:text-muted";

/**
 * Edit, add, remove and reorder questions. The first `locked` questions were
 * already asked and are read-only. Validation is the same planProblems the
 * server enforces, shown live.
 */
export function QuestionEditor({
  job,
  requirements,
  questions,
  locked = 0,
  onChange,
}: {
  job: Pick<Job, "job_id" | "requirements"> & Partial<Job>;
  requirements: FlatRequirement[];
  questions: QuestionInput[];
  locked?: number;
  onChange: (questions: QuestionInput[]) => void;
}) {
  const problems = useMemo(() => planProblems(job as Job, questions, guard), [job, questions]);
  const uncovered = requirements.filter((r) => r.group === "must_have" && !questions.some((q) => q.requirement_ids.includes(r.id)));

  const update = (i: number, patch: Partial<QuestionInput>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...questions];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(questions.filter((_, j) => j !== i));
  const add = () =>
    onChange([
      ...questions,
      { question: "", competency: "", requirement_ids: [], rationale: "", difficulty: "medium", type: "behavioral" },
    ]);

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const isLocked = i < locked;
        const toggleReq = (id: string) =>
          update(i, { requirement_ids: q.requirement_ids.includes(id) ? q.requirement_ids.filter((x) => x !== id) : [...q.requirement_ids, id] });
        return (
          <div key={q.question_id ?? `new-${i}`} className={cn("surface p-3.5", isLocked && "bg-surface-2/60")}>
            <div className="mb-2 flex items-center gap-2">
              <span className="t-num text-[12px] text-faint">Q{i + 1}</span>
              {isLocked && (
                <Badge>
                  <Lock className="h-3 w-3" /> Already asked
                </Badge>
              )}
              <span className="ml-auto flex items-center gap-0.5">
                <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={isLocked || i === locked}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={isLocked || i === questions.length - 1}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Remove question" onClick={() => remove(i)} disabled={isLocked}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </span>
            </div>

            <label className="sr-only" htmlFor={`q-${i}`}>
              Question {i + 1}
            </label>
            <textarea
              id={`q-${i}`}
              value={q.question}
              disabled={isLocked}
              rows={2}
              onChange={(e) => update(i, { question: e.target.value })}
              placeholder="The question Aria will say aloud (one clear question, under ~35 words)"
              className={cn(field, "resize-y font-medium")}
            />

            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                aria-label={`Competency for question ${i + 1}`}
                value={q.competency}
                disabled={isLocked}
                onChange={(e) => update(i, { competency: e.target.value })}
                placeholder="Competency, e.g. SQL"
                className={field}
              />
              <select aria-label="Difficulty" value={q.difficulty} disabled={isLocked} onChange={(e) => update(i, { difficulty: e.target.value as QuestionInput["difficulty"] })} className={field}>
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <select aria-label="Type" value={q.type} disabled={isLocked} onChange={(e) => update(i, { type: e.target.value as QuestionInput["type"] })} className={field}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Requirements this question assesses">
              {requirements.map((r) => {
                const on = q.requirement_ids.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={isLocked}
                    aria-pressed={on}
                    onClick={() => toggleReq(r.id)}
                    title={r.detail ?? r.skill}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[12px] transition-colors disabled:cursor-default",
                      on ? "border-brand/40 bg-brand-soft text-brand" : "border-border text-faint hover:border-border-strong hover:text-text",
                    )}
                  >
                    {r.skill} <span className="opacity-60">· {GROUP[r.group]}</span>
                  </button>
                );
              })}
            </div>

            <textarea
              aria-label={`Rationale for question ${i + 1}`}
              value={q.rationale}
              disabled={isLocked}
              rows={2}
              onChange={(e) => update(i, { rationale: e.target.value })}
              placeholder="Why this question for this candidate (verify a claim, probe a gap…)"
              className={cn(field, "mt-2 resize-y text-[13px] text-muted")}
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        disabled={questions.length >= MAX_QUESTIONS}
        className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-strong py-2.5 text-[13px] text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Add question {questions.length >= MAX_QUESTIONS && `(max ${MAX_QUESTIONS})`}
      </button>

      {(problems.length > 0 || uncovered.length > 0) && (
        <div className="rounded-sm border border-warn/30 bg-warn/5 px-3 py-2.5 text-[13px]">
          {problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-bad">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {uncovered.length > 0 && (
            <p className={cn("text-warn", problems.length > 0 && "mt-1.5")}>
              Not covered (allowed, but worth checking): {uncovered.map((r) => r.skill).join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const hasBlockingProblems = (job: Job, questions: QuestionInput[]) => planProblems(job, questions, guard).length > 0;

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-sm p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30">
      {children}
    </button>
  );
}
