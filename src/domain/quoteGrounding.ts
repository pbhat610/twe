/**
 * Keeps the report "grounded in quotes": an LLM-cited quote is only accepted if it
 * actually appears in what the candidate said. Matching is whitespace/punctuation
 * tolerant so minor transcription differences don't drop real evidence.
 */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'‘’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function isGroundedQuote(quote: string, source: string): boolean {
  const q = normalize(quote);
  if (q.length < 4) return false;
  return normalize(source).includes(q);
}

export function filterGroundedQuotes<T extends { quote: string }>(items: T[], source: string): T[] {
  return items.filter((i) => isGroundedQuote(i.quote, source));
}
