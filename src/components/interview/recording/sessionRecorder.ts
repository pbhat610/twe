import {
  AUDIO_BITS_PER_SECOND,
  RECORDING_TIMESLICE_MS,
  VIDEO_BITS_PER_SECOND,
} from "@/domain/recording";

export type RecordingState = "idle" | "starting" | "recording" | "stopping" | "stopped" | "failed";

export interface RecorderStatus {
  state: RecordingState;
  uploaded: number;
  failed: number;
  error?: string;
}

type Uploader = (seq: number, chunk: Blob) => Promise<void>;

// VP8 first: far cheaper to encode than VP9 while the face model is also running.
const MIME_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a", // Safari
  "video/mp4",
];

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Records the whole interview as one track: candidate camera + candidate mic +
 * the interviewer's voice, mixed with Web Audio. The mic uses echo cancellation,
 * so the interviewer is captured from the clean TTS audio rather than the room.
 *
 * Chunks upload in order while the interview runs (MediaRecorder timeslice),
 * each retried with backoff; concatenated in order they form one playable file.
 */
export class SessionRecorder {
  private recorder: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private mix: MediaStreamAudioDestinationNode | null = null;
  private mic: MediaStream | null = null;
  private seq = 0;
  private queue: Promise<void> = Promise.resolve();
  private status: RecorderStatus = { state: "idle", uploaded: 0, failed: 0 };

  constructor(
    private readonly upload: Uploader,
    private readonly onStatus: (s: RecorderStatus) => void,
  ) {}

  static supported() {
    return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!window.AudioContext;
  }

  /** Call from the Join click so the AudioContext may start. */
  async start(camera: MediaStream) {
    if (this.recorder || !SessionRecorder.supported()) {
      if (!SessionRecorder.supported()) this.set({ state: "failed", error: "This browser can't record video" });
      return;
    }
    this.set({ state: "starting" });
    try {
      this.ctx = new AudioContext();
      void this.ctx.resume();
      this.mix = this.ctx.createMediaStreamDestination();
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.ctx.createMediaStreamSource(this.mic).connect(this.mix);

      const tracks = new MediaStream([...camera.getVideoTracks(), ...this.mix.stream.getAudioTracks()]);
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(tracks, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.enqueue(this.seq++, e.data);
      };
      recorder.onerror = () => this.set({ state: "failed", error: "Recording stopped unexpectedly" });
      recorder.start(RECORDING_TIMESLICE_MS);
      this.recorder = recorder;
      this.set({ state: "recording" });
    } catch (err) {
      this.release();
      this.set({ state: "failed", error: (err as Error).message || "Couldn't start recording" });
    }
  }

  /** Mix one line of interviewer speech into the recording (not the speakers). */
  async addInterviewerAudio(data: ArrayBuffer) {
    if (!this.ctx || !this.mix || this.status.state !== "recording") return;
    try {
      const buffer = await this.ctx.decodeAudioData(data.slice(0));
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.mix);
      src.start();
    } catch {
      /* undecodable audio: the transcript still has the line */
    }
  }

  /** Stop, flush the last chunk, and wait for every upload to settle. */
  async stop() {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    this.set({ state: "stopping" });
    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await this.queue;
    this.release();
    this.set({ state: "stopped" });
  }

  /** Tear down without waiting (page unmount). */
  dispose() {
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    this.recorder = null;
    this.release();
  }

  private enqueue(seq: number, chunk: Blob) {
    this.queue = this.queue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await this.upload(seq, chunk);
          this.set({ uploaded: this.status.uploaded + 1 });
          return;
        } catch (err) {
          const status = (err as { status?: number }).status;
          const retryable = status === undefined || status >= 500 || status === 409 || status === 429;
          if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
            this.set({ failed: this.status.failed + 1 });
            return;
          }
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    });
  }

  private release() {
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.mix = null;
  }

  private set(patch: Partial<RecorderStatus>) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.status);
  }
}
