"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, cn, ScoreDots } from "@/components/ui/primitives";
import type { RecruiterView } from "@/lib/api";
import { PROCTORING_EVENTS, type ProctoringEventType } from "@/domain/proctoring";

type Tab = "transcript" | "reasoning" | "integrity" | "plan";

const KIND_STYLE: Record<string, string> = {
  guardrail: "text-bad",
  decision: "text-brand",
  policy_override: "text-warn",
  analysis: "text-muted",
  report: "text-good",
};

/** Recruiter-only: transcript with scores, live agent reasoning (analysis + follow-up decisions), integrity and the plan. */
export function SidePanel({ session }: { session: RecruiterView }) {
  const [tab, setTab] = useState<Tab>("transcript");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.turns.length, session.log.length, tab]);

  const reasoning = session.log.filter((l) => l.kind !== "plan");
  const tabs: { id: Tab; label: string; count?: number; alert?: boolean }[] = [
    { id: "transcript", label: "Transcript", count: session.turns.filter((t) => t.answer !== undefined).length },
    { id: "reasoning", label: "Reasoning", count: reasoning.length },
    { id: "integrity", label: "Integrity", count: session.proctoring.length, alert: session.proctoring_summary.critical > 0 },
    { id: "plan", label: "Plan", count: session.plan.length },
  ];

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Underline tabs: active state is the only accent */}
      <div role="tablist" className="flex gap-5 border-b border-border px-4">
        {tabs.map(({ id, label, count, alert }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 border-b-2 py-3 text-[13px] font-medium transition-colors duration-150",
              tab === id ? "border-brand text-text" : "border-transparent text-faint hover:text-text",
            )}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={cn("t-num text-[11px]", alert ? "text-bad" : "text-faint")}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[14px]">
        {tab === "transcript" && (
          <div className="space-y-5">
            {session.turns.map((t) => (
              <div key={t.turn_id} className="space-y-2.5">
                <div>
                  <p className="t-eyebrow">
                    <span className="t-num">{t.turn_id}</span> · {t.is_follow_up ? `follow-up ${t.follow_up_index}` : `Q${t.question_number}`}
                  </p>
                  <p className="mt-1 leading-snug">{t.question}</p>
                </div>
                {t.answer !== undefined && (
                  <div className="border-l-2 border-border-strong pl-3">
                    <p className="whitespace-pre-wrap leading-snug text-muted">{t.answer}</p>
                    {t.analysis && (
                      <p className="mt-2 flex items-center gap-2 text-[13px]">
                        {t.analysis.score !== null && <ScoreDots score={t.analysis.score} />}
                        <span className="t-num text-[12px] text-faint">{t.analysis.score ?? "–"}/5</span>
                        <span className="text-muted">{t.analysis.note}</span>
                      </p>
                    )}
                    {t.decision && <p className="mt-1 text-[12px] text-faint">{t.decision.replace("_", " ")}: {t.decision_reason}</p>}
                    {t.flags.some((f) => f.startsWith("prompt_injection")) && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-bad">
                        <ShieldAlert className="h-3.5 w-3.5" /> Manipulation attempt ignored
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "reasoning" &&
          (reasoning.length === 0 ? (
            <p className="text-[13px] text-faint">The agent&apos;s analysis and follow-up decisions appear here after each answer.</p>
          ) : (
            <ol className="ruled">
              {reasoning.map((l, i) => (
                <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-x-3 py-2.5 text-[13px] leading-relaxed">
                  <span className={cn("t-eyebrow !text-[10.5px] pt-0.5", KIND_STYLE[l.kind] ?? "text-faint")}>{l.kind.replace("_", " ")}</span>
                  <p>
                    {l.turn_id && <span className="t-num text-faint">{l.turn_id} · </span>}
                    {l.message}
                  </p>
                </li>
              ))}
            </ol>
          ))}

        {tab === "integrity" && (
          <>
            {session.proctoring.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-faint">
                No integrity signals yet. Tab switches, other windows, extra displays, copy/paste, face presence, gaze and lip
                movement are monitored in the candidate&apos;s browser.
              </p>
            ) : (
              <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border pb-3 text-[13px]">
                {Object.entries(session.proctoring_summary.counts).map(([type, n]) => {
                  const def = PROCTORING_EVENTS[type as ProctoringEventType];
                  return (
                    <div key={type} className="contents">
                      <dt className={cn(def.severity === "critical" ? "text-bad" : "text-warn")}>{def.label}</dt>
                      <dd className="t-num text-right">{n}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
            <ol className="ruled">
              {session.proctoring.map((e, i) => (
                <li key={i} className="grid grid-cols-[4.75rem_1fr] gap-x-3 py-2 text-[13px]">
                  <span className="t-num whitespace-nowrap text-[12px] text-faint">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
                  <p>
                    <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", e.severity === "critical" ? "bg-bad" : "bg-warn")} />
                    {PROCTORING_EVENTS[e.type].label}
                    {e.detail && <span className="text-faint"> · {e.detail}</span>}
                    {e.turn_id && <span className="t-num text-faint"> · {e.turn_id}</span>}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === "plan" && (
          <ol className="ruled">
            {session.plan.map((q, i) => (
              <li key={q.question_id} className="grid grid-cols-[2rem_1fr] gap-x-2 py-3">
                <span className="t-num pt-0.5 text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="font-medium leading-snug">{q.question}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    <span className="text-text">{q.competency}</span>
                    <span className="text-faint"> · {q.difficulty}</span>
                    <span className="text-faint"> · {q.type.replace("_", " ")} · </span>
                    {q.rationale}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </Card>
  );
}
