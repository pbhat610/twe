/**
 * Interview integrity (proctoring) rules. Pure and framework-free.
 * Signals come from the browser (tab/window/fullscreen/display/clipboard) and
 * from an open-source face model (MediaPipe) running locally in the candidate's
 * browser. Only event metadata is stored, never video or images.
 */
export const PROCTORING_EVENTS = {
  tab_hidden: { severity: "critical", label: "Switched tab or minimised the window", warning: "You left the interview tab." },
  window_blur: { severity: "warning", label: "Focused another window or app", warning: "Another window took focus." },
  fullscreen_exit: { severity: "warning", label: "Exited full screen", warning: "You exited full screen." },
  extended_display: { severity: "critical", label: "Second display connected", warning: "A second display is connected." },
  copy_paste: { severity: "warning", label: "Copy / paste used", warning: "Copy and paste are not allowed during the interview." },
  no_face: { severity: "critical", label: "Face not visible", warning: "We can't see your face. Please stay in view of the camera." },
  multiple_faces: { severity: "critical", label: "More than one person in view", warning: "More than one person is visible." },
  looking_away: { severity: "warning", label: "Looking away from the screen for a long time", warning: "Please keep your eyes on the screen." },
  voice_without_lips: { severity: "critical", label: "Voice heard while lips weren't moving", warning: "We heard a voice but your lips weren't moving." },
  camera_off: { severity: "critical", label: "Camera turned off", warning: "Your camera turned off. Please turn it back on." },
} as const;

export type ProctoringEventType = keyof typeof PROCTORING_EVENTS;
export type ProctoringSeverity = "warning" | "critical";

export interface ProctoringEvent {
  type: ProctoringEventType;
  severity: ProctoringSeverity;
  at: string;
  turn_id?: string;
  /** Optional measured detail, e.g. "4.2s", "2 faces". */
  detail?: string;
}

export const MAX_STORED_EVENTS = 500;

export interface ProctoringSummary {
  total: number;
  critical: number;
  counts: Partial<Record<ProctoringEventType, number>>;
  /** Short machine-readable flags for the report, e.g. "proctoring:tab_hidden×3". */
  flags: string[];
  /** Human sentence for the report's concerns, or null when clean. */
  concern: string | null;
}

export function summarizeProctoring(events: ProctoringEvent[]): ProctoringSummary {
  const counts: Partial<Record<ProctoringEventType, number>> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const critical = events.filter((e) => e.severity === "critical").length;
  const entries = Object.entries(counts) as [ProctoringEventType, number][];
  const flags = entries.map(([t, n]) => `proctoring:${t}×${n}`);
  const concern = entries.length
    ? `Integrity signals during the interview: ${entries.map(([t, n]) => `${PROCTORING_EVENTS[t].label.toLowerCase()} (${n}×)`).join(", ")}. Review before deciding; these signals don't affect the competency scores.`
    : null;
  return { total: events.length, critical, counts, flags, concern };
}
