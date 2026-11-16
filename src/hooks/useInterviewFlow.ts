"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AvatarHandle } from "@/components/interview/avatar/types";
import { candidateApi, type CandidateView, type SpeechSource } from "@/lib/api";

export type Phase =
  | "loading"
  | "lobby" // device check + Join (also satisfies browser audio policy)
  | "speaking"
  | "awaiting" // candidate's turn
  | "transcribing"
  | "thinking"
  | "closing"
  | "done"
  | "error";

type TurnView = NonNullable<CandidateView["current_turn"]>;

/**
 * Candidate-side conversation loop: speak → listen → submit → speak next.
 * The server decides what comes next; this only sequences UI + audio.
 */
export function useInterviewFlow(
  token: string,
  avatar: RefObject<AvatarHandle | null>,
  opts: { onSpeech?: (src: SpeechSource) => void } = {},
) {
  const api = useMemo(() => candidateApi(token), [token]);
  const { onSpeech } = opts;
  const [session, setSession] = useState<CandidateView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    api
      .view()
      .then((s) => {
        setSession(s);
        setPhase(s.status === "completed" ? "done" : "lobby");
      })
      .catch((e: Error) => {
        setError(e.message);
        setPhase("error");
      });
  }, [api]);

  const speak = useCallback(
    async (utteranceId: string, text: string) => {
      const src = await api.speech(utteranceId, text);
      onSpeech?.(src); // e.g. mix the interviewer's voice into the recording
      await avatar.current?.speak(src);
    },
    [api, avatar, onSpeech],
  );

  const askTurn = useCallback(
    async (turn: TurnView) => {
      avatar.current?.setListening(false);
      setPhase("speaking");
      try {
        await speak(turn.utterance_id, turn.spoken_text);
      } catch {
        /* audio failure shouldn't block the interview; the caption is on screen */
      }
      setPhase("awaiting");
      avatar.current?.setListening(true);
    },
    [speak, avatar],
  );

  const wrapUp = useCallback(
    async (s: CandidateView) => {
      avatar.current?.setListening(false);
      setPhase("closing");
      if (s.closing_utterance_id) {
        await speak(s.closing_utterance_id, s.closing_text ?? "Thank you for your time today.").catch(() => undefined);
      }
      setPhase("done");
    },
    [speak, avatar],
  );

  const join = useCallback(async (recordingConsent: boolean) => {
    try {
      await avatar.current?.unlock();
      setPhase("thinking");
      const s = await api.join(recordingConsent);
      setSession(s);
      if (s.current_turn) await askTurn(s.current_turn);
      else await wrapUp(s);
    } catch (e) {
      setError((e as Error).message);
      setPhase("lobby");
    }
  }, [api, askTurn, wrapUp, avatar]);

  const submit = useCallback(
    async (answer: string, via: "voice" | "text" | "simulated") => {
      const turn = session?.current_turn;
      // Typed/voice answers need words; the scripted "empty" sample answer is allowed through.
      if (!turn || busy.current || (!answer.trim() && via !== "simulated")) return;
      busy.current = true;
      setError(null);
      avatar.current?.setListening(false);
      setPhase("thinking");
      // Optimistically show the answer in the transcript.
      setSession((s) => s && { ...s, turns: s.turns.map((t) => (t.turn_id === turn.turn_id ? { ...t, answer } : t)) });
      try {
        const next = await api.answer(turn.turn_id, answer, via);
        setSession(next);
        if (next.current_turn) await askTurn(next.current_turn);
        else await wrapUp(next);
      } catch (e) {
        setError((e as Error).message);
        setSession((s) => s && { ...s, turns: s.turns.map((t) => (t.turn_id === turn.turn_id ? { ...t, answer: undefined } : t)) });
        setPhase("awaiting");
      } finally {
        busy.current = false;
      }
    },
    [session, api, askTurn, wrapUp, avatar],
  );

  const submitVoice = useCallback(
    async (audio: Blob) => {
      setPhase("transcribing");
      try {
        const text = await api.transcribe(audio);
        if (!text) {
          setError("We didn't catch that. Please try again or type your answer.");
          setPhase("awaiting");
          return;
        }
        await submit(text, "voice");
      } catch (e) {
        setError((e as Error).message);
        setPhase("awaiting");
      }
    },
    [api, submit],
  );

  const simulate = useCallback(async () => {
    try {
      const { text } = await api.simulatedAnswer();
      await submit(text, "simulated");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, submit]);

  const replay = useCallback(async () => {
    const turn = session?.current_turn;
    if (turn && phase === "awaiting") await askTurn(turn);
  }, [session, phase, askTurn]);

  const skipSpeech = useCallback(() => avatar.current?.stop(), [avatar]);

  const endEarly = useCallback(async () => {
    avatar.current?.stop();
    const s = await api.finish();
    setSession(s);
    setPhase("done");
  }, [api, avatar]);

  return { session, phase, error, join, submit, submitVoice, simulate, replay, skipSpeech, endEarly };
}
