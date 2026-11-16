"use client";

import { AlertTriangle, ArrowRight, Maximize, Mic, PanelRightClose, PanelRightOpen, VideoOff, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/interview/avatar/Avatar";
import type { AvatarHandle } from "@/components/interview/avatar/types";
import { Spinner, ThinkingDots, Wordmark, cn } from "@/components/ui/primitives";
import { useInterviewFlow, type Phase } from "@/hooks/useInterviewFlow";
import { enterFullscreen, useProctoring } from "@/hooks/useProctoring";
import { useWebcam } from "@/hooks/useWebcam";
import { useSessionRecording } from "@/hooks/useSessionRecording";
import { CallControls } from "./CallControls";
import { CameraPreview } from "./CameraPreview";
import { PreJoin } from "./PreJoin";
import { CandidateTranscript } from "./CandidateTranscript";

const STATUS: Partial<Record<Phase, { label: string; dot: string }>> = {
  speaking: { label: "Aria is speaking", dot: "bg-brand" },
  awaiting: { label: "Your turn. Just speak.", dot: "bg-good listening-dot" },
  transcribing: { label: "Transcribing your answer", dot: "bg-faint" },
  thinking: { label: "Aria is thinking", dot: "bg-faint" },
  closing: { label: "Wrapping up", dot: "bg-brand" },
};

const mmss = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

/**
 * Time left on the call, from the server's deadline (corrected for clock skew
 * between the server and this browser). Falls back to elapsed time when the
 * interview has no time limit.
 */
function useCallClock(running: boolean, deadlineAt?: string, serverNow?: string) {
  const [now, setNow] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [skew] = useState(() => (serverNow ? Date.parse(serverNow) - Date.now() : 0));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setNow(Date.now());
      setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!deadlineAt) return { label: mmss(elapsed), remaining: null as number | null, tone: "text-muted" };
  const remaining = Math.round((Date.parse(deadlineAt) - (now + skew)) / 1000);
  return {
    label: remaining > 0 ? `${mmss(remaining)} left` : "Time's up",
    remaining,
    tone: remaining <= 0 ? "text-bad font-medium" : remaining <= 120 ? "text-warn font-medium" : "text-muted",
  };
}

function SpeakingBars() {
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="eq-bar h-full w-[2px] rounded-[1px] bg-brand" />
      ))}
    </span>
  );
}

