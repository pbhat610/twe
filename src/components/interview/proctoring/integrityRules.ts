import type { ProctoringEventType } from "@/domain/proctoring";
import type { FaceSample } from "./faceMonitor";

/**
 * Turns the stream of face samples (+ mic level) into discrete violations.
 * Each rule must hold for a sustained period, so a blink, a quick glance or
 * a cough never triggers a warning. Pure logic, no DOM: easy to tune and test.
 */
export interface RuleHit {
  type: ProctoringEventType;
  detail: string;
}

const SUSTAIN_MS: Partial<Record<ProctoringEventType, number>> = {
  no_face: 3000,
  multiple_faces: 2000,
  looking_away: 5000,
  // The lip check already looks at a 3 s window, so only a short extra hold.
  voice_without_lips: 400,
};
const LIP_WINDOW_MS = 3000;

export class IntegrityRules {
  private since: Partial<Record<ProctoringEventType, number>> = {};
  private fired = new Set<ProctoringEventType>();
  private mouth: { t: number; v: number; voice: boolean }[] = [];

  /** `voiceActive` = the candidate is recording and the mic hears speech. */
  push(s: FaceSample, voiceActive: boolean): RuleHit[] {
    const hits: RuleHit[] = [];
    const lookingAway =
      s.faces > 0 && (s.yawRatio < 0.28 || s.yawRatio > 0.72 || s.pitchRatio > 0.78 || s.gazeAway > 0.7 || s.gazeDown > 0.65);

    this.mouth.push({ t: s.t, v: s.mouthOpen, voice: voiceActive });
    this.mouth = this.mouth.filter((m) => s.t - m.t <= LIP_WINDOW_MS);
    const voiced = this.mouth.filter((m) => m.voice);
    const mouthRange = voiced.length ? Math.max(...voiced.map((m) => m.v)) - Math.min(...voiced.map((m) => m.v)) : 1;
    // Speech heard for most of the window, face visible, but lips essentially still.
    const voiceWithoutLips = s.faces === 1 && voiced.length >= this.mouth.length * 0.7 && this.mouth.length >= 10 && mouthRange < 0.012;

    const conditions: Partial<Record<ProctoringEventType, [boolean, string]>> = {
      no_face: [s.faces === 0, "no face detected"],
      multiple_faces: [s.faces > 1, `${s.faces} faces`],
      looking_away: [lookingAway, s.gazeDown > 0.65 ? "looking down" : "head/eyes turned away"],
      voice_without_lips: [voiceWithoutLips, "voice heard, lips still"],
    };

    for (const [type, [active, detail]] of Object.entries(conditions) as [ProctoringEventType, [boolean, string]][]) {
      if (!active) {
        delete this.since[type];
        this.fired.delete(type);
        continue;
      }
      this.since[type] ??= s.t;
      const held = s.t - this.since[type]!;
      // Fire once per continuous episode.
      if (held >= SUSTAIN_MS[type]! && !this.fired.has(type)) {
        this.fired.add(type);
        hits.push({ type, detail: `${detail} for ${(held / 1000).toFixed(1)}s` });
      }
    }
    return hits;
  }
}
