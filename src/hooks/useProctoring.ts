"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PROCTORING_EVENTS, type ProctoringEventType } from "@/domain/proctoring";
import { IntegrityRules } from "@/components/interview/proctoring/integrityRules";
import { startFaceMonitor } from "@/components/interview/proctoring/faceMonitor";

const COOLDOWN_MS = 8000; // same violation type is reported at most this often
const FLUSH_MS = 1500;
const VOICE_LEVEL = 0.12;

export interface IntegrityWarning {
  id: number;
  type: ProctoringEventType;
  message: string;
  critical: boolean;
}

// Window Management API (Chromium): `screen.isExtended` + "change" event, no permission needed.
type ScreenWithExtended = Screen & { isExtended?: boolean } & Partial<Pick<EventTarget, "addEventListener" | "removeEventListener">>;

/**
 * Candidate-side integrity monitoring while the interview is live:
 *  - browser signals: tab hidden, window blur, fullscreen exit, second display, copy/paste
 *  - open-source face model (MediaPipe): no face, multiple faces, looking away,
 *    voice heard while lips are still
 * Violations are warned on screen immediately and stored on the server.
 */
export function useProctoring({
  token,
  active,
  camStream,
  isRecording,
  micLevel,
}: {
  token: string;
  active: boolean;
  camStream: MediaStream | null;
  isRecording: RefObject<boolean>;
  micLevel: RefObject<number>;
}) {
  const [warning, setWarning] = useState<IntegrityWarning | null>(null);
  const [totals, setTotals] = useState({ total: 0, critical: 0 });
  const queue = useRef<{ type: ProctoringEventType; detail?: string }[]>([]);
  const lastAt = useRef<Partial<Record<ProctoringEventType, number>>>({});
  const seq = useRef(0);

  const report = useCallback((type: ProctoringEventType, detail?: string) => {
    const now = Date.now();
    if (now - (lastAt.current[type] ?? 0) < COOLDOWN_MS) return;
    lastAt.current[type] = now;
    queue.current.push({ type, detail });
    const def = PROCTORING_EVENTS[type];
    setWarning({ id: ++seq.current, type, message: def.warning, critical: def.severity === "critical" });
    setTotals((t) => ({ total: t.total + 1, critical: t.critical + (def.severity === "critical" ? 1 : 0) }));
  }, []);

  // Flush queued events to the server (batched; survives tab close via sendBeacon).
  useEffect(() => {
    if (!active) return;
    const url = `/api/i/${encodeURIComponent(token)}/proctoring`;
    const flush = (beacon = false) => {
      if (!queue.current.length) return;
      const events = queue.current.splice(0, 20);
      const body = JSON.stringify({ events });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      else
        fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true })
          .then((r) => r.json())
          .then((t) => t && typeof t.total === "number" && setTotals({ total: t.total, critical: t.critical }))
          .catch(() => queue.current.unshift(...events));
    };
    const id = setInterval(() => flush(), FLUSH_MS);
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
  }, [active, token]);

  // Browser / environment signals.
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const grace = () => Date.now() - startedAt < 2000; // ignore focus noise right after joining

    const onVisibility = () => document.hidden && report("tab_hidden", "document hidden");
    const onBlur = () => {
      if (grace()) return;
      // Tab switches also blur the window; let visibilitychange handle those.
      setTimeout(() => !document.hidden && !document.hasFocus() && report("window_blur", "window lost focus"), 300);
    };
    const onFullscreen = () => !document.fullscreenElement && report("fullscreen_exit");
    const onClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      report("copy_paste", e.type);
    };
    const scr = window.screen as ScreenWithExtended;
    const checkDisplays = () => scr.isExtended && report("extended_display", "screen.isExtended = true");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onClipboard);
    document.addEventListener("paste", onClipboard);
    document.addEventListener("cut", onClipboard);
    scr.addEventListener?.("change", checkDisplays);
    checkDisplays();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onClipboard);
      document.removeEventListener("paste", onClipboard);
      document.removeEventListener("cut", onClipboard);
      scr.removeEventListener?.("change", checkDisplays);
    };
  }, [active, report]);

  // Camera-based signals (open-source face model, local only).
  useEffect(() => {
    if (!active || !camStream) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const rules = new IntegrityRules();
    const track = camStream.getVideoTracks()[0];
    const onEnded = () => report("camera_off", "camera track ended");
    track?.addEventListener("ended", onEnded);

    startFaceMonitor(camStream, (sample) => {
      const voice = !!isRecording.current && (micLevel.current ?? 0) > VOICE_LEVEL;
      for (const hit of rules.push(sample, voice)) report(hit.type, hit.detail);
    })
      .then((s) => {
        if (cancelled) s();
        else stop = s;
      })
      .catch((err) => {
        // Browser signals still work; only face checks are skipped.
        console.warn("[proctoring] face model unavailable:", err);
      });

    return () => {
      cancelled = true;
      stop?.();
      track?.removeEventListener("ended", onEnded);
    };
  }, [active, camStream, report, isRecording, micLevel]);

  const dismiss = useCallback(() => setWarning(null), []);
  return { warning, dismiss, totals };
}

/**
 * Best-effort full screen. Some embedded browsers leave the request pending
 * forever (permission prompt), so never let it block joining the interview.
 */
export async function enterFullscreen(timeoutMs = 1500) {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  try {
    await Promise.race([
      document.documentElement.requestFullscreen({ navigationUI: "hide" }),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    /* not supported / denied: exiting will simply not be detectable */
  }
}
