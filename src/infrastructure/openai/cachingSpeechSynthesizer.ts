import { createHash } from "node:crypto";
import type { SpeechSynthesizer } from "@/ports";

type Audio = Awaited<ReturnType<SpeechSynthesizer["synthesize"]>>;

/**
 * Decorator (Open/Closed): adds caching + in-flight de-duplication to any
 * SpeechSynthesizer without changing it. Lets the service pre-warm the next
 * line and the route reuse the same promise — no double billing, lower latency.
 */
export class CachingSpeechSynthesizer implements SpeechSynthesizer {
  private readonly cache = new Map<string, Promise<Audio>>();

  constructor(
    private readonly inner: SpeechSynthesizer,
    private readonly maxEntries = 200,
  ) {}

  synthesize(text: string): Promise<Audio> {
    const key = createHash("sha256").update(text).digest("hex");
    const hit = this.cache.get(key);
    if (hit) return hit;

    const pending = this.inner.synthesize(text).catch((err) => {
      this.cache.delete(key);
      throw err;
    });
    this.cache.set(key, pending);
    if (this.cache.size > this.maxEntries) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return pending;
  }
}
