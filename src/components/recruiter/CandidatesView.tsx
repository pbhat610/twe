"use client";

import { FileJson, FileUp, Mail, Phone, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Candidate } from "@/domain/types";
import { recruiterApi } from "@/lib/api";
import { PageHeader } from "@/components/shell/AppShell";
import { SlideOver } from "@/components/ui/SlideOver";
import { Badge, Button, Spinner, cn } from "@/components/ui/primitives";

type Draft = Partial<Candidate> & { name: string };
const SOURCE_LABEL = { seed: "Demo", import: "Imported", resume: "Resume" } as const;
const field = "w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[13.5px] outline-none transition-colors focus:border-brand";

/** Candidates: import a JSON file (like candidates.json) or upload a resume the AI reads. */
export function CandidatesView() {
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => recruiterApi.candidates().then(setItems), []);
  useEffect(() => {
    recruiterApi
      .candidates()
      .then(setItems)
      .catch((e: Error) => setMessage({ tone: "bad", text: e.message }));
  }, []);

  const importJson = async (file: File) => {
    setBusy("Importing…");
    setMessage(null);
    try {
      const { imported } = await recruiterApi.importCandidates(JSON.parse(await file.text()));
      await load();
      setMessage({ tone: "good", text: `Imported ${imported} candidate${imported === 1 ? "" : "s"} from ${file.name}.` });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const loadExamples = async () => {
    setBusy("Loading the example candidates…");
    setMessage(null);
    try {
      const { imported } = await recruiterApi.loadExampleCandidates();
      await load();
      setMessage({ tone: "good", text: `Loaded ${imported} example candidates from the brief.` });
    } catch (e) {
      setMessage({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const hasExamples = items?.some((c) => c.source === "seed") ?? true;

  const uploadResume = async (file: File) => {
    setBusy(`Reading ${file.name}…`);
    setMessage(null);
    try {
      const draft = await recruiterApi.parseResume(file);
      setEditing({ ...draft });
    } catch (e) {
      setMessage({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle="Import a JSON file or upload a resume. Invite them to an assessment from the Video pipeline."
        actions={
          <div className="flex flex-wrap gap-2">
            <input ref={jsonInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            <input
              ref={resumeInput}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
            />
            {!hasExamples && (
              <Button variant="ghost" onClick={loadExamples} disabled={Boolean(busy)}>
                <Users className="h-4 w-4" /> Load examples
              </Button>
            )}
            <Button variant="secondary" onClick={() => jsonInput.current?.click()} disabled={Boolean(busy)}>
              <FileJson className="h-4 w-4" /> Import JSON
            </Button>
            <Button variant="secondary" onClick={() => setEditing({ name: "" })} disabled={Boolean(busy)}>
              <Plus className="h-4 w-4" /> Add manually
            </Button>
            <Button onClick={() => resumeInput.current?.click()} disabled={Boolean(busy)}>
              <FileUp className="h-4 w-4" /> Upload resume
            </Button>
          </div>
        }
      />

      <div className="space-y-3 px-6 py-5">
        {(busy || message) && (
          <p role="status" className={cn("flex items-center gap-2 text-[13px]", message?.tone === "bad" ? "text-bad" : message ? "text-good" : "text-muted")}>
            {busy && <Spinner className="h-3.5 w-3.5 text-brand" />} {busy ?? message?.text}
          </p>
        )}

        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-[12px] text-faint">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Current title</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">Summary</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {items === null && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <Spinner className="text-brand" />
                  </td>
                </tr>
              )}
              {items?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    <p>No candidates yet. Upload a resume, import a JSON file, or start with the brief&apos;s four example candidates.</p>
                    <Button className="mt-3" onClick={loadExamples} disabled={Boolean(busy)}>
                      <Users className="h-4 w-4" /> Load the 4 example candidates
                    </Button>
                  </td>
                </tr>
              )}
              {items?.map((c) => (
                <tr key={c.candidate_id} onClick={() => setEditing({ ...c })} className="cursor-pointer border-b border-border last:border-0 align-top transition-colors hover:bg-surface-2/70">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.current_title || c.headline || "–"}</td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                    {!c.email && !c.phone && <span className="text-faint">–</span>}
                  </td>
                  <td className="max-w-md px-4 py-3 text-[12.5px] text-muted">
                    <span className="line-clamp-2">{c.summary || c.bio || "–"}</span>
                  </td>
                  <td className="px-4 py-3">{c.source ? <Badge>{SOURCE_LABEL[c.source]}</Badge> : <span className="text-faint">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CandidatePanel
        draft={editing}
        onClose={() => setEditing(null)}
        onSaved={async (c) => {
          await load();
          setEditing(null);
          setMessage({ tone: "good", text: `Saved ${c.name}.` });
        }}
      />
    </>
  );
}

/** Review a resume extraction (or edit a candidate) before saving. */
function CandidatePanel({ draft, onClose, onSaved }: { draft: Draft | null; onClose: () => void; onSaved: (c: Candidate) => void }) {
  const [form, setForm] = useState<Draft | null>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<Draft | null>(null);
  if (draft !== shownFor) {
    setShownFor(draft);
    setForm(draft);
    setError(null);
  }
  if (!form) return null;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm({ ...form, [k]: v });
  const fromResume = form.source === "resume" && !form.candidate_id;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await recruiterApi.saveCandidate({ ...form, bio: form.bio || form.summary || "" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      title={form.candidate_id ? form.name || "Candidate" : fromResume ? "Review extracted profile" : "Add candidate"}
      subtitle={fromResume ? "Read from the resume by the AI. Check the details before saving." : undefined}
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
          <Button onClick={save} disabled={!form.name?.trim() || busy}>
            {busy && <Spinner />} Save candidate
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["name", "Name", "sm:col-span-2"],
            ["email", "Email", ""],
            ["phone", "Phone", ""],
            ["current_title", "Current job title", ""],
            ["location", "Location", ""],
          ] as const
        ).map(([k, label, span]) => (
          <div key={k} className={span}>
            <label htmlFor={`c-${k}`} className="mb-1 block text-[12px] font-medium text-muted">
              {label}
            </label>
            <input id={`c-${k}`} className={field} value={(form[k] as string | undefined) ?? ""} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
        <div className="sm:col-span-2">
          <label htmlFor="c-summary" className="mb-1 block text-[12px] font-medium text-muted">
            Summary
          </label>
          <textarea id="c-summary" rows={4} className={cn(field, "resize-y")} value={form.summary ?? ""} onChange={(e) => set("summary", e.target.value)} />
          <p className="mt-1 text-[12px] text-faint">The AI interviewer uses this to make follow-up questions specific to the candidate.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="c-skills" className="mb-1 block text-[12px] font-medium text-muted">
            Skills (comma separated)
          </label>
          <input
            id="c-skills"
            className={field}
            value={(form.skills ?? []).join(", ")}
            onChange={(e) => set("skills", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </div>
        {Boolean(form.experience?.length) && (
          <div className="sm:col-span-2">
            <p className="mb-1 text-[12px] font-medium text-muted">Experience (from the resume)</p>
            <ul className="space-y-1 text-[13px]">
              {form.experience!.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.title}</span> <span className="text-faint">· {e.company}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
