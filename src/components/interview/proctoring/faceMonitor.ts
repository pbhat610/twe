/**
 * Face presence / gaze / lip signal from the candidate's camera using
 * MediaPipe Face Landmarker (Apache-2.0, open source). Runs fully in the
 * browser: frames never leave the device. Only derived numbers are emitted.
 */
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export interface FaceSample {
  t: number;
  faces: number;
  /** 0.5 = facing camera; <0.3 or >0.7 = head turned. */
  yawRatio: number;
  /** ~0.5 facing; high = looking down, low = looking up. */
  pitchRatio: number;
  /** Max of eye-look-away blendshapes (0..1). */
  gazeAway: number;
  /** Eyes looking down (reading notes / phone), 0..1. */
  gazeDown: number;
  /** Mouth opening normalised by face height (0..~0.3). */
  mouthOpen: number;
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SAMPLE_MS = 200;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/** Load once and reuse (also lets the lobby preload it). */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceBlendshapes: true,
    });
  })().catch((err) => {
    landmarkerPromise = null;
    throw err;
  });
  return landmarkerPromise;
}

const blend = (cats: { categoryName: string; score: number }[], name: string) =>
  cats.find((c) => c.categoryName === name)?.score ?? 0;

export async function startFaceMonitor(stream: MediaStream, onSample: (s: FaceSample) => void): Promise<() => void> {
  const landmarker = await loadFaceLandmarker();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  let stopped = false;
  let lastTs = 0;
  const tick = () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      const now = performance.now();
      const ts = now <= lastTs ? lastTs + 1 : now; // timestamps must increase
      lastTs = ts;
      const r = landmarker.detectForVideo(video, ts);
      const lm = r.faceLandmarks[0];
      const cats = r.faceBlendshapes[0]?.categories ?? [];
      if (!lm) {
        onSample({ t: now, faces: 0, yawRatio: 0.5, pitchRatio: 0.5, gazeAway: 0, gazeDown: 0, mouthOpen: 0 });
      } else {
        // Landmarks: 1 nose tip, 234/454 cheeks, 10 forehead, 152 chin, 13/14 inner lips.
        const nose = lm[1], left = lm[234], right = lm[454], top = lm[10], chin = lm[152];
        const faceH = Math.max(1e-6, chin.y - top.y);
        onSample({
          t: now,
          faces: r.faceLandmarks.length,
          yawRatio: (nose.x - left.x) / Math.max(1e-6, right.x - left.x),
          pitchRatio: (nose.y - top.y) / faceH,
          gazeAway: Math.max(
            Math.min(blend(cats, "eyeLookOutLeft"), blend(cats, "eyeLookInRight")),
            Math.min(blend(cats, "eyeLookInLeft"), blend(cats, "eyeLookOutRight")),
          ),
          gazeDown: Math.min(blend(cats, "eyeLookDownLeft"), blend(cats, "eyeLookDownRight")),
          mouthOpen: Math.abs(lm[14].y - lm[13].y) / faceH,
        });
      }
    }
    setTimeout(tick, SAMPLE_MS);
  };
  tick();

  return () => {
    stopped = true;
    video.srcObject = null;
  };
}
