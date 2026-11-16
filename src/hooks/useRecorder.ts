"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Optional live output for other features (e.g. the lip-movement integrity check). */
export type RecorderSink = (state: { recording: boolean; level: number }) => void;

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/**
 * Microphone capture with a live input level for the UI meter.
 * `supported` is false when there's no mic API (→ text fallback).
 */
export function useRecorder(sink?: RecorderSink) {
  const [supported, setSupported] = useState(
    () => typeof window === "undefined" || (!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"),
  );
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const ctx = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    setLevel(0);
    sink?.({ recording: false, level: 0 });
  }, [sink]);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.start(250);
      recorder.current = r;

      ctx.current = new AudioContext();
      const analyser = ctx.current.createAnalyser();
      analyser.fftSize = 256;
      ctx.current.createMediaStreamSource(s).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const lvl = buf.reduce((a, b) => a + b, 0) / buf.length / 128;
        setLevel(lvl);
        sink?.({ recording: true, level: lvl });
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      setRecording(true);
    } catch (e) {
      cleanup();
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setError(denied ? "Microphone permission denied — you can type your answer instead." : "Couldn't access the microphone — you can type your answer instead.");
      setSupported(false);
    }
  }, [cleanup, sink]);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const r = recorder.current;
        if (!r || r.state === "inactive") return resolve(null);
        r.onstop = () => {
          const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
          cleanup();
          setRecording(false);
          resolve(blob.size ? blob : null);
        };
        r.stop();
      }),
    [cleanup],
  );

  return { supported, recording, level, error, start, stop };
}
