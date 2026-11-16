"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Optional live output for other features (e.g. the lip-movement integrity check). */
export type RecorderSink = (state: { recording: boolean; level: number }) => void;

/**
 * Hands-free turn-taking: detect when the candidate has spoken and then paused,
 * so the answer can be sent without pressing a button.
 */
export type TurnDetection = {
  /** Called once per recording when the candidate finishes (pause after speech, or max length). */
  onEnd: () => void;
  /** Pause after speech that ends the answer. Interview answers have thinking pauses, so keep this generous. */
  silenceMs?: number;
  /** Speech needed before a pause counts (filters coughs, clicks, a quick "um"). */
  minSpeechMs?: number;
  /** Hard cap on one answer once speech has started. */
  maxMs?: number;
};

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
const CALIBRATE_MS = 400; // learn the room's background-noise level first
const MIN_THRESHOLD = 0.012; // RMS floor so a silent room can't make the threshold ~0
const NOISE_MULTIPLIER = 2.6; // speech must be this much louder than the room noise

/**
 * Microphone capture with a live input level for the UI meter.
 * `supported` is false when there's no mic API (→ text fallback).
 * With `detect`, it also tracks speech vs. silence (adaptive to background noise)
 * and calls `detect.onEnd` when the candidate has finished speaking.
 */
export function useRecorder(sink?: RecorderSink, detect?: TurnDetection) {
  const [supported, setSupported] = useState(
    () => typeof window === "undefined" || (!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"),
  );
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  /** Speech has been heard in this recording. */
  const [heard, setHeard] = useState(false);
  /** Speech was heard and the candidate is now quiet (the answer will send if this lasts). */
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const ctx = useRef<AudioContext | null>(null);
  const starting = useRef(false);
  const detectRef = useRef(detect);
  useEffect(() => {
    detectRef.current = detect;
  });

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    setLevel(0);
    setHeard(false);
    setPausing(false);
    sink?.({ recording: false, level: 0 });
  }, [sink]);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (starting.current || (recorder.current && recorder.current.state !== "inactive")) return;
    starting.current = true;
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.start(250);
      recorder.current = r;

      ctx.current = new AudioContext();
      const source = ctx.current.createMediaStreamSource(s);
      // Meter (frequency average, as before, so downstream consumers keep their scale).
      const analyser = ctx.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      // Voice activity: RMS over a ~40 ms window.
      const vad = ctx.current.createAnalyser();
      vad.fftSize = 2048;
      source.connect(vad);
      const wave = new Float32Array(vad.fftSize);

      const t0 = performance.now();
      let last = t0;
      let floor = 0;
      let calibrated = 0;
      let speechMs = 0;
      let heardSpeech = false;
      let lastVoice = t0;
      let firstVoice = 0;
      let ended = false;
      let pausingNow = false;

      const tick = () => {
        const now = performance.now();
        const dt = Math.min(100, now - last);
        last = now;

        analyser.getByteFrequencyData(buf);
        const lvl = buf.reduce((a, b) => a + b, 0) / buf.length / 128;
        setLevel(lvl);
        sink?.({ recording: true, level: lvl });

        const d = detectRef.current;
        if (d && !ended) {
          vad.getFloatTimeDomainData(wave);
          let sum = 0;
          for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
          const rms = Math.sqrt(sum / wave.length);

          if (now - t0 < CALIBRATE_MS) {
            floor = (floor * calibrated + rms) / (calibrated + 1);
            calibrated++;
          } else {
            const threshold = Math.max(MIN_THRESHOLD, floor * NOISE_MULTIPLIER);
            const voiced = rms > threshold;
            if (voiced) {
              speechMs += dt;
              lastVoice = now;
              if (!firstVoice) firstVoice = now;
              if (!heardSpeech && speechMs >= (d.minSpeechMs ?? 600)) {
                heardSpeech = true;
                setHeard(true);
              }
            } else {
              // Track slow changes in room noise (fan, traffic) while nobody is talking.
              floor = floor * 0.98 + rms * 0.02;
            }

            const silent = now - lastVoice;
            const isPausing = heardSpeech && silent > 900;
            if (isPausing !== pausingNow) {
              pausingNow = isPausing;
              setPausing(isPausing);
            }
            const tooLong = heardSpeech && firstVoice && now - firstVoice > (d.maxMs ?? 180_000);
            if ((heardSpeech && silent >= (d.silenceMs ?? 2800)) || tooLong) {
              ended = true;
              d.onEnd();
            }
          }
        }
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      setRecording(true);
    } catch (e) {
      cleanup();
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setError(denied ? "Microphone permission denied — you can type your answer instead." : "Couldn't access the microphone — you can type your answer instead.");
      setSupported(false);
    } finally {
      starting.current = false;
    }
  }, [cleanup, sink]);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const r = recorder.current;
        if (!r || r.state === "inactive") return resolve(null);
        r.onstop = () => {
          const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
          recorder.current = null;
          cleanup();
          setRecording(false);
          resolve(blob.size ? blob : null);
        };
        r.stop();
      }),
    [cleanup],
  );

  return { supported, recording, level, heard, pausing, error, start, stop };
}
