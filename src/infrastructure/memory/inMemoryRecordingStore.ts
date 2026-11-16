import type { RecordingContentType } from "@/domain/recording";
import type { RecordingStore } from "@/ports";

/** Local-dev store. Chunks live in process memory and play back via our authenticated route. */
export class InMemoryRecordingStore implements RecordingStore {
  private readonly store = new Map<string, { type: RecordingContentType; chunks: Map<number, ArrayBuffer> }>();

  async putChunk(interviewId: string, seq: number, data: ArrayBuffer, contentType: RecordingContentType) {
    const entry = this.store.get(interviewId) ?? { type: contentType, chunks: new Map() };
    entry.chunks.set(seq, data);
    this.store.set(interviewId, entry);
  }

  async list(interviewId: string) {
    const entry = this.store.get(interviewId);
    if (!entry) return { content_type: null, chunks: [] };
    const chunks = [...entry.chunks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seq, data]) => ({ seq, bytes: data.byteLength, url: `/api/interviews/${interviewId}/recording/${seq}` }));
    return { content_type: entry.type, chunks };
  }

  async read(interviewId: string, seq: number) {
    const entry = this.store.get(interviewId);
    const data = entry?.chunks.get(seq);
    return data && entry ? { data, contentType: entry.type } : undefined;
  }
}
