import type { SpeechSource } from "@/lib/api";
import { speakWithBrowserVoice, stopBrowserVoice } from "./browserVoice";
import type { AvatarEngine } from "./types";

export const AVATAR_URL = "/avatars/avatar.glb";

const VISEMES = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U", "viseme_PP", "viseme_SS", "viseme_DD", "viseme_FF", "viseme_kk", "viseme_nn", "viseme_RR", "viseme_CH", "viseme_TH"];

/* eslint-disable @typescript-eslint/no-explicit-any -- TalkingHead/HeadAudio ship without types */

/**
 * 3D avatar: TalkingHead (Three.js) renders and animates the model;
 * HeadAudio listens to the speech audio and drives the mouth visemes in real
 * time, so any TTS audio lip-syncs without word timestamps.
 */
export async function createTalkingHeadEngine(node: HTMLElement): Promise<AvatarEngine> {
  const [{ TalkingHead }, { HeadAudio }] = await Promise.all([
    import("@met4citizen/talkinghead"),
    // @ts-expect-error -- untyped ESM build
    import("@met4citizen/headaudio/dist/headaudio.min.mjs"),
  ]);

  const head: any = new TalkingHead(node, {
    lipsyncModules: [], // visemes come from HeadAudio, not text
    cameraView: "upper",
    cameraRotateEnable: false,
    cameraZoomEnable: false,
    cameraPanEnable: false,
    avatarIdleEyeContact: 0.6,
    avatarSpeakingEyeContact: 0.8,
    lightAmbientIntensity: 2.2,
    modelFPS: 30,
  });

  await head.showAvatar({ url: AVATAR_URL, body: "F", avatarMood: "happy", lipsyncLang: "en" });

  await head.audioCtx.audioWorklet.addModule("/headaudio/headworklet.min.mjs");
  const headaudio: any = new HeadAudio(head.audioCtx, {
    processorOptions: {},
    parameterData: { vadGateActiveDb: -40, vadGateInactiveDb: -60 },
  });
  await headaudio.loadModel("/headaudio/model-en-mixed.bin");
  head.audioSpeechGainNode.connect(headaudio);

  // Small delay on the audible path so mouth and sound line up.
  const delay = new DelayNode(head.audioCtx, { delayTime: 0.08 });
  head.audioSpeechGainNode.disconnect(head.audioReverbNode);
  head.audioSpeechGainNode.connect(delay);
  delay.connect(head.audioReverbNode);

  headaudio.onvalue = (key: string, value: number) => {
    Object.assign(head.mtAvatar[key], { newvalue: value, needsUpdate: true });
  };
  let lastEnded = 0;
  headaudio.onended = () => (lastEnded = Date.now());
  headaudio.onstarted = () => {
    if (Date.now() - lastEnded > 150) {
      head.lookAtCamera(500);
      if (Math.random() < 0.4) head.speakWithHands?.();
    }
  };

  // Browser-voice fallback can't be routed through Web Audio, so animate the
  // mouth procedurally while it speaks.
  let fakeTalk = false;
  let acc = 0;
  head.opt.update = (dt: number) => {
    headaudio.update(dt);
    if (!fakeTalk) return;
    acc += dt;
    if (acc < 90) return;
    acc = 0;
    for (const v of VISEMES) Object.assign(head.mtAvatar[v], { newvalue: 0, needsUpdate: true });
    const v = VISEMES[Math.floor(Math.random() * 6)];
    Object.assign(head.mtAvatar[v], { newvalue: 0.35 + Math.random() * 0.45, needsUpdate: true });
  };

  let pendingResolve: (() => void) | null = null;
  const stop = () => {
    stopBrowserVoice();
    fakeTalk = false;
    head.stopSpeaking?.();
    pendingResolve?.();
    pendingResolve = null;
  };

  return {
    async unlock() {
      if (head.audioCtx.state !== "running") await head.audioCtx.resume();
    },
    async speak(src: SpeechSource) {
      stop();
      if (src.kind === "browser") {
        head.lookAtCamera(800);
        await speakWithBrowserVoice(src.text, (active) => {
          fakeTalk = active;
          if (!active) for (const v of VISEMES) Object.assign(head.mtAvatar[v], { newvalue: 0, needsUpdate: true });
        });
        return;
      }
      const buffer: AudioBuffer = await head.audioCtx.decodeAudioData(src.data.slice(0));
      await new Promise<void>((resolve) => {
        pendingResolve = resolve;
        head.speakAudio(
          { audio: buffer, markers: [() => { pendingResolve = null; resolve(); }], mtimes: [buffer.duration * 1000 + 150] },
          { isRaw: true },
        );
      });
    },
    stop,
    setListening(on: boolean) {
      head.setMood(on ? "neutral" : "happy");
      if (on) head.lookAtCamera(2000);
    },
    dispose() {
      stop();
      head.stop?.();
      head.audioCtx?.close?.();
      node.replaceChildren();
    },
  };
}
