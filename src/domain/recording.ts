/**
 * Interview recording rules (pure). The candidate's browser records camera +
 * mic + the interviewer's voice into one track and uploads it in small,
 * ordered chunks while the interview runs, so nothing is lost if the tab dies
 * and every request stays well under serverless body limits.
 */

/** Browser slices the recording this often (ms). */
export const RECORDING_TIMESLICE_MS = 5_000;
/** Hard cap per chunk; ~5 s at the bitrates below is ~0.4 MB. */
export const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
/** 2 hours of 5 s chunks: far beyond any interview, stops runaway uploads. */
export const MAX_CHUNKS = 1_440;
/** Late chunks (final flush) are accepted for this long after completion. */
export const UPLOAD_GRACE_MS = 10 * 60_000;

export const VIDEO_BITS_PER_SECOND = 500_000;
export const AUDIO_BITS_PER_SECOND = 64_000;

const ALLOWED = ["video/webm", "video/mp4"] as const;
export type RecordingContentType = (typeof ALLOWED)[number];

/** "video/webm;codecs=vp8,opus" → "video/webm"; anything else → null. */
export function normalizeContentType(raw: string | null | undefined): RecordingContentType | null {
  const base = (raw ?? "").split(";")[0].trim().toLowerCase();
  return (ALLOWED as readonly string[]).includes(base) ? (base as RecordingContentType) : null;
}

export const chunkFileName = (seq: number, type: RecordingContentType) =>
  `${String(seq).padStart(6, "0")}.${type === "video/mp4" ? "mp4" : "webm"}`;

export interface RecordingChunk {
  seq: number;
  bytes: number;
  /** Where the recruiter's browser fetches it (signed URL or our own route). */
  url: string;
}

export interface RecordingManifest {
  content_type: RecordingContentType | null;
  chunks: RecordingChunk[];
  total_bytes: number;
  /** Approximate, from chunk count × timeslice. */
  approx_seconds: number;
}
