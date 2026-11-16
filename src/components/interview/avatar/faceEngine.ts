import type { SpeechSource } from "@/lib/api";
import { speakWithBrowserVoice, stopBrowserVoice } from "./browserVoice";
import type { AvatarEngine } from "./types";

/**
 * 2D fallback avatar (used if WebGL or the 3D model is unavailable).
 * Mouth opening follows the loudness (RMS) of the TTS audio, so it stays in
 * sync with whatever is playing. `setMouth` writes a CSS variable on the SVG.
 */
export function createFaceEngine(setMouth: (open: number) => void, setListeningUi: (on: boolean) => void): AvatarEngine {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.connect(ctx.destination);
  const samples = new Float32Array(analyser.fftSize);

  let source: AudioBufferSourceNode | null = null;
  let raf = 0;
  let fake: ReturnType<typeof setInterval> | undefined;

  const animate = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    setMouth(Math.min(1, Math.sqrt(sum / samples.length) * 6));
    raf = requestAnimationFrame(animate);
  };

  const stop = () => {
    stopBrowserVoice();
    clearInterval(fake);
    cancelAnimationFrame(raf);
    try {
      source?.stop();
    } catch {
      /* already stopped */
    }
    source = null;
    setMouth(0);
  };

  return {
    async unlock() {
      if (ctx.state !== "running") await ctx.resume();
    },
    async speak(src: SpeechSource) {
      stop();
      if (src.kind === "browser") {
        await speakWithBrowserVoice(src.text, (active) => {
          clearInterval(fake);
          if (active) fake = setInterval(() => setMouth(0.2 + Math.random() * 0.6), 110);
          else setMouth(0);
        });
        return;
      }
      const buffer = await ctx.decodeAudioData(src.data.slice(0));
      await new Promise<void>((resolve) => {
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        source.onended = () => {
          cancelAnimationFrame(raf);
          setMouth(0);
          resolve();
        };
        source.start();
        animate();
      });
    },
    stop,
    setListening: setListeningUi,
    dispose() {
      stop();
      ctx.close();
    },
  };
}
