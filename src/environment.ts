import type { SpeechRecognitionConstructor } from "./types";

type AnyWindow = Window & Record<string, unknown>;

/** Résolu à chaque appel (jamais au chargement du module) pour rester sûr en SSR. */
export const getNativeSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as AnyWindow;
  return (
    (w.SpeechRecognition ||
      w.webkitSpeechRecognition ||
      w.mozSpeechRecognition ||
      w.msSpeechRecognition ||
      w.oSpeechRecognition ||
      null) as SpeechRecognitionConstructor | null
  );
};

export const isNative = (ctor: SpeechRecognitionConstructor | null | undefined) =>
  !!ctor && ctor === getNativeSpeechRecognition();

export const isAndroid = () =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/** Un polyfill (Azure…) a besoin de getUserMedia et d'un AudioContext. */
export const browserSupportsPolyfills = () => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as AnyWindow;
  return (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices !== undefined &&
    navigator.mediaDevices.getUserMedia !== undefined &&
    (w.AudioContext !== undefined || w.webkitAudioContext !== undefined)
  );
};
