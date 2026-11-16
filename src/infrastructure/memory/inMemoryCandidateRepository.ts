import type { Candidate } from "@/domain/types";
import type { CandidateRepository } from "@/ports";

/** Local-dev / test store for candidates (tests pre-fill it with the demo candidates). */
export class InMemoryCandidateRepository implements CandidateRepository {
  private readonly store: Map<string, Candidate>;

  constructor(seed: Candidate[] = []) {
    this.store = new Map(seed.map((c) => [c.candidate_id, structuredClone(c)]));
  }

  async list() {
    return [...this.store.values()].map((c) => structuredClone(c));
  }

  async get(candidateId: string) {
    const c = this.store.get(candidateId);
    return c && structuredClone(c);
  }

  async save(candidates: Candidate[]) {
    for (const c of candidates) this.store.set(c.candidate_id, structuredClone(c));
  }
}
