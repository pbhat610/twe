"use client";

import { Check, Keyboard, Mic, PhoneOff, RotateCcw, Send, SkipForward, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/primitives";
import type { Phase } from "@/hooks/useInterviewFlow";
import { useRecorder, type RecorderSink } from "@/hooks/useRecorder";

function RoundButton({
  label,
  onClick,
  disabled,
  active,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-sm border transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-35",
        danger
          ? "border-bad/40 text-bad hover:bg-bad/15"
          : active
            ? "border-border-strong bg-surface-2 text-text"
            : "border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Control bar: one primary action (answer), quiet secondary tools, and a
 * separated destructive "end". Text composer appears above when typing.
 */
export function CallControls({
  phase,
  voiceAvailable,
  onVoice,
  onText,
  onSimulate,
  onReplay,
  onSkip,
  onEnd,
  recorderSink,
}: {
  recorderSink?: RecorderSink;
  phase: Phase;
  voiceAvailable: boolean;
  onVoice: (audio: Blob) => void;
  onText: (text: string) => void;
  /** Only in demo mode (?demo=1): answer with sample_answers.json. */
  onSimulate?: () => void;
  onReplay: () => void;
  onSkip: () => void;
  onEnd: () => void;
}) {
  // Hands-free: the mic opens when it's the candidate's turn and the answer is
  // sent when they pause. "Done answering" sends early; typing turns this off.
  const finishing = useRef(false);
  const finishRef = useRef<() => void>(() => undefined);
  const rec = useRecorder(recorderSink, { onEnd: () => finishRef.current() });
  const canVoice = voiceAvailable && rec.supported;
  const [typing, setTyping] = useState(!canVoice);
  const [draft, setDraft] = useState("");
  const ready = phase === "awaiting";
  const showComposer = typing || !canVoice;
  const handsFree = canVoice && !typing;
  const { recording, start, stop } = rec;

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const blob = await stop();
      if (blob) onVoice(blob);
    } finally {
      finishing.current = false;
    }
  }, [stop, onVoice]);
  useEffect(() => {
    finishRef.current = () => void finish();
  });

  useEffect(() => {
    if (finishing.current) return;
    // Candidate's turn → start listening automatically.
    if (handsFree && ready && !recording) void start();
    // Turn over without an answer (replay, end, switched to typing) → drop the audio.
    if ((!ready || !handsFree) && recording) void stop();
  }, [handsFree, ready, recording, start, stop]);

  const send = () => {
    if (!draft.trim() || !ready) return;
    onText(draft.trim());
    setDraft("");
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {showComposer && (
        <div className="enter flex w-full max-w-3xl items-end gap-2 rounded-md border border-border bg-surface p-2 shadow-sm focus-within:border-border-strong">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!ready}
            rows={2}
            placeholder={ready ? "Type your answer… (Enter to send, Shift+Enter for a new line)" : "Wait for Aria to finish the question…"}
            className="min-h-12 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-text outline-none placeholder:text-faint disabled:opacity-60"
            aria-label="Your answer"
          />
          <button
            onClick={send}
            disabled={!ready || !draft.trim()}
            aria-label="Send answer"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-brand text-brand-ink transition-colors duration-150 hover:bg-brand-hover disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1.5 shadow-md">
        {handsFree && (
          <button
            onClick={() => void finish()}
            disabled={!rec.recording || !rec.heard}
            aria-label={rec.recording ? "Done answering — send now" : "Microphone"}
            className={cn(
              "relative mr-1 flex h-10 min-w-[9.5rem] items-center justify-center gap-2 rounded-sm px-4 text-[14px] font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40",
              rec.recording ? "bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-100" : "bg-surface-2 text-muted",
            )}
          >
            {rec.recording ? (
              <>
                <span className="flex h-4 items-end gap-0.5" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-[1px] bg-current transition-[height] duration-75"
                      style={{ height: `${25 + Math.min(1, rec.level * (1 + i * 0.3)) * 75}%` }}
                    />
                  ))}
                </span>
                {rec.heard ? (
                  <>
                    <Check className="h-4 w-4" /> Done answering
                  </>
                ) : (
                  "Listening…"
                )}
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> {ready ? "Starting mic…" : "Mic off"}
              </>
            )}
          </button>
        )}
        {canVoice && (
          <RoundButton label={typing ? "Answer by voice" : "Type instead"} onClick={() => setTyping((t) => !t)} active={typing}>
            <Keyboard className="h-[18px] w-[18px]" />
          </RoundButton>
        )}
        {phase === "speaking" ? (
          <RoundButton label="Skip to answering" onClick={onSkip}>
            <SkipForward className="h-[18px] w-[18px]" />
          </RoundButton>
        ) : (
          <RoundButton label="Replay question" onClick={onReplay} disabled={!ready}>
            <RotateCcw className="h-[18px] w-[18px]" />
          </RoundButton>
        )}
        {onSimulate && (
          <RoundButton label="Simulated answer (sample_answers.json)" onClick={onSimulate} disabled={!ready}>
            <Sparkles className="h-[18px] w-[18px]" />
          </RoundButton>
        )}
        <span className="mx-1.5 h-6 w-px bg-border" aria-hidden />
        <RoundButton label="End interview" onClick={onEnd} danger>
          <PhoneOff className="h-[18px] w-[18px]" />
        </RoundButton>
      </div>

      {handsFree && rec.recording && (
        <p className="text-[13px] text-faint" aria-live="polite">
          {rec.pausing
            ? "Sending when you stay quiet… keep talking to continue."
            : rec.heard
              ? "Your answer sends automatically when you pause."
              : "Just speak. No need to press anything."}
        </p>
      )}
      {rec.error && <p className="text-[13px] text-warn">{rec.error}</p>}
    </div>
  );
}
