import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PipelineView } from "@/components/recruiter/PipelineView";
import { AppShell } from "@/components/shell/AppShell";
import { requireRecruiter } from "@/lib/requireRecruiter";

export const metadata: Metadata = { title: "Video pipeline · +twe" };

async function Pipeline({ searchParams }: PageProps<"/pipeline">) {
  await connection();
  await requireRecruiter("/pipeline");
  const { new: startNew } = await searchParams;
  return <PipelineView startOpen={startNew === "1"} />;
}

export default function PipelinePage(props: PageProps<"/pipeline">) {
  return (
    <AppShell>
      <Suspense>
        <Pipeline {...props} />
      </Suspense>
    </AppShell>
  );
}
