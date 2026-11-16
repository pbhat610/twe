"use client";

import { ArrowRight, Camera, CameraOff, Check, Loader2, Mic, MicOff, ShieldCheck } from "lucide-react";
import { loadFaceLandmarker } from "./proctoring/faceMonitor";
import { useEffect } from "react";
import { cn } from "@/components/ui/primitives";
import type { DeviceStatus } from "@/hooks/useWebcam";
import { CameraPreview } from "./CameraPreview";

function DeviceRow({ icon, offIcon, label, status, onRetry }: { icon: React.ReactNode; offIcon: React.ReactNode; label: string; status: DeviceStatus; onRetry: () => void }) {
  const text: Record<DeviceStatus, string> = {
    idle: "Not checked",
    requesting: "Waiting for permission…",
    on: "Ready",
    denied: "Blocked: allow access in the address bar, then retry",
    unavailable: "Not found on this device",
  };
  const ok = status === "on";
  return (
    <div className="flex items-center gap-3 py-3 text-left">
      <span className={cn("grid h-8 w-8 place-items-center rounded-sm border", ok ? "border-good/30 bg-good/10 text-good" : "border-border bg-surface-2 text-muted")}>
        {ok ? icon : offIcon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{label}</p>
        <p className={cn("truncate text-[13px]", status === "denied" || status === "unavailable" ? "text-bad" : "text-faint")}>{text[status]}</p>
      </div>
      {status === "requesting" && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      {ok && <Check className="h-4 w-4 text-good" />}
      {(status === "denied" || status === "unavailable" || status === "idle") && (
        <button onClick={onRetry} className="rounded-sm border border-border px-2.5 py-1 text-[13px] text-text transition-colors duration-150 hover:border-border-strong hover:bg-surface-2">
          {status === "idle" ? "Allow" : "Retry"}
        </button>
      )}
    </div>
  );
}

/**
 * Pre-join device check (like Meet/Zoom): the candidate must turn their camera
 * on before joining; mic is required when voice answers are available.
 */
export function PreJoin({
  firstName,
  jobTitle,
  totalQuestions,
  durationMinutes,
  needsMic,
  camera,
  mic,
  stream,
  onStartCamera,
  onCheckMic,
  consent,
  onConsentChange,
  onJoin,
}: {
  firstName: string;
  jobTitle: string;
  totalQuestions: number;
  durationMinutes?: number;
  needsMic: boolean;
  camera: DeviceStatus;
  mic: DeviceStatus;
  stream: MediaStream | null;
  onStartCamera: () => void;
  onCheckMic: () => void;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  onJoin: () => void;
}) {
  // Ask for devices as soon as the lobby opens.
  useEffect(() => {
    if (camera === "idle") onStartCamera();
    if (needsMic && mic === "idle") onCheckMic();
    loadFaceLandmarker().catch(() => undefined); // warm up the open-source face model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const devicesReady = camera === "on" && (!needsMic || mic === "on");
  const canJoin = devicesReady && consent;

  return (
    <div className="surface-raised enter w-full max-w-3xl overflow-hidden md:grid md:grid-cols-[1.15fr_1fr]">
      <div className="relative aspect-video border-b border-border bg-[#0a0c0b] md:aspect-auto md:border-r md:border-b-0">
        {stream ? (
          <CameraPreview stream={stream} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-faint">
            <CameraOff className="h-8 w-8" />
          </div>
        )}
        <span className="overlay absolute bottom-3 left-3 rounded-[4px] px-2 py-0.5 text-[12px]">{firstName}</span>
      </div>

      <div className="flex flex-col p-6">
        <div>
          <p className="t-eyebrow">Before you join</p>
          <h2 className="t-h1 mt-2">Ready, {firstName}?</h2>
          <p className="mt-2 text-[14px] text-muted">
            {totalQuestions} questions for the {jobTitle} role, one at a time
            {durationMinutes ? `, in about ${durationMinutes} minutes (a timer shows the time left)` : ""}. Aria may follow up on your answers. Just talk when it&apos;s your turn: there&apos;s nothing to press, and your answer is sent when you pause.
          </p>
        </div>

        <div className="ruled mt-5 border-y border-border">
          <DeviceRow icon={<Camera className="h-4 w-4" />} offIcon={<CameraOff className="h-4 w-4" />} label="Camera (required)" status={camera} onRetry={onStartCamera} />
          {needsMic && (
            <DeviceRow icon={<Mic className="h-4 w-4" />} offIcon={<MicOff className="h-4 w-4" />} label="Microphone (required)" status={mic} onRetry={onCheckMic} />
          )}
        </div>

        <div className="mt-4 flex gap-2.5 text-[13px] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
          <p>
            This interview is proctored and opens in full screen. Tab switches, other windows, extra displays, copy/paste and
            whether your face is visible are monitored.
          </p>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-sm border border-border px-3 py-2.5 text-[13px] leading-relaxed transition-colors duration-150 hover:border-border-strong">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => onConsentChange(e.target.checked)}
            className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--brand)]"
          />
          <span>
            I agree to this interview being <span className="font-medium">recorded (video and audio)</span> and shared with
            the hiring team for review.
          </span>
        </label>

        <button
          onClick={onJoin}
          disabled={!canJoin}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand text-[15px] font-medium text-brand-ink transition-colors duration-150 ease-out hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Join interview <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-2.5 text-center text-[12px] text-faint">
          {!devicesReady
            ? "Turn on your camera to join, as in a real video interview."
            : !consent
              ? "Tick the recording agreement to join."
              : "Recording starts when you join."}
        </p>
      </div>
    </div>
  );
}
