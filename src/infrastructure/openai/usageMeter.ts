/**
 * USD per 1M tokens (input, output), standard tier, from OpenAI's pricing page
 * (checked 2026-11-15). Unknown models log tokens only.
 */
const PRICES: Record<string, [number, number]> = {
  "gpt-6-astra": [10, 50],
  "gpt-6.1-sol": [2, 10],
  "gpt-6.1-terra": [1, 5],
  "gpt-6-sol": [2, 10],
  "gpt-6-luna": [0.1, 0.5],
  "gpt-5.6-sol": [4, 20],
  "gpt-5.6-terra": [2, 12],
  "gpt-5.6-luna": [0.2, 1.2],
  "gpt-5.5": [5, 30],
  "gpt-5.4": [2.5, 15],
  "gpt-5.4-mini": [0.75, 4.5],
  "gpt-5.4-nano": [0.2, 1.25],
};

export function estimateUsd(model: string, input: number, output: number): number | null {
  const price = PRICES[model];
  return price ? (input * price[0] + output * price[1]) / 1_000_000 : null;
}

/** Running total of LLM spend for this server process, printed after every call. */
export class UsageMeter {
  private totalUsd = 0;
  private calls = 0;

  record(task: string, model: string, input: number, output: number) {
    const usd = estimateUsd(model, input, output);
    this.calls += 1;
    if (usd !== null) this.totalUsd += usd;
    const cost = usd === null ? "" : ` · ~$${usd.toFixed(4)} · process total ~$${this.totalUsd.toFixed(3)} (${this.calls} calls)`;
    console.info(`[llm] ${task} · ${model} · in ${input} / out ${output} tokens${cost}`);
  }
}
