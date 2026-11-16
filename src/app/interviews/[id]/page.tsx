import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InterviewMonitor } from "@/components/recruiter/InterviewMonitor";

async function Monitor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterviewMonitor id={id} />;
}

export default function InterviewMonitorPage({ params }: PageProps<"/interviews/[id]">) {
  return (
    <AppShell>
    <Suspense>
      <Monitor params={params} />
    </Suspense>
    </AppShell>
  );
}
