import type { SpeechSynthesizer } from "@/ports";

/**
 * ElevenLabs TTS behind the same SpeechSynthesizer port as OpenAI.
 * Plain fetch (no SDK) keeps the dependency surface small.
 * Select with TTS_PROVIDER=elevenlabs.
 */
export class ElevenLabsSpeechSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly apiKey: string,
    private readonly voiceId: string,
    private readonly modelId: string,
  ) {}

  async synthesize(text: string) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      const hint =
        res.status === 402 ? " (this voice needs a paid plan, or credits ran out)" : res.status === 401 ? " (check the API key and its text-to-speech permission)" : res.status === 429 ? " (rate or quota limit)" : "";
      throw new Error(`ElevenLabs TTS failed (${res.status})${hint}: ${body.slice(0, 200)}`);
    }
    return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
  }
}
