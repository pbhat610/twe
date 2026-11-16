import type { SpeechSource } from "@/lib/api";

/**
 * Any avatar renderer the interview room can drive (Liskov / Open-Closed):
 * the room depends on this, not on TalkingHead or the 2D face.
 */
export interface AvatarEngine {
  /** Resolve when the line has finished playing. */
  speak(src: SpeechSource): Promise<void>;
  stop(): void;
  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): Promise<void>;
  setListening(on: boolean): void;
  dispose(): void;
}

export interface AvatarHandle {
  speak(src: SpeechSource): Promise<void>;
  stop(): void;
  unlock(): Promise<void>;
  setListening(on: boolean): void;
}
