"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/primitives";
import type { CandidateView } from "@/lib/api";

/** Candidate-facing transcript: questions and their own answers only, never scores. */
export function CandidateTranscript({ session }: { session: CandidateView }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.turns.length]);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <p className="t-eyebrow border-b border-border px-4 py-3">Transcript</p>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {session.turns.map((t) => (
          <div key={t.turn_id} className="space-y-2.5">
            <div>
              <p className="t-eyebrow">
                Aria · {t.is_follow_up ? "follow-up" : `Q${t.question_number}`}
              </p>
              <p className="mt-1 text-[14px] leading-snug">{t.question}</p>
            </div>
            {t.answer !== undefined && (
              <div className="border-l-2 border-border-strong pl-3">
                <p className="t-eyebrow">You</p>
                <p className="mt-1 whitespace-pre-wrap text-[14px] leading-snug text-muted">{t.answer}</p>
              </div>
            )}
          </div>
        ))}
        {session.turns.length === 0 && <p className="text-[13px] text-faint">Your conversation will appear here.</p>}
        <div ref={endRef} />
      </div>
    </Card>
  );
}
