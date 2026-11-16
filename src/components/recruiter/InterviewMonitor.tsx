"use client";

import { ArrowRight, Check, Copy, Pencil, Video } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SidePanel } from "@/components/interview/SidePanel";
import { PageHeader } from "@/components/shell/AppShell";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button, Spinner, cn } from "@/components/ui/primitives";
import { flatRequirements, type Job } from "@/domain/types";
import { inviteUrl, recruiterApi, type QuestionInput, type RecruiterView } from "@/lib/api";
import { QuestionEditor, hasBlockingProblems } from "./QuestionEditor";
import { RecordingPlayer } from "./RecordingPlayer";

const STATUS = {
  invited: { label: "Waiting for candidate", dot: "bg-border-strong" },
  in_progress: { label: "Live now", dot: "bg-brand listening-dot" },
  completed: { label: "Completed", dot: "bg-good" },
} as const;

/** Recruiter's view of one interview: polls while it runs; questions editable until asked. */
export function InterviewMonitor({ id }: { id: string }) {
  const [view, setView] = useState<RecruiterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => setView(await recruiterApi.get(id)), [id]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const v = await recruiterApi.get(id);
        if (!alive) return;
        setView(v);
        if (v.status !== "completed") timer = setTimeout(tick, 3000);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) return <p className="p-8 text-center text-[14px] text-bad">{error}</p>;
  if (!view)
    return (
      <div className="grid h-[60vh] place-items-center">
        <Spinner className="text-brand" />
      </div>
    );

  const status = STATUS[view.status];
  const scored = view.turns.filter((t) => t.analysis?.score != null);
  const avg = scored.length ? scored.reduce((a, t) => a + (t.analysis!.score ?? 0), 0) / scored.length : null;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <PageHeader
        title={view.candidate.name}
        subtitle={`${view.job.title} · ${view.job.company}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 flex items-center gap-1.5 text-[13px] text-muted">
              <span className={cn("h-2 w-2 rounded-full", status.dot)} /> {status.label}
            </span>
            {view.status !== "completed" && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit questions
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl(view.invite_token));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Candidate link
            </Button>
            {view.status === "completed" && (
              <Link href={`/report/${view.id}#recording`}>
                <Button variant="secondary" size="sm">
                  <Video className="h-4 w-4" /> Recording
                </Button>
              </Link>
            )}
            {view.status === "completed" && (
              <Link href={`/report/${view.id}`}>
                <Button size="sm">
                  View report <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <dl className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border bg-surface px-6 py-3 text-[13px]">
        {[
          ["Questions", `${view.total_questions}`],
          ["Answered", `${view.turns.filter((t) => t.answer !== undefined).length}`],
          ["Avg score", avg !== null ? avg.toFixed(1) : "–"],
          ["Integrity warnings", `${view.proctoring_summary.total}`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="text-faint">{k}</dt>
            <dd className={cn("t-num font-medium", k === "Integrity warnings" && view.proctoring_summary.critical > 0 && "text-bad")}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid min-h-0 flex-1 gap-5 p-5 lg:grid-cols-[1fr_420px]">
        <div className="min-h-[60vh] lg:min-h-0">
          <SidePanel session={view} />
        </div>
        {view.status !== "invited" && (
          <div className="lg:overflow-y-auto">
            <RecordingPlayer interviewId={view.id} live={view.status === "in_progress"} />
          </div>
        )}
      </div>

      {editing && <EditQuestions view={view} onClose={() => setEditing(false)} onSaved={async () => { await load(); setEditing(false); }} />}
    </div>
  );
}

function EditQuestions({ view, onClose, onSaved }: { view: RecruiterView; onClose: () => void; onSaved: () => Promise<void> }) {
  const [questions, setQuestions] = useState<QuestionInput[]>(view.plan);
  const [summary, setSummary] = useState(view.candidate_summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requirements = useMemo(() => flatRequirements(view.role as Job), [view.role]);
  const blocked = hasBlockingProblems(view.role as Job, questions);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await recruiterApi.updatePlan(view.id, { candidate_summary: summary, questions });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      title="Edit questions"
      subtitle={view.locked_questions ? `${view.locked_questions} already asked and locked; the rest take effect for the next question.` : "Changes apply before the candidate joins."}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={blocked || busy}>
              {busy ? <Spinner /> : <Check className="h-4 w-4" />} Save questions
            </Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="edit-summary" className="mb-1 block text-[12px] font-medium text-muted">
            Candidate summary
          </label>
          <textarea
            id="edit-summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full resize-y rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[13px] text-muted outline-none focus:border-brand"
          />
        </div>
        <QuestionEditor job={view.role as Job} requirements={requirements} questions={questions} locked={view.locked_questions} onChange={setQuestions} />
      </div>
    </SlideOver>
  );
}
