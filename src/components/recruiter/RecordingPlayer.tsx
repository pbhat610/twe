"use client";

import { Download, Play, RefreshCw, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui/primitives";
import { recruiterApi, type RecordingManifest } from "@/lib/api";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * Recruiter playback. Chunks are fetched in order (signed Storage URLs in
 * production) and joined client-side into one file, so no large response
 * ever passes through a serverless function.
 */
export function RecordingPlayer({ interviewId, live = false }: { interviewId: string; live?: boolean }) {
  const [manifest, setManifest] = useState<RecordingManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const refresh = useCallback(() => {
    recruiterApi.recording(interviewId).then(setManifest).catch((e: Error) => setError(e.message));
  }, [interviewId]);

  useEffect(() => {
    refresh();
    if (!live) return;
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh, live]);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  const load = async () => {
    setError(null);
    try {
      const m = await recruiterApi.recording(interviewId); // fresh signed URLs
      setManifest(m);
      const parts: Blob[] = [];
      for (let i = 0; i < m.chunks.length; i++) {
        const res = await fetch(m.chunks[i].url);
        if (!res.ok) throw new Error(`Couldn't fetch part ${i + 1} of ${m.chunks.length}`);
        parts.push(await res.blob());
        setProgress((i + 1) / m.chunks.length);
      }
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(new Blob(parts, { type: m.content_type ?? "video/webm" }));
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  // MediaRecorder WebM has no duration header; seeking to the end once makes the scrubber work.
  const fixDuration = () => {
    const v = videoRef.current;
    if (!v || Number.isFinite(v.duration)) return;
    const reset = () => {
      v.removeEventListener("durationchange", reset);
      v.currentTime = 0;
    };
    v.addEventListener("durationchange", reset);
    v.currentTime = Number.MAX_SAFE_INTEGER;
  };

  const count = manifest?.chunks.length ?? 0;
  const ext = manifest?.content_type === "video/mp4" ? "mp4" : "webm";

  return (
    <section aria-labelledby="recording-title">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="recording-title" className="t-h2">
          Recording
        </h2>
        {manifest && count > 0 && (
          <span className="t-num text-[12px] text-faint">
            ~{mmss(manifest.approx_seconds)} · {mb(manifest.total_bytes)} · camera, mic and interviewer audio
          </span>
        )}
        {src && (
          <a
            href={src}
            download={`interview_${interviewId}.${ext}`}
            className="ml-auto flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text"
          >
            <Download className="h-4 w-4" /> Download
          </a>
        )}
      </div>

      <div className="surface overflow-hidden">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            onLoadedMetadata={fixDuration}
            className="aspect-video w-full bg-[#0a0c0b]"
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-[#0a0c0b] px-6 text-center text-[#b4bcb5]">
            {error ? (
              <>
                <p className="text-[14px] text-[#e59a8f]">{error}</p>
                <Button variant="secondary" size="sm" onClick={refresh}>
                  <RefreshCw className="h-4 w-4" /> Retry
                </Button>
              </>
            ) : !manifest ? (
              <Spinner className="h-5 w-5" />
            ) : count === 0 ? (
              <>
                <Video className="h-6 w-6 text-[#8d968e]" />
                <p className="text-[14px]">{live ? "Recording appears here once the candidate joins." : "No recording for this interview."}</p>
              </>
            ) : progress !== null ? (
              <>
                <Spinner className="h-5 w-5" />
                <p className="t-num text-[13px]">Loading {Math.round(progress * 100)}%</p>
              </>
            ) : (
              <Button onClick={load}>
                <Play className="h-4 w-4" /> {live ? "Play recording so far" : "Play recording"}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
