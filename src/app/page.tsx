import { connection } from "next/server";
import { Suspense } from "react";
import { DashboardView } from "@/components/recruiter/DashboardView";
import { AppShell } from "@/components/shell/AppShell";
import { requireRecruiter } from "@/lib/requireRecruiter";

async function Dashboard() {
  await connection();
  await requireRecruiter("/");
  return <DashboardView />;
}

export default function Home() {
  return (
    <AppShell>
      <Suspense>
        <Dashboard />
      </Suspense>
    </AppShell>
  );
}
