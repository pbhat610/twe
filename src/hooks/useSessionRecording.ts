"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionRecorder, type RecorderStatus } from "@/components/interview/recording/sessionRecorder";
import { candidateApi, type SpeechSource } from "@/lib/api";

/** Candidate-side interview recording (camera + mic + interviewer voice), uploaded as it happens. */
export function useSessionRecording(token: string) {
  const [status, setStatus] = useState<RecorderStatus>({ state: "idle", uploaded: 0, failed: 0 });
  const recorder = useMemo(() => {
    const api = candidateApi(token);
    return new SessionRecorder((seq, chunk) => api.uploadChunk(seq, chunk), setStatus);
  }, [token]);

  useEffect(() => () => recorder.dispose(), [recorder]);

  const start = useCallback((camera: MediaStream) => recorder.start(camera), [recorder]);
  const stop = useCallback(() => recorder.stop(), [recorder]);
  const addSpeech = useCallback(
    (src: SpeechSource) => {
      if (src.kind === "audio") void recorder.addInterviewerAudio(src.data);
    },
    [recorder],
  );

  return { status, start, stop, addSpeech };
}
