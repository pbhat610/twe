import type { Assessment } from "@/domain/assessment";
import type { AssessmentRepository } from "@/ports";

/** Local-dev / test store for assessments (lost on restart). */
export class InMemoryAssessmentRepository implements AssessmentRepository {
  private readonly store = new Map<string, Assessment>();

  constructor(seed: Assessment[] = []) {
    for (const a of seed) this.store.set(a.assessment_id, structuredClone(a));
  }

  async list() {
    return [...this.store.values()].map((a) => structuredClone(a));
  }

  async get(id: string) {
    const a = this.store.get(id);
    return a && structuredClone(a);
  }

  async save(a: Assessment) {
    this.store.set(a.assessment_id, structuredClone(a));
  }
}
