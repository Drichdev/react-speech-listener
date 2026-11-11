/**
 * Types minimaux de la Web Speech API.
 * On ne dépend pas de lib.dom car `SpeechRecognition` n'y est pas toujours typé
 * et les polyfills (Azure, etc.) n'implémentent qu'un sous-ensemble.
 */
export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike
  extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
}

export interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  processLocally?: boolean;
  phrases?: unknown;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onaudiostart: ((event?: unknown) => void) | null;
  start(): void | Promise<void>;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** Un terme à privilégier (contextual biasing, voir MDN `SpeechRecognition.phrases`). */
export interface SpeechPhrase {
  phrase: string;
  /** Entre 0 et 10, 1 par défaut. */
  boost?: number;
}

export interface StartListeningOptions {
  /** Continue d'écouter après une pause de l'utilisateur. Défaut : `false`. */
  continuous?: boolean;
  /** Tag BCP 47, ex. `"fr-FR"`. Sans valeur, la langue précédente (ou celle du navigateur) est conservée. */
  language?: string;
  /** Résultats intermédiaires. Défaut : `true`. */
  interimResults?: boolean;
  /** Reconnaissance sur l'appareil uniquement (si le navigateur le supporte). */
  processLocally?: boolean;
  /** Mots/expressions à favoriser (si le navigateur le supporte). */
  phrases?: SpeechPhrase[];
}

export interface RecognitionState {
  listening: boolean;
  isMicrophoneAvailable: boolean;
  browserSupportsSpeechRecognition: boolean;
  browserSupportsContinuousListening: boolean;
  /** Dernier code d'erreur de l'API (`"no-speech"`, `"network"`…), `null` sinon. */
  error: string | null;
}

export interface TranscriptListener {
  onTranscript: (interimTranscript: string, finalTranscript: string) => void;
  onClear: () => void;
}

/* ------------------------------- Commandes ------------------------------- */

export interface CommandContext {
  /** La commande qui a déclenché le callback. */
  command: string | RegExp;
  resetTranscript: () => void;
}

export interface SpeechCommand {
  /** Phrase, RegExp, ou tableau des deux. Supporte `*`, `:nom` et `(optionnel)`. */
  command: string | RegExp | Array<string | RegExp>;
  /**
   * Mode exact : `callback(...paramètres, contexte)`.
   * Mode flou : `callback(commande, phraseDite, similarité, contexte)`.
   */
  // biome-ignore lint/suspicious/noExplicitAny: la signature dépend du mode de matching
  callback: (...args: any[]) => void;
  /** Teste aussi les résultats intermédiaires (plus réactif, plus de faux positifs). */
  matchInterim?: boolean;
  isFuzzyMatch?: boolean;
  /** Entre 0 et 1, défaut `0.8`. */
  fuzzyMatchingThreshold?: number;
  /** En mode flou, ne déclenche que la commande la plus proche. */
  bestMatchOnly?: boolean;
}

export interface UseSpeechRecognitionOptions {
  /** Met à jour le transcript. Défaut : `true`. */
  transcribing?: boolean;
  /** Vide le transcript à chaque `startListening` (hors mode continu). Défaut : `true`. */
  clearTranscriptOnListen?: boolean;
  commands?: SpeechCommand[];
}

export interface UseSpeechRecognitionReturn extends RecognitionState {
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  resetTranscript: () => void;
}
