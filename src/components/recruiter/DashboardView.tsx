"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Spinner } from "@/components/ui/primitives";
import { useInterviewList } from "@/hooks/useInterviewList";
import type { SessionSummary } from "@/lib/api";
import { NewAssessmentPanel } from "./NewAssessmentPanel";
import { REC_TONE, STATUS_META } from "./statusMeta";

/** At a glance: what's live, what needs review, and the one common action. */
export function DashboardView() {
  const router = useRouter();
  const { items, refresh } = useInterviewList();
  const [panel, setPanel] = useState(false);
  const list = items ?? [];
  const live = list.filter((i) => i.status === "in_progress");
  const waiting = list.filter((i) => i.status === "invited");
  const done = list.filter((i) => i.status === "completed");
  const recs = { advance: 0, hold: 0, reject: 0 } as Record<keyof typeof REC_TONE, number>;
  for (const i of done) if (i.recommendation && i.recommendation in recs) recs[i.recommendation as keyof typeof recs]++;

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <Button onClick={() => setPanel(true)}>
            <Plus className="h-4 w-4" /> New video assessment
          </Button>
        }
      />
      <div className="space-y-5 px-6 py-5">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Live now", live.length],
            ["Waiting for candidate", waiting.length],
            ["Completed", done.length],
            ["Advance · hold · reject", `${recs.advance} · ${recs.hold} · ${recs.reject}`],
          ].map(([k, v]) => (
            <div key={k} className="surface px-4 py-3">
              <dt className="text-[12.5px] text-faint">{k}</dt>
              <dd className="t-num mt-1 text-[22px] font-medium">{items === null ? "–" : v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-5 lg:grid-cols-2">
          <List title="Live now" empty="No interviews running right now." items={live} loading={items === null} />
          <List title="Recently completed" empty="Completed interviews and their recommendations show up here." items={done.slice(0, 8)} loading={items === null} />
        </div>
      </div>
      <NewAssessmentPanel open={panel} onClose={() => setPanel(false)} onSaved={() => (setPanel(false), refresh(), router.push("/pipeline"))} />
    </>
  );
}

function List({ title, empty, items, loading }: { title: string; empty: string; items: SessionSummary[]; loading: boolean }) {
  return (
    <section className="surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="t-h2">{title}</h2>
        <Link href="/pipeline" className="flex items-center gap-1 text-[12.5px] text-brand hover:underline">
          Pipeline <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {loading ? (
        <div className="grid h-24 place-items-center">
          <Spinner className="text-brand" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-faint">{empty}</p>
      ) : (
        <ul className="ruled">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={i.status === "completed" ? `/report/${i.id}` : `/interviews/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-surface-2/70">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{i.candidate_name}</span> <span className="text-faint">· {i.job_title}</span>
                </span>
                {i.recommendation ? (
                  <Badge tone={REC_TONE[i.recommendation as keyof typeof REC_TONE] ?? "neutral"}>{i.recommendation}</Badge>
                ) : (
                  <Badge tone={STATUS_META[i.status].tone}>{STATUS_META[i.status].label}</Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
