import { describe, expect, it } from "vitest";
import { summarizeProctoring } from "@/domain/proctoring";
import { IntegrityRules } from "@/components/interview/proctoring/integrityRules";
import type { FaceSample } from "@/components/interview/proctoring/faceMonitor";
import { buildService } from "./helpers";

const face = (t: number, over: Partial<FaceSample> = {}): FaceSample => ({
  t, faces: 1, yawRatio: 0.5, pitchRatio: 0.5, gazeAway: 0, gazeDown: 0, mouthOpen: 0.05, ...over,
});

/** Feed samples every 200 ms for `ms` and collect hits. */
function run(rules: IntegrityRules, ms: number, over: Partial<FaceSample>, voice = false, start = 0) {
  const hits = [];
  for (let t = start; t <= start + ms; t += 200) hits.push(...rules.push(face(t, over), voice));
  return hits;
}

describe("IntegrityRules (face model → violations)", () => {
  it("ignores brief glitches (blink, quick glance)", () => {
    const r = new IntegrityRules();
    expect(run(r, 1000, { faces: 0 })).toEqual([]);
    expect(run(r, 2000, { yawRatio: 0.1 }, false, 2000)).toEqual([]);
  });

  it("flags no face after 3s, once per episode", () => {
    const hits = run(new IntegrityRules(), 8000, { faces: 0 });
    expect(hits.map((h) => h.type)).toEqual(["no_face"]);
  });

  it("flags multiple faces and sustained looking away", () => {
    expect(run(new IntegrityRules(), 2500, { faces: 2 }).map((h) => h.type)).toContain("multiple_faces");
    expect(run(new IntegrityRules(), 5500, { gazeDown: 0.9 }).map((h) => h.type)).toContain("looking_away");
  });

  it("flags voice heard while lips stay still, not while lips move", () => {
    expect(run(new IntegrityRules(), 3500, { mouthOpen: 0.02 }, true).map((h) => h.type)).toContain("voice_without_lips");
    const r = new IntegrityRules();
    const hits = [];
    for (let t = 0; t <= 3500; t += 200) hits.push(...r.push(face(t, { mouthOpen: t % 400 ? 0.02 : 0.12 }), true));
    expect(hits.map((h) => h.type)).not.toContain("voice_without_lips");
  });
});

describe("proctoring end to end", () => {
  it("stores violations server-side with server-assigned severity and surfaces them in the report", async () => {
    const { service } = await buildService();
    const created = await service.create("job_001", "cand_001");
    // Before joining, events are ignored.
    expect((await service.recordProctoring(created.invite_token, [{ type: "tab_hidden" }])).total).toBe(0);

    let cv = await service.join(created.invite_token, { recordingConsent: true });
    const summary = await service.recordProctoring(created.invite_token, [{ type: "tab_hidden" }, { type: "tab_hidden" }, { type: "looking_away" }]);
    expect(summary).toMatchObject({ total: 3, critical: 2 });

    const view = await service.get(created.id);
    expect(view.proctoring[0]).toMatchObject({ type: "tab_hidden", severity: "critical", turn_id: "t1" });

    while (cv.current_turn) cv = await service.submitAnswer(created.invite_token, cv.current_turn.turn_id, "I built a React app at work.");
    const report = await service.report(created.id);
    expect(report.flags.some((f) => f.type === "other" && f.detail.includes("Switched tab") && f.detail.includes("2×"))).toBe(true);
    expect(report.flags.filter((f) => f.detail.startsWith("Integrity")).length).toBe(2);
  });

  it("summary is empty for a clean interview", () => {
    expect(summarizeProctoring([])).toMatchObject({ total: 0, flags: [], concern: null });
  });
});
