import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell, PageHeader } from "@/components/shell/AppShell";
import { container } from "@/container";
import { env } from "@/lib/env";
import { requireRecruiter } from "@/lib/requireRecruiter";

export const metadata: Metadata = { title: "Settings · +twe" };

/** Read-only view of how this deployment is configured, and which env var changes each part. */
async function Settings() {
  await connection();
  await requireRecruiter("/settings");
  const c = await container();
  const free = c.aiMode !== "openai";
  const rows: [string, string, string, boolean][] = [
    ["AI brain", c.aiMode === "openai" ? "OpenAI (billed per call)" : c.aiMode === "fixtures" ? "Claude-written fixtures + offline rules (free)" : "Offline rules (free)", "LLM_PROVIDER = fixtures | openai | heuristic", true],
    ["Quality model", env.llmModel + (free ? " (used when LLM_PROVIDER=openai)" : ""), "OPENAI_MODEL: writes JDs, plans questions, writes reports", true],
    ["Fast model", env.llmModelFast + (free ? " (used when LLM_PROVIDER=openai)" : ""), "OPENAI_MODEL_FAST: analyses every answer", true],
    ["Interviewer voice", c.voice === "elevenlabs" ? "ElevenLabs" : c.voice === "openai" ? "OpenAI TTS" : "Browser voice (free)", "TTS_PROVIDER = elevenlabs | openai | none", c.voice !== "browser"],
    ["Mic answers", c.transcriber ? `OpenAI ${env.sttModel}` : "Off: candidates type answers", "OPENAI_API_KEY, OPENAI_STT_MODEL", Boolean(c.transcriber)],
    ["Avatar", c.avatar === "simli" ? "Simli photoreal (hosted)" : "Open-source 3D / 2D (in browser)", "AVATAR_PROVIDER = local | simli", true],
    ["Storage", c.db === "supabase" ? "Supabase Postgres + Storage" : "In memory (lost on restart)", "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY", c.db === "supabase"],
  ];
  return (
    <>
      <PageHeader title="Settings" subtitle="Configured with environment variables in .env.local (or your Vercel project). Restart the server after changing them." />
      <div className="px-6 py-5">
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border text-[12px] text-faint">
                <th className="px-4 py-2.5 font-medium">Part</th>
                <th className="px-4 py-2.5 font-medium">Current</th>
                <th className="px-4 py-2.5 font-medium">Change with</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([part, current, how, ok]) => (
                <tr key={part} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{part}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-good" : "bg-warn"}`} />
                      {current}
                    </span>
                  </td>
                  <td className="t-num px-4 py-3 text-[12.5px] text-muted">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-faint">
          With LLM_PROVIDER=openai, the server log prints tokens and an estimated cost for every call, plus a running total.
        </p>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <Suspense>
        <Settings />
      </Suspense>
    </AppShell>
  );
}
