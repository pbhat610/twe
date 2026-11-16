import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type {
  ContentModerator,
  ModerationResult,
  SpeechSynthesizer,
  SpeechTranscriber,
  StructuredGenerationRequest,
  StructuredLLM,
} from "@/ports";
import { UsageMeter } from "./usageMeter";

/** Tasks that run once per answer go to the fast model; the rest to the quality model. */
const FAST_TASKS = new Set(["answer_analysis"]);

/**
 * Structured outputs via the Responses API: the model must return the zod shape.
 * Every call is logged with tokens and an estimated cost (see UsageMeter).
 */
export class OpenAIStructuredLLM implements StructuredLLM {
  constructor(
    private readonly client: OpenAI,
    private readonly models: { quality: string; fast: string },
    private readonly reasoningEffort: "minimal" | "low" | "medium" | "none" = "low",
    private readonly meter: UsageMeter = new UsageMeter(),
  ) {}

  async generate<T extends z.ZodType>(req: StructuredGenerationRequest<T>): Promise<z.infer<T>> {
    const model = FAST_TASKS.has(req.name) ? this.models.fast : this.models.quality;
    const res = await this.client.responses.parse({
      model,
      instructions: req.system,
      input: req.user,
      reasoning: { effort: this.reasoningEffort },
      text: { format: zodTextFormat(req.schema, req.name) },
      store: false,
    });
    this.meter.record(req.name, model, res.usage?.input_tokens ?? 0, res.usage?.output_tokens ?? 0);
    if (!res.output_parsed) {
      throw new Error(`Model returned no parsable output for ${req.name}`);
    }
    return res.output_parsed as z.infer<T>;
  }
}

export class OpenAISpeechSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    private readonly voice: string,
    private readonly instructions = "Speak as a warm, calm, professional job interviewer. Natural pace, friendly but neutral.",
  ) {}

  async synthesize(text: string) {
    const res = await this.client.audio.speech.create({
      model: this.model,
      voice: this.voice,
      input: text,
      instructions: this.instructions,
      response_format: "mp3",
    });
    return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
  }
}

export class OpenAITranscriber implements SpeechTranscriber {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async transcribe(audio: Blob, opts?: { keywords?: string[] }) {
    const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
    const file = await toFile(audio, `answer.${ext}`, { type: audio.type || "audio/webm" });
    const res = await this.client.audio.transcriptions.create({
      model: this.model,
      file,
      // `keywords` biases recognition toward job vocabulary (supported by gpt-transcribe).
      ...(this.model === "gpt-transcribe" && opts?.keywords?.length ? { keywords: opts.keywords.slice(0, 50) } : {}),
    });
    return res.text.trim();
  }
}

export class OpenAIModerator implements ContentModerator {
  constructor(private readonly client: OpenAI) {}

  async moderate(text: string): Promise<ModerationResult> {
    try {
      const res = await this.client.moderations.create({ model: "omni-moderation-latest", input: text });
      const r = res.results[0];
      const categories = Object.entries(r.categories)
        .filter(([, v]) => v)
        .map(([k]) => k);
      return { flagged: r.flagged, categories };
    } catch {
      // Moderation is defence-in-depth; never block the interview on it.
      return { flagged: false, categories: [] };
    }
  }
}
