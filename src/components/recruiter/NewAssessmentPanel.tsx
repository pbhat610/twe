"use client";

import { Check, Copy, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { DURATION_MINUTES, QUESTION_COUNT } from "@/domain/assessment";
import { flatRequirements, type Job } from "@/domain/types";
import { recruiterApi, type Assessment, type QuestionInput } from "@/lib/api";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button, Spinner, cn } from "@/components/ui/primitives";
import { QuestionEditor, hasBlockingProblems } from "./QuestionEditor";

const EXAMPLE = {
  title: "Customer Success Associate",
  jd: "Customer Success Associate at +twe, Dubai, hybrid, full-time. You'd onboard university career centres and employers onto the platform, run training calls, answer support tickets and turn feedback into product requests for the product team. Need 1-2 years in a customer-facing role, great written English, comfortable with HubSpot or Intercom. Arabic is a plus. Salary around AED 9,000-11,000 a month. Ideally under 28 and a UAE national.",
};

const field = "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-brand";

/**
 * Create or edit a video assessment in one right-hand panel:
 * title + pasted JD + settings → Generate questions (AI) → add / edit / delete → Save.
 * Candidates are invited afterwards from the pipeline.
 */
export function NewAssessmentPanel({
  open,
  onClose,
  onSaved,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (a: Assessment) => void;
  existing?: Assessment | null;
}) {
  const readOnly = existing?.source === "seed";
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [count, setCount] = useState<number>(QUESTION_COUNT.default);
  const [minutes, setMinutes] = useState<number>(DURATION_MINUTES.default);
  const [assessmentId, setAssessmentId] = useState<string | undefined>();
  const [job, setJob] = useState<Job | null>(null);
  const [questions, setQuestions] = useState<QuestionInput[]>([]);
  const [notes, setNotes] = useState<{ removed: string[]; assumptions: string[] }>({ removed: [], assumptions: [] });
  const [copying, setCopying] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset to the assessment being edited (or blank) each time the panel opens.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = open ? (existing?.assessment_id ?? "new") : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key) {
      setTitle(existing?.title ?? "");
      setJd(existing?.jd_text ?? "");
      setCount(existing?.config.max_questions ?? QUESTION_COUNT.default);
      setMinutes(existing?.config.duration_minutes ?? DURATION_MINUTES.default);
      setAssessmentId(existing?.assessment_id);
      setJob(existing?.job ?? null);
      setQuestions(existing?.questions ?? []);
      setNotes({ removed: [], assumptions: [] });
      setCopying(false);
      setError(null);
    }
  }

  const editable = !readOnly || copying;
  const isNew = !existing || copying;
  const requirements = useMemo(() => (job ? flatRequirements(job) : []), [job]);
  const blocked = !job || hasBlockingProblems(job, questions);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generate = () =>
    run(questions.length ? "Regenerating questions…" : "Reading the JD and drafting questions…", async () => {
      const draft = await recruiterApi.draftAssessment({ title, jd_text: jd, max_questions: count, assessment_id: isNew ? undefined : assessmentId });
      setAssessmentId(draft.assessment_id);
      setJob(draft.job);
      setQuestions(draft.questions);
      setNotes({ removed: draft.removed_criteria, assumptions: draft.assumptions });
    });

  const save = () =>
    run("Saving…", async () => {
      if (!job) return;
      const saved = await recruiterApi.saveAssessment(
        { assessment_id: assessmentId, title, jd_text: jd, job, questions, config: { max_questions: count, duration_minutes: minutes } },
        isNew, // new → POST (with the id reserved by the draft); existing → PUT
      );
      onSaved(saved);
    });

  const duplicate = () => {
    setCopying(true);
    setTitle(`${title} (copy)`);
    setAssessmentId(undefined);
    setJob(null);
    setQuestions([]);
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={readOnly && !copying ? existing!.title : existing && !copying ? "Edit video assessment" : "New video assessment"}
      subtitle={readOnly && !copying ? "Demo assessment from the brief (read-only)" : undefined}
      footer={
        <div className="space-y-2">
          {busy && (
            <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner className="h-3.5 w-3.5 text-brand" /> {busy}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-faint">
              {job ? `${questions.length} question${questions.length === 1 ? "" : "s"} · ${minutes} min call` : "Paste a JD, then generate questions"}
            </span>
            {editable ? (
              <Button onClick={save} disabled={blocked || !title.trim() || Boolean(busy)}>
                <Check className="h-4 w-4" /> Save assessment
              </Button>
            ) : (
              <Button variant="secondary" onClick={duplicate}>
                <Copy className="h-4 w-4" /> Duplicate as new
              </Button>
            )}
          </div>
        </div>
      }
    >
      <fieldset disabled={!editable} className="space-y-5">
        <div>
          <label htmlFor="a-title" className="mb-1 block text-[12px] font-medium text-muted">
            Title
          </label>
          <input id="a-title" className={cn(field, "font-medium")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Junior Backend Engineer" />
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor="a-jd" className="text-[12px] font-medium text-muted">
              Job description
            </label>
            {!existing && (
              <button type="button" className="text-[12px] text-brand hover:underline" onClick={() => (setTitle(EXAMPLE.title), setJd(EXAMPLE.jd))}>
                Use an example
              </button>
            )}
          </div>
          <textarea
            id="a-jd"
            rows={8}
            className={cn(field, "resize-y leading-relaxed")}
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description, or a few lines about the role and the skills you need."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-[12px] font-medium text-muted">Questions for the AI to draft</span>
            <div role="radiogroup" aria-label="Number of questions" className="flex overflow-hidden rounded-sm border border-border">
              {[5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={count === n}
                  onClick={() => setCount(n)}
                  className={cn("flex-1 py-1.5 text-[13.5px] transition-colors", count === n ? "bg-brand text-brand-ink" : "hover:bg-surface-2")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="a-minutes" className="mb-1 block text-[12px] font-medium text-muted">
              Call duration (minutes)
            </label>
            <input
              id="a-minutes"
              type="number"
              min={DURATION_MINUTES.min}
              max={DURATION_MINUTES.max}
              className={field}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              onBlur={() => setMinutes((m) => Math.min(DURATION_MINUTES.max, Math.max(DURATION_MINUTES.min, Math.round(m || DURATION_MINUTES.default))))}
            />
          </div>
        </div>

        <Button variant={questions.length ? "secondary" : "primary"} className="w-full" onClick={generate} disabled={!title.trim() || jd.trim().length < 40 || Boolean(busy)}>
          {questions.length ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {questions.length ? "Regenerate questions" : "Generate questions"}
        </Button>
      </fieldset>

      {notes.removed.length > 0 && (
        <Notice tone="bad" title="Removed discriminatory criteria from the JD">
          {notes.removed.join(" · ")}
        </Notice>
      )}
      {notes.assumptions.length > 0 && (
        <Notice tone="warn" title="Assumptions to check">
          {notes.assumptions.join(" · ")}
        </Notice>
      )}

      {job && (
        <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="t-h2">Questions</h3>
            {editable && <span className="text-[12px] text-faint">Edit, reorder, add or delete. Chips show what each question assesses.</span>}
          </div>
          {editable ? (
            <QuestionEditor job={job} requirements={requirements} questions={questions} onChange={setQuestions} />
          ) : (
            <ol className="surface ruled">
              {questions.map((q, i) => (
                <li key={i} className="px-3.5 py-2.5 text-[13.5px]">
                  <span className="t-num mr-2 text-faint">Q{i + 1}</span>
                  {q.question}
                  <span className="block pl-7 text-[12.5px] text-faint">{q.competency}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </SlideOver>
  );
}

function Notice({ tone, title, children }: { tone: "warn" | "bad"; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("mt-4 rounded-sm border px-3 py-2.5 text-[13px]", tone === "warn" ? "border-warn/30 bg-warn/5" : "border-bad/30 bg-bad/5")}>
      <p className={cn("flex items-center gap-1.5 font-medium", tone === "warn" ? "text-warn" : "text-bad")}>
        <TriangleAlert className="h-4 w-4" /> {title}
      </p>
      <p className="mt-1 text-muted">{children}</p>
    </div>
  );
}
