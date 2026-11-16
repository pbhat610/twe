import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CandidatesView } from "@/components/recruiter/CandidatesView";
import { AppShell } from "@/components/shell/AppShell";
import { requireRecruiter } from "@/lib/requireRecruiter";

export const metadata: Metadata = { title: "Candidates · +twe" };

async function Candidates() {
  await connection();
  await requireRecruiter("/candidates");
  return <CandidatesView />;
}

export default function CandidatesPage() {
  return (
    <AppShell>
      <Suspense>
        <Candidates />
      </Suspense>
    </AppShell>
  );
}
