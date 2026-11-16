"use client";

import { ArrowLeft, ChevronDown, Download, ShieldAlert, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RecordingPlayer } from "@/components/recruiter/RecordingPlayer";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, ScoreDots, Spinner, cn, scoreTone } from "@/components/ui/primitives";
import type { InterviewReport, ReportFlagType } from "@/domain/types";
import { SCORING, type OverallScore } from "@/domain/scoring";
import { recruiterApi } from "@/lib/api";

const REC = {
  advance: { label: "Advance", tone: "good" },
  hold: { label: "Hold", tone: "warn" },
  reject: { label: "Reject", tone: "bad" },
} as const;

const FLAG_LABEL: Record<ReportFlagType, string> = {
  injection_attempt: "Injection attempt",
  off_topic: "Off topic",
  empty_answer: "Empty answer",
  inappropriate: "Inappropriate",
  other: "Note",
};

const DECISION = { follow_up: "Followed up", move_on: "Moved on", end: "Ended" } as const;
const SCORE_TEXT = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-text", brand: "text-brand" } as const;

/** Recruiter report in the official interview_report schema. */
export function ReportView({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [meta, setMeta] = useState<{ job: string; candidate: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    recruiterApi.get(sessionId).then((s) => setMeta({ job: `${s.job.title} · ${s.job.company}`, candidate: s.candidate.name })).catch(() => undefined);
    recruiterApi.report(sessionId).then(setReport).catch((e: Error) => setError(e.message));
  }, [sessionId]);

  const download = () => {
    if (!report) return;
    // Absolute recording link in the downloaded file (opens the report's player; recruiter login required).
    const out = report.recording ? { ...report, recording: { ...report.recording, url: new URL(report.recording.path, window.location.origin).toString() } } : report;
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `report_${report.job_id}_${report.candidate_id}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const header = (
    <PageHeader
      title={meta?.candidate ?? "Report"}
      subtitle={meta?.job}
      actions={
        <div className="flex gap-2">
          <Link href={`/interviews/${sessionId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" /> Interview
            </Button>
          </Link>
          <a href="#recording">
            <Button variant="secondary" size="sm">
              <Video className="h-4 w-4" /> Recording
            </Button>
          </a>
          {report && (
            <Button variant="secondary" size="sm" onClick={download}>
              <Download className="h-4 w-4" /> Download JSON
            </Button>
          )}
        </div>
      }
    />
  );

  if (error)
    return (
      <>
        {header}
        <div className="space-y-5 px-6 py-5">
          <p className="text-[14px] text-bad">{error}</p>
          {/* The recording is still reviewable when there's no report (e.g. the candidate left early). */}
          <RecordingPlayer interviewId={sessionId} />
        </div>
      </>
    );

  if (!report)
    return (
      <>
        {header}
        <div className="flex items-center gap-3 px-6 py-10 text-[14px] text-muted">
          <Spinner className="text-brand" /> Writing the report from the saved answer analyses…
        </div>
      </>
    );

  const o = report.overall;
  const rec = REC[o.recommendation];

  return (
    <>
      {header}
      <div className="space-y-5 px-6 py-5">
        {/* Verdict first */}
        <section className="surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={rec.tone} className="!text-[13px]">
              {rec.label}
            </Badge>
            <span className="text-[13px] text-faint">{o.confidence} confidence</span>
            {o.score && (
              <span className="ml-auto flex items-baseline gap-1">
                <span className={cn("t-num text-[22px] font-semibold", SCORE_TEXT[REC[o.recommendation].tone])}>{o.score.value}</span>
                <span className="t-num text-[13px] text-faint">/ 100</span>
              </span>
            )}
          </div>
          {o.score && <p className="mt-1 text-[12.5px] text-faint">{o.score.reason}</p>}
          <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed">{o.summary}</p>
          {o.suggested_next_round_focus.length > 0 && (
            <p className="mt-3 text-[13px] text-muted">
              <span className="font-medium text-text">Next round:</span> {o.suggested_next_round_focus.join(" · ")}
            </p>
          )}
        </section>

        {o.score && <ScoreBreakdown score={o.score} />}

        <div id="recording" className="scroll-mt-4">
          <RecordingPlayer interviewId={sessionId} />
        </div>

        {report.flags.length > 0 && (
          <section className="surface p-4">
            <h2 className="t-h2 mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warn" /> Flags for the recruiter
            </h2>
            <ul className="space-y-1.5 text-[13px]">
              {report.flags.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <Badge tone={f.type === "injection_attempt" || f.type === "inappropriate" ? "bad" : "warn"} className="shrink-0">
                    {FLAG_LABEL[f.type]}
                  </Badge>
                  <span className="text-muted">{f.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="surface overflow-hidden">
          <h2 className="t-h2 border-b border-border px-4 py-3">Competencies</h2>
          <ul className="ruled">
            {report.competencies.map((c) => (
              <li key={c.competency} className="grid gap-x-6 gap-y-2 px-4 py-3.5 md:grid-cols-[14rem_1fr]">
                <div>
                  <p className="font-medium">{c.competency}</p>
                  <p className="t-num text-[11.5px] text-faint">{c.requirement_ids.join(", ")}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {c.score === null ? (
                      <span className="text-[12.5px] text-faint">Not enough evidence</span>
                    ) : (
                      <>
                        <ScoreDots score={c.score} />
                        <span className={cn("t-num text-[13px] font-medium", SCORE_TEXT[scoreTone(c.score)])}>{c.score}/5</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="min-w-0 text-[13.5px]">
                  <p className="text-muted">{c.notes}</p>
                  {c.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.evidence.map((q) => (
                        <li key={q} className="border-l-2 border-brand/40 pl-2.5 italic">
                          &ldquo;{q}&rdquo;
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          {(
            [
              ["Strengths", o.strengths, "text-good"],
              ["Concerns", o.concerns, "text-bad"],
            ] as const
          ).map(([title, items, color]) => (
            <section key={title} className="surface p-4">
              <h2 className={cn("t-h2 mb-2", color)}>{title}</h2>
              {items.length ? (
                <ul className="list-disc space-y-1 pl-4 text-[13.5px]">
                  {items.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-faint">None noted.</p>
              )}
            </section>
          ))}
        </div>

        <section className="surface overflow-hidden">
          <h2 className="t-h2 border-b border-border px-4 py-3">Answer by answer</h2>
          <div className="ruled">
            {report.turns.map((t) => (
              <details key={t.turn} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[13.5px] hover:bg-surface-2/60">
                  <span className="t-num w-6 text-[12px] text-faint">{t.turn}</span>
                  <span className="min-w-0 flex-1 truncate">{t.agent_message}</span>
                  {t.analysis.score === null ? <span className="text-[12px] text-faint">–</span> : <ScoreDots score={t.analysis.score} />}
                  <Badge tone={t.decision === "follow_up" ? "brand" : t.decision === "end" ? "bad" : "neutral"}>{DECISION[t.decision]}</Badge>
                  <ChevronDown className="h-4 w-4 text-faint transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2 px-4 pb-4 pl-[3.25rem] text-[13.5px]">
                  <p className="whitespace-pre-wrap rounded-sm bg-surface-2 px-3 py-2">{t.candidate_answer || <span className="text-faint">(no answer)</span>}</p>
                  <p className="flex flex-wrap gap-1.5">
                    <Badge>{t.analysis.relevance.replace("_", " ")}</Badge>
                    <Badge>{t.analysis.depth.replace("_", " ")}</Badge>
                    {t.analysis.requirement_ids.map((id) => (
                      <Badge key={id} tone="brand">
                        {id}
                      </Badge>
                    ))}
                  </p>
                  {t.analysis.key_quote && <p className="border-l-2 border-brand/40 pl-2.5 italic">&ldquo;{t.analysis.key_quote}&rdquo;</p>}
                  <p className="text-muted">{t.analysis.note}</p>
                  <p className="text-[12.5px] text-faint">Decision: {t.decision_reason}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

const CATEGORY_LABEL = { must_have: "Must-have", soft_skills: "Soft skill", nice_to_have: "Nice to have", unlinked: "Other" } as const;

/** How the 0-100 score was built. Weights live in src/domain/scoring.ts (SCORING). */
function ScoreBreakdown({ score }: { score: OverallScore }) {
  const total = score.breakdown.reduce((s, l) => s + (l.points === null ? 0 : l.weight), 0);
  return (
    <details className="surface group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-[13.5px] hover:bg-surface-2/60">
        <span className="t-h2">How the score is calculated</span>
        <span className="text-[12px] text-faint">
          weights: must-have ×{SCORING.categoryWeights.must_have} · soft skill ×{SCORING.categoryWeights.soft_skills} · nice to have ×{SCORING.categoryWeights.nice_to_have} · advance ≥ {SCORING.thresholds.advance} · reject &lt; {SCORING.thresholds.reject} · evidence covers {Math.round(score.coverage * 100)}%
        </span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr className="text-[12px] text-faint">
              <th className="px-4 py-2 font-medium">Competency</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Score</th>
              <th className="px-4 py-2 text-right font-medium">Points</th>
              <th className="px-4 py-2 text-right font-medium">Weight</th>
              <th className="px-4 py-2 text-right font-medium">Share of total</th>
            </tr>
          </thead>
          <tbody>
            {score.breakdown.map((l) => (
              <tr key={l.competency} className="border-t border-border">
                <td className="px-4 py-2">{l.competency}</td>
                <td className="px-4 py-2 text-muted">{CATEGORY_LABEL[l.category]}</td>
                <td className="t-num px-4 py-2 text-right">{l.score === null ? <span className="text-faint">no evidence</span> : `${l.score}/5`}</td>
                <td className="t-num px-4 py-2 text-right">{l.points ?? "–"}</td>
                <td className="t-num px-4 py-2 text-right">×{l.weight}</td>
                <td className="t-num px-4 py-2 text-right text-muted">{l.points === null || !total ? "–" : `${Math.round((l.weight / total) * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
