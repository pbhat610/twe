export const STATUS_META = {
  invited: { label: "Waiting", tone: "neutral" },
  in_progress: { label: "Live", tone: "brand" },
  completed: { label: "Completed", tone: "good" },
} as const;

export const REC_TONE = { advance: "good", hold: "warn", reject: "bad" } as const;
