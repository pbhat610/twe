"use client";

import { Check, Clock, Copy, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Spinner, cn } from "@/components/ui/primitives";
import { useInterviewList } from "@/hooks/useInterviewList";
import { inviteUrl, recruiterApi, type Assessment, type SessionSummary } from "@/lib/api";
import { InvitePanel } from "./InvitePanel";
import { NewAssessmentPanel } from "./NewAssessmentPanel";
import { REC_TONE, STATUS_META } from "./statusMeta";

type Filter = "all" | SessionSummary["status"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "Live" },
  { id: "invited", label: "Waiting" },
  { id: "completed", label: "Completed" },
];

/** Assessments (JD + questions + settings) and the interviews created from them. */
export function PipelineView({ startOpen = false }: { startOpen?: boolean }) {
  const router = useRouter();
  const { items, error, refresh } = useInterviewList();
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [editing, setEditing] = useState<Assessment | null | "new">(startOpen ? "new" : null);
  const [inviting, setInviting] = useState<Assessment | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const loadAssessments = useCallback(() => recruiterApi.assessments().then(setAssessments).catch(() => setAssessments([])), []);
  useEffect(() => {
    recruiterApi.assessments().then(setAssessments).catch(() => setAssessments([]));
  }, []);

  const interviews = items ?? [];
  const rows = interviews.filter((i) => filter === "all" || i.status === filter);
  const count = (f: Filter) => interviews.filter((i) => f === "all" || i.status === f).length;
  const perAssessment = (id: string) => interviews.filter((i) => i.assessment_id === id);

  return (
    <>
      <PageHeader
        title="Video pipeline"
        subtitle="Assessments, and the interviews you've sent from them."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New video assessment
          </Button>
        }
      />

      <div className="space-y-6 px-6 py-5">
        <section>
          <h2 className="t-h2 mb-2">Assessments</h2>
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[12px] text-faint">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Questions</th>
                  <th className="px-4 py-2.5 font-medium">Call</th>
                  <th className="px-4 py-2.5 font-medium">Interviews</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {assessments === null && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center">
                      <Spinner className="text-brand" />
                    </td>
                  </tr>
                )}
                {assessments?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      No assessments yet.{" "}
                      <button className="text-brand hover:underline" onClick={() => setEditing("new")}>
                        Create one from a JD
                      </button>
                      .
                    </td>
                  </tr>
                )}
                {assessments?.map((a) => {
                  const ivs = perAssessment(a.assessment_id);
                  const done = ivs.filter((i) => i.status === "completed").length;
                  return (
                    <tr key={a.assessment_id} onClick={() => setEditing(a)} className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2/70">
                      <td className="px-4 py-3">
                        <span className="font-medium">{a.title}</span>
                        {a.source === "seed" && <Badge className="ml-2">Demo</Badge>}
                        <span className="block text-[12.5px] text-faint">{a.job.company?.name}</span>
                      </td>
                      <td className="t-num px-4 py-3">{a.questions.length}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-muted">
                          <Clock className="h-3.5 w-3.5" /> {a.config.duration_minutes} min
                        </span>
                      </td>
                      <td className="t-num px-4 py-3 text-muted">{ivs.length ? `${done} / ${ivs.length} done` : "–"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInviting(a);
                          }}
                        >
                          <Send className="h-3.5 w-3.5" /> Invite
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-h2">Interviews</h2>
            <div role="tablist" className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn("rounded-sm px-2.5 py-1 text-[13px] transition-colors", filter === f.id ? "bg-surface text-text shadow-sm ring-1 ring-border" : "text-muted hover:text-text")}
                >
                  {f.label} <span className="t-num text-faint">{count(f.id)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[12px] text-faint">
                  <th className="px-4 py-2.5 font-medium">Candidate</th>
                  <th className="px-4 py-2.5 font-medium">Assessment</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Recommendation</th>
                  <th className="px-4 py-2.5 font-medium">Sent</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items === null && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      {error ? <span className="text-bad">{error}</span> : <Spinner className="text-brand" />}
                    </td>
                  </tr>
                )}
                {items !== null && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted">
                      {interviews.length === 0 ? "No interviews yet. Use Invite on an assessment to send links." : "Nothing in this view."}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/interviews/${r.id}`)} className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2/70">
                    <td className="px-4 py-3 font-medium">{r.candidate_name}</td>
                    <td className="px-4 py-3 text-muted">{r.job_title}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.recommendation ? <Badge tone={REC_TONE[r.recommendation as keyof typeof REC_TONE] ?? "neutral"}>{r.recommendation}</Badge> : <span className="text-faint">–</span>}
                    </td>
                    <td className="t-num px-4 py-3 text-[12.5px] text-faint">{new Date(r.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await navigator.clipboard.writeText(inviteUrl(r.invite_token));
                          setCopied(r.id);
                          setTimeout(() => setCopied(null), 1500);
                        }}
                        className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12.5px] text-muted hover:bg-surface-2 hover:text-text"
                      >
                        {copied === r.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <NewAssessmentPanel
        open={editing !== null}
        existing={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={async (a) => {
          await loadAssessments();
          setEditing(null);
          setInviting(a);
        }}
      />
      <InvitePanel assessment={inviting} onClose={() => setInviting(null)} onInvited={refresh} />
    </>
  );
}
