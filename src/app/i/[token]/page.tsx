import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { container } from "@/container";

export const metadata: Metadata = { title: "Your interview · +twe", robots: { index: false } };

async function Room({ params, searchParams }: PageProps<"/i/[token]">) {
  await connection();
  const { token } = await params;
  const { demo } = await searchParams;
  const { transcriber } = await container();
  return <InterviewRoom token={token} voiceAvailable={!!transcriber} demo={demo === "1"} />;
}

/** Candidate entry point: the shareable link. */
export default function CandidateInterviewPage(props: PageProps<"/i/[token]">) {
  return (
    <Suspense>
      <Room {...props} />
    </Suspense>
  );
}
