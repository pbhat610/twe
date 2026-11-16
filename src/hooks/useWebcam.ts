"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DeviceStatus = "idle" | "requesting" | "on" | "denied" | "unavailable";

function classify(err: unknown): DeviceStatus {
  const name = err instanceof DOMException ? err.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}

/**
 * Candidate camera + mic pre-check. The video stays on the device (never
 * uploaded); the mic is only checked here and recorded per answer by useRecorder.
 */
export function useWebcam() {
  const [camera, setCamera] = useState<DeviceStatus>("idle");
  const [mic, setMic] = useState<DeviceStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setCamera("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera("unavailable");
    setCamera("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } });
      streamRef.current = s;
      setStream(s);
      setCamera("on");
      // If the user unplugs/blocks the camera mid-call, reflect it.
      s.getVideoTracks()[0]?.addEventListener("ended", () => setCamera("unavailable"));
    } catch (err) {
      setCamera(classify(err));
    }
  }, []);

  const checkMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setMic("unavailable");
    setMic("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop()); // permission granted; recorder re-opens per answer
      setMic("on");
    } catch (err) {
      setMic(classify(err));
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { camera, mic, stream, startCamera, checkMic, stop };
}
