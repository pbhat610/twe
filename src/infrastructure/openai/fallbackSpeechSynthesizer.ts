import type { SpeechSynthesizer } from "@/ports";

/**
 * Decorator: try the preferred voice (ElevenLabs) and, if it fails (e.g. the
 * monthly credit limit is used up), speak the line with the backup voice
 * instead, so an interview never goes silent mid-call.
 */
export class FallbackSpeechSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly primary: SpeechSynthesizer,
    private readonly backup: SpeechSynthesizer,
    private readonly label = "ElevenLabs",
  ) {}

  async synthesize(text: string) {
    try {
      return await this.primary.synthesize(text);
    } catch (err) {
      console.warn(`[tts] ${this.label} failed, using backup voice: ${(err as Error).message.slice(0, 160)}`);
      return this.backup.synthesize(text);
    }
  }
}
