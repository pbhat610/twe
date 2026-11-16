"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { cn, Spinner } from "@/components/ui/primitives";
import { createFaceEngine } from "./faceEngine";
import { createSimliEngine } from "./simliEngine";
import { AVATAR_URL, createTalkingHeadEngine } from "./talkingHeadEngine";
import type { AvatarEngine, AvatarHandle } from "./types";

type Mode = "loading" | "simli" | "3d" | "2d";

function hasWebGL() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * Picks the best available engine and exposes one AvatarHandle:
 *   1. Simli photoreal stream (if the server issues a session)
 *   2. TalkingHead 3D (if WebGL + model file are available)
 *   3. 2D face (always works)
 * The interview room never knows which engine is running.
 */
export function Avatar({ ref, className }: { ref: Ref<AvatarHandle>; className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mouthRef = useRef<SVGEllipseElement>(null);
  const engineRef = useRef<AvatarEngine | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [listening, setListening] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const setMouth = (open: number) => mouthRef.current?.setAttribute("ry", String(2 + open * 14));

    const trySimli = async (): Promise<AvatarEngine | null> => {
      const session = await fetch("/api/avatar/session", { method: "POST" }).then((r) => r.json());
      if (session.provider !== "simli" || !videoRef.current || !audioRef.current) return null;
      setMode("simli"); // show the video tile while it connects
      return createSimliEngine(session.token, videoRef.current, audioRef.current);
    };

    const try3d = async (): Promise<AvatarEngine | null> => {
      const head = await fetch(AVATAR_URL, { method: "HEAD" });
      if (!head.ok || !hasWebGL() || !stageRef.current) return null;
      const engine = await createTalkingHeadEngine(stageRef.current);
      if (!cancelled) setMode("3d");
      return engine;
    };

    (async () => {
      let engine: AvatarEngine | null = null;
      for (const attempt of [trySimli, try3d]) {
        try {
          engine = await attempt();
          if (engine) break;
        } catch (err) {
          console.info("[avatar] engine unavailable, falling back:", (err as Error).message);
        }
      }
      if (!engine) {
        engine = createFaceEngine(setMouth, setListening);
        if (!cancelled) setMode("2d");
      }
      if (cancelled) engine.dispose();
      else {
        engineRef.current = engine;
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      speak: (src) => engineRef.current?.speak(src) ?? Promise.resolve(),
      stop: () => engineRef.current?.stop(),
      unlock: () => engineRef.current?.unlock() ?? Promise.resolve(),
      setListening: (on) => {
        setListening(on);
        engineRef.current?.setListening(on);
      },
    }),
    [],
  );

  return (
    <div className={cn("relative h-full w-full", className)}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn("absolute inset-0 h-full w-full object-cover", mode !== "simli" && "hidden")}
      />
      <audio ref={audioRef} autoPlay />

      <div ref={stageRef} className={cn("absolute inset-0", mode !== "3d" && "invisible")} />

      {mode === "2d" && (
        <div className="absolute inset-0 grid place-items-center">
          <svg viewBox="0 0 200 200" className={cn("h-[70%] max-h-80 transition-transform duration-500", listening && "scale-[1.03]")} aria-label="Interviewer avatar">
            <defs>
              <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f6d2b8" />
                <stop offset="1" stopColor="#e8b896" />
              </linearGradient>
              <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#3b2a4a" />
                <stop offset="1" stopColor="#1f1630" />
              </linearGradient>
            </defs>
            <path d="M40 110 Q38 40 100 34 Q162 40 160 110 L160 150 Q130 120 100 122 Q70 120 40 150 Z" fill="url(#hair)" />
            <ellipse cx="100" cy="104" rx="50" ry="60" fill="url(#skin)" />
            <path d="M52 84 Q70 50 100 52 Q134 50 150 84 Q120 66 100 68 Q78 66 52 84 Z" fill="url(#hair)" />
            <g className="origin-center animate-[blink_5s_infinite]">
              <ellipse cx="80" cy="100" rx="5" ry="6" fill="#2a2036" />
              <ellipse cx="120" cy="100" rx="5" ry="6" fill="#2a2036" />
            </g>
            <path d="M70 88 Q80 83 90 88 M110 88 Q120 83 130 88" stroke="#3b2a4a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <ellipse cx="72" cy="122" rx="8" ry="4" fill="#ff8fa3" opacity="0.35" />
            <ellipse cx="128" cy="122" rx="8" ry="4" fill="#ff8fa3" opacity="0.35" />
            <ellipse ref={mouthRef} cx="100" cy="134" rx="12" ry="2" fill="#7a2e3b" />
          </svg>
        </div>
      )}

      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-faint">
          <div className="flex items-center gap-2 text-sm">
            <Spinner /> Connecting to your interviewer…
          </div>
        </div>
      )}
    </div>
  );
}
