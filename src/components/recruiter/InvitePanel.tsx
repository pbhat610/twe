"use client";

import { Check, Copy, ExternalLink, Search, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Candidate } from "@/domain/types";
import { inviteUrl, recruiterApi, type Assessment, type RecruiterView } from "@/lib/api";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button, Spinner, cn } from "@/components/ui/primitives";

/** Pick candidates for an assessment; each gets their own interview and private link. */
export function InvitePanel({ assessment, onClose, onInvited }: { assessment: Assessment | null; onClose: () => void; onInvited: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState<RecruiterView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (assessment && assessment.assessment_id !== loadedFor) {
    setLoadedFor(assessment.assessment_id);
    setSelected(new Set());
    setCreated(null);
    setError(null);
    setCandidates(null);
  }

  useEffect(() => {
    if (!assessment) return;
    recruiterApi
      .candidates()
      .then(setCandidates)
      .catch((e: Error) => setError(e.message));
  }, [assessment]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const invite = async () => {
    if (!assessment) return;
    setBusy(true);
    setError(null);
    try {
      setCreated(await recruiterApi.invite(assessment.assessment_id, [...selected]));
      onInvited();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  const shown = (candidates ?? []).filter((c) => `${c.name} ${c.email ?? ""} ${c.current_title ?? c.headline}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <SlideOver
      open={Boolean(assessment)}
      onClose={onClose}
      title="Invite candidates"
      subtitle={assessment ? `${assessment.title} · ${assessment.questions.length} questions · ${assessment.config.duration_minutes} min` : undefined}
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
          {created ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <Button onClick={invite} disabled={!selected.size || busy}>
              {busy ? <Spinner /> : <Send className="h-4 w-4" />} Create {selected.size || ""} link{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      }
    >
      {created ? (
        <div className="space-y-2">
          <p className="mb-3 text-[13px] text-muted">Send each candidate their own link. They only see the conversation, never scores or notes.</p>
          {created.map((v) => (
            <div key={v.id} className="surface flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{v.candidate.name}</p>
                <p className="t-num truncate text-[12px] text-faint">{inviteUrl(v.invite_token)}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => copy(v.invite_token)}>
                {copied === v.invite_token ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy
              </Button>
              <a href={`${inviteUrl(v.invite_token)}?demo=1`} target="_blank" rel="noreferrer" title="Open as candidate (demo)" className="rounded-sm p-1.5 text-faint hover:bg-surface-2 hover:text-text">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      ) : candidates === null ? (
        <div className="grid h-32 place-items-center">
          <Spinner className="text-brand" />
        </div>
      ) : candidates.length === 0 ? (
        <p className="py-8 text-center text-[13.5px] text-muted">
          No candidates yet.{" "}
          <Link href="/candidates" className="text-brand hover:underline">
            Add candidates
          </Link>{" "}
          by importing a JSON file or uploading a resume.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-sm border border-border px-2.5">
            <Search className="h-4 w-4 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates" aria-label="Search candidates" className="w-full bg-transparent py-2 text-[13.5px] outline-none" />
          </label>
          <div className="surface ruled overflow-hidden">
            {shown.map((c) => {
              const on = selected.has(c.candidate_id);
              return (
                <label key={c.candidate_id} className={cn("flex cursor-pointer items-start gap-3 px-3.5 py-2.5 text-[13.5px] transition-colors", on ? "bg-brand-soft/60" : "hover:bg-surface-2")}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.candidate_id)} className="mt-1 accent-[var(--brand)]" />
                  <span className="min-w-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-faint">{[c.current_title || c.headline, c.email].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </SlideOver>
  );
}
