/**
 * Offline fallback voice using the browser's built-in speech synthesis.
 * Used when the server has no TTS (no API key) so the demo still talks.
 */
let finishCurrent: (() => void) | null = null;

export function speakWithBrowserVoice(text: string, onActivity?: (active: boolean) => void): Promise<void> {
  stopBrowserVoice();
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      finishCurrent = null;
      onActivity?.(false);
      resolve();
    };
    // Chrome sometimes never fires `onend` (or anything after cancel); cap by estimated duration.
    const words = text.split(/\s+/).length;
    const safety = setTimeout(() => {
      window.speechSynthesis.cancel();
      done();
    }, (words / 2.4) * 1000 + 2500);
    finishCurrent = done;

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => /en[-_](US|GB)/i.test(v.lang) && /female|samantha|google us|aria|jenny/i.test(v.name));
    if (voice) u.voice = voice;
    u.onstart = () => onActivity?.(true);
    u.onend = done;
    u.onerror = done;
    onActivity?.(true);
    window.speechSynthesis.speak(u);
  });
}

export function stopBrowserVoice() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  finishCurrent?.();
}
