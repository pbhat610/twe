import type { SpeechSource } from "@/lib/api";
import { speakWithBrowserVoice, stopBrowserVoice } from "./browserVoice";
import type { AvatarEngine } from "./types";

const SAMPLE_RATE = 16_000; // Simli expects PCM16 mono @ 16 kHz
const CHUNK_BYTES = 6_000;

/** Decode any TTS audio (mp3/wav) and resample to 16 kHz mono PCM16 bytes. */
async function toPcm16(data: ArrayBuffer): Promise<{ bytes: Uint8Array; seconds: number }> {
  const decodeCtx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const decoded = await decodeCtx.decodeAudioData(data.slice(0));
  const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start();
  const rendered = (await ctx.startRendering()).getChannelData(0);
  const pcm = new Int16Array(rendered.length);
  for (let i = 0; i < rendered.length; i++) {
    const s = Math.max(-1, Math.min(1, rendered[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { bytes: new Uint8Array(pcm.buffer), seconds: decoded.duration };
}

/**
 * Photoreal streaming face (Simli) over WebRTC. We send our own approved TTS
 * audio; Simli renders the lip-synced video and plays the voice through the
 * <audio> element. `speak` resolves on Simli's "silent" event (with a
 * duration-based safety net).
 */
export async function createSimliEngine(
  token: string,
  video: HTMLVideoElement,
  audio: HTMLAudioElement,
): Promise<AvatarEngine> {
  const { SimliClient, LogLevel } = await import("simli-client");
  const client = new SimliClient(token, video, audio, null, LogLevel.ERROR);

  let speaking = false;
  let finish: (() => void) | null = null;
  client.on("speaking", () => (speaking = true));
  client.on("silent", () => {
    if (speaking) finish?.();
    speaking = false;
  });

  await new Promise<void>((resolve, reject) => {
    client.on("error", (detail) => reject(new Error(detail)));
    client.on("startup_error", (msg) => reject(new Error(msg)));
    client.start().then(resolve, reject);
  });

  const stop = () => {
    stopBrowserVoice();
    client.ClearBuffer();
    finish?.();
  };

  return {
    async unlock() {
      audio.muted = false;
      await audio.play().catch(() => undefined);
      await video.play().catch(() => undefined);
    },
    async speak(src: SpeechSource) {
      stop();
      // No server audio (offline mode): the face can't lip-sync browser speech, but keep talking.
      if (src.kind === "browser") return speakWithBrowserVoice(src.text);

      const { bytes, seconds } = await toPcm16(src.data);
      await new Promise<void>((resolve) => {
        const safety = setTimeout(() => finish?.(), seconds * 1000 + 2500);
        finish = () => {
          clearTimeout(safety);
          finish = null;
          resolve();
        };
        for (let i = 0; i < bytes.length; i += CHUNK_BYTES) client.sendAudioData(bytes.subarray(i, i + CHUNK_BYTES));
      });
    },
    stop,
    setListening() {
      /* the streamed face idles naturally */
    },
    dispose() {
      stop();
      client.stop().catch(() => undefined);
    },
  };
}
