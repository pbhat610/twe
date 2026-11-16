import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ReportView } from "@/components/report/ReportView";

async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportView sessionId={id} />;
}

export default function ReportPage({ params }: PageProps<"/report/[id]">) {
  return (
    <AppShell>
    <Suspense>
      <Report params={params} />
    </Suspense>
    </AppShell>
  );
}
