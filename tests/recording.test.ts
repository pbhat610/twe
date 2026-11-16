import { describe, expect, it } from "vitest";
import { MAX_CHUNK_BYTES, normalizeContentType } from "@/domain/recording";
import { buildService } from "./helpers";

const bytes = (n: number) => new Uint8Array(n).buffer;

async function invited() {
  const { service, sessions } = await buildService();
  const created = await service.create("job_001", "cand_001");
  return { service, sessions, created, token: created.invite_token };
}

describe("interview recording", () => {
  it("requires recording consent to join, and stores when it was given", async () => {
    const { service, sessions, created, token } = await invited();
    await expect(service.join(token, { recordingConsent: false })).rejects.toThrow(/recorded/);
    await service.join(token, { recordingConsent: true });
    expect((await sessions.get(created.id))?.recording_consent_at).toBeTruthy();
  });

  it("rejects chunks before the candidate has joined", async () => {
    const { service, token } = await invited();
    await expect(service.recordChunk(token, 0, bytes(10), "video/webm")).rejects.toThrow(/consent/);
  });

  it("stores ordered chunks and lists them for the recruiter", async () => {
    const { service, created, token } = await invited();
    await service.join(token, { recordingConsent: true });
    await service.recordChunk(token, 1, bytes(20), "video/webm");
    await service.recordChunk(token, 0, bytes(10), "video/webm");
    const m = await service.recording(created.id);
    expect(m.chunks.map((c) => c.seq)).toEqual([0, 1]);
    expect(m.total_bytes).toBe(30);
    expect(m.content_type).toBe("video/webm");
    expect(m.approx_seconds).toBe(10);
    expect(new Uint8Array((await service.recordingChunk(created.id, 1)).data).length).toBe(20);
  });

  it("rejects oversized, empty and out-of-range chunks", async () => {
    const { service, token } = await invited();
    await service.join(token, { recordingConsent: true });
    await expect(service.recordChunk(token, 0, bytes(MAX_CHUNK_BYTES + 1), "video/webm")).rejects.toThrow(/too large/);
    await expect(service.recordChunk(token, 0, bytes(0), "video/webm")).rejects.toThrow(/Empty/);
    await expect(service.recordChunk(token, -1, bytes(5), "video/webm")).rejects.toThrow(/index/);
    await expect(service.recordChunk(token, 1.5, bytes(5), "video/webm")).rejects.toThrow(/index/);
  });

  it("accepts the final flush right after the interview ends", async () => {
    const { service, created, token } = await invited();
    await service.join(token, { recordingConsent: true });
    await service.finish(token);
    await service.recordChunk(token, 0, bytes(5), "video/webm");
    expect((await service.recording(created.id)).chunks).toHaveLength(1);
  });

  it("only accepts video/webm and video/mp4", () => {
    expect(normalizeContentType("video/webm;codecs=vp8,opus")).toBe("video/webm");
    expect(normalizeContentType("VIDEO/MP4")).toBe("video/mp4");
    expect(normalizeContentType("text/html")).toBeNull();
    expect(normalizeContentType(null)).toBeNull();
  });
});
