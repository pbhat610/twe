"use client";

import { useCallback, useEffect, useState } from "react";
import { recruiterApi, type SessionSummary } from "@/lib/api";

/** Recruiter's interview list, refreshed every few seconds so live statuses move. */
export function useInterviewList(intervalMs = 5000) {
  const [items, setItems] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await recruiterApi.list());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      recruiterApi
        .list()
        .then((r) => alive && (setItems(r), setError(null)))
        .catch((e: Error) => alive && setError(e.message));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { items, error, refresh };
}
