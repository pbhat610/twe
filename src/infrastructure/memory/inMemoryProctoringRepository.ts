import type { ProctoringEvent } from "@/domain/proctoring";
import { MAX_STORED_EVENTS } from "@/domain/proctoring";
import type { ProctoringRepository } from "@/ports";

export class InMemoryProctoringRepository implements ProctoringRepository {
  private readonly store = new Map<string, ProctoringEvent[]>();

  async append(interviewId: string, events: ProctoringEvent[]) {
    const list = this.store.get(interviewId) ?? [];
    list.push(...events);
    this.store.set(interviewId, list.slice(-MAX_STORED_EVENTS));
  }

  async list(interviewId: string) {
    return [...(this.store.get(interviewId) ?? [])];
  }
}