export function InterviewRoom({ token, voiceAvailable, demo }: { token: string; voiceAvailable: boolean; demo: boolean }) {
  const avatar = useRef<AvatarHandle>(null);
  const recording = useSessionRecording(token);
  const flow = useInterviewFlow(token, avatar, { onSpeech: recording.addSpeech });
  const { camera, mic, stream: camStream, startCamera, checkMic } = useWebcam();
  const camOn = camera === "on" && !!camStream;
  const isRecording = useRef(false);
  const micLevel = useRef(0);
  const recorderSink = useCallback((st: { recording: boolean; level: number }) => {
    isRecording.current = st.recording;
    micLevel.current = st.level;
  }, []);
  const [panelOpen, setPanelOpen] = useState(true);
  const { session, phase } = flow;
  const live = !["loading", "lobby", "done", "error"].includes(phase);
  const clock = useCallClock(live, session?.deadline_at, session?.server_now);

  // A minute after time runs out with no answer coming, wrap up for the candidate.
  const autoEnded = useRef(false);
  const { endEarly } = flow;
  useEffect(() => {
    if (autoEnded.current || clock.remaining === null || clock.remaining > -60 || phase !== "awaiting") return;
    autoEnded.current = true;
    void endEarly();
  }, [clock.remaining, phase, endEarly]);
  const integrity = useProctoring({ token, active: live, camStream, isRecording, micLevel });
  const [consent, setConsent] = useState(false);
  const join = async () => {
    if (!consent || !camStream) return;
    const fullscreen = enterFullscreen(); // must start inside the click gesture
    const rec = recording.start(camStream); // AudioContext also needs the gesture
    await Promise.all([fullscreen, rec]);
    await flow.join(true);
  };

  // Flush the final chunk once the closing line has played.
  const { stop: stopRecording } = recording;
  useEffect(() => {
    if (phase === "done") void stopRecording();
  }, [phase, stopRecording]);

  // Auto-hide non-critical warnings.
  useEffect(() => {
    if (!integrity.warning || integrity.warning.critical) return;
    const id = setTimeout(integrity.dismiss, 6000);
    return () => clearTimeout(id);
  }, [integrity.warning, integrity.dismiss]);
  const turn = session?.current_turn ?? null;
  const status = STATUS[phase];
  const caption = turn?.question ?? (phase === "closing" ? session?.closing_text : null);
  const firstName = session?.candidate.name.split(" ")[0] ?? "";
  const progress = session
    ? session.status === "completed"
      ? 100
      : (((turn?.question_number ?? 1) - 1) / session.total_questions) * 100
    : 0;

  const integrityTone = integrity.totals.critical > 0 ? "bg-bad" : integrity.totals.total > 0 ? "bg-warn" : "bg-good";

  return (
    <div className="theme-call flex min-h-dvh flex-col lg:h-dvh">
      {/* Top bar: identity left, live facts right (mono, divided) */}
      <header className="border-b border-border">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
          <Wordmark />
          <span className="h-5 w-px bg-border" aria-hidden />
          {session && (
            <p className="min-w-0 truncate text-[14px]">
              <span className="font-display font-bold tracking-[-0.01em]">{session.job.title}</span>
              <span className="text-faint"> · with Aria, AI interviewer</span>
            </p>
          )}

          <div className="ml-auto flex items-center divide-x divide-border text-[12px]">
            {session && (
              <span className="t-num hidden px-3 text-muted sm:block">
                {session.status === "completed" ? "Completed" : `Q ${turn?.question_number ?? "–"}/${session.total_questions}`}
                {turn?.is_follow_up && <span className="text-brand"> · follow-up {turn.follow_up_index}</span>}
              </span>
            )}
            {live && (
              <span
                className="t-num flex items-center gap-2 px-3 text-muted"
                title={
                  recording.status.state === "failed"
                    ? `Not recording: ${recording.status.error ?? "unavailable"}`
                    : "Recording camera, microphone and interviewer audio for the hiring team"
                }
              >
                {recording.status.state === "failed" ? (
                  <span className="text-warn">Not recording</span>
                ) : (
                  <>
                    <span className="rec-dot h-1.5 w-1.5 rounded-full bg-bad" /> REC
                  </>
                )}
                <span className={clock.tone} aria-live="polite">
                  {clock.label}
                </span>
              </span>
            )}
            {live && (
              <span
                className="flex items-center gap-2 px-3 text-muted"
                title="Tab switches, other windows, extra displays, copy/paste, face presence and gaze are monitored."
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", integrityTone)} />
                {integrity.totals.total === 0 ? "Proctored" : `${integrity.totals.total} warning${integrity.totals.total > 1 ? "s" : ""}`}
              </span>
            )}
            <span className="hidden pl-3 lg:block">
              <button
                onClick={() => setPanelOpen((o) => !o)}
                className="grid h-8 w-8 place-items-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
                aria-label={panelOpen ? "Hide transcript" : "Show transcript"}
              >
                {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </button>
            </span>
          </div>
        </div>
        <div className="h-[2px] bg-surface-2">
          <div className="h-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className={cn("grid min-h-0 flex-1 gap-4 p-4 lg:p-5", panelOpen && "lg:grid-cols-[1fr_360px]")}>
        {/* Stage */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-lg border border-border bg-[#0a0c0b] shadow-md">
            <Avatar ref={avatar} />

            {/* Bottom scrim only, so captions and plates read on any frame */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 to-transparent" />

            {status && (
              <div className="overlay enter absolute left-3 top-3 flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px]">
                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                {status.label}
                {(phase === "thinking" || phase === "transcribing") && <ThinkingDots />}
              </div>
            )}

            {live && clock.remaining !== null && clock.remaining <= 0 && (
              <div role="status" className="enter absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-sm bg-bad px-3 py-1.5 text-[13px] font-medium text-white shadow-md">
                Time&apos;s up. Finish this answer and Aria will wrap up.
              </div>
            )}
            {integrity.warning && live && (
              <div
                key={integrity.warning.id}
                role="alert"
                className={cn(
                  "overlay enter absolute left-1/2 top-3 z-10 flex w-[min(92%,540px)] -translate-x-1/2 items-start gap-3 rounded-md border-l-[3px] px-4 py-3 shadow-lg",
                  integrity.warning.critical ? "border-l-bad" : "border-l-warn",
                )}
              >
                <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", integrity.warning.critical ? "text-bad" : "text-warn")} />
                <div className="flex-1">
                  <p className="text-[14px] font-medium">{integrity.warning.message}</p>
                  <p className="mt-0.5 text-[12px] text-[#b4bcb5]">
                    Recorded for the hiring team · <span className="t-num">{integrity.totals.total}</span> so far
                  </p>
                  {integrity.warning.type === "fullscreen_exit" && (
                    <button
                      onClick={() => enterFullscreen()}
                      className="mt-2 flex items-center gap-1.5 rounded-sm bg-brand px-2.5 py-1 text-[12px] font-medium text-brand-ink transition-colors hover:bg-brand-hover"
                    >
                      <Maximize className="h-3.5 w-3.5" /> Return to full screen
                    </button>
                  )}
                </div>
                <button onClick={integrity.dismiss} aria-label="Dismiss warning" className="text-[#8d968e] transition-colors hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Nameplate */}
            <div className="overlay absolute bottom-3 left-3 flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px]">
              {phase === "speaking" || phase === "closing" ? <SpeakingBars /> : <Mic className="h-3.5 w-3.5 text-[#8d968e]" />}
              <span className="font-medium">Aria</span>
              <span className="text-[#8d968e]">AI interviewer</span>
            </div>

            {/* Candidate self-view */}
            <div className="absolute bottom-3 right-3 aspect-video w-36 overflow-hidden rounded-md border border-white/10 bg-surface-2 shadow-md sm:w-52">
              {camOn && camStream ? (
                <CameraPreview stream={camStream} className="h-full w-full -scale-x-100 object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-[12px] text-bad">
                  <span className="flex flex-col items-center gap-1">
                    <VideoOff className="h-4 w-4" /> Camera off
                  </span>
                </div>
              )}
              <span className="overlay absolute bottom-1.5 left-1.5 rounded-[4px] px-1.5 py-px text-[11px]">{firstName || "You"}</span>
            </div>

            {/* Captions */}
            {caption && phase !== "lobby" && phase !== "done" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center px-6 sm:bottom-40">
                <p key={caption} className="overlay enter max-w-3xl rounded-md px-5 py-3 text-center text-[16px] leading-snug md:text-[18px]">
                  {caption}
                </p>
              </div>
            )}

            {phase === "lobby" && session && (
              <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[rgb(10_12_11/0.82)] p-4">
                <PreJoin
                  firstName={firstName}
                  jobTitle={session.job.title}
                  totalQuestions={session.total_questions}
                  durationMinutes={session.duration_seconds ? Math.round(session.duration_seconds / 60) : undefined}
                  needsMic={voiceAvailable}
                  camera={camera}
                  mic={mic}
                  stream={camStream}
                  onStartCamera={startCamera}
                  onCheckMic={checkMic}
                  consent={consent}
                  onConsentChange={setConsent}
                  onJoin={join}
                />
              </div>
            )}

            {phase === "done" && (
              <div className="absolute inset-0 grid place-items-center bg-[rgb(10_12_11/0.82)] p-6">
                <div className="surface-raised enter w-full max-w-md p-7">
                  <p className="t-eyebrow !text-good">Interview complete</p>
                  <h2 className="t-h1 mt-3">Thank you, {firstName}.</h2>
                  <p className="mt-3 text-[15px] text-muted">
                    Your interview has been shared with the hiring team. You can close this window now.
                  </p>
                  {demo && (
                    <Link
                      href="/"
                      className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand text-[15px] font-medium text-brand-ink transition-colors duration-150 hover:bg-brand-hover"
                    >
                      Back to recruiter dashboard <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {(phase === "loading" || phase === "error") && (
              <div className="absolute inset-0 grid place-items-center bg-[rgb(10_12_11/0.85)]">
                {phase === "loading" ? <Spinner className="h-5 w-5 text-brand" /> : <p className="text-[14px] text-bad">{flow.error}</p>}
              </div>
            )}
          </div>

          {session?.status === "in_progress" && phase !== "lobby" && phase !== "loading" && (
            <CallControls
              phase={phase}
              voiceAvailable={voiceAvailable}
              onVoice={flow.submitVoice}
              onText={(t) => flow.submit(t, "text")}
              onSimulate={demo ? flow.simulate : undefined}
              onReplay={flow.replay}
              onSkip={flow.skipSpeech}
              onEnd={flow.endEarly}
              recorderSink={recorderSink}
            />
          )}
          {flow.error && phase !== "error" && (
            <p role="alert" className="-mt-2 text-center text-[13px] text-bad">
              {flow.error}
            </p>
          )}
        </div>

        {panelOpen && <div className="h-[60vh] min-h-0 lg:h-auto">{session && <CandidateTranscript session={session} />}</div>}
      </div>
    </div>
  );
}
