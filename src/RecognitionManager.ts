import {
  browserSupportsPolyfills,
  getNativeSpeechRecognition,
  isAndroid,
  isNative,
} from "./environment";
import type {
  RecognitionState,
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  StartListeningOptions,
  TranscriptListener,
} from "./types";
import { concatTranscripts } from "./utils";

type DisconnectType = "STOP" | "ABORT" | "RESET";

/** Erreurs après lesquelles relancer le micro en boucle n'a aucun sens. */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
  "language-not-supported",
]);

/** Si `onend` n'arrive jamais (polyfill capricieux), on libère quand même les `await`. */
const STOP_TIMEOUT_MS = 2000;

export const SERVER_STATE: RecognitionState = Object.freeze({
  listening: false,
  isMicrophoneAvailable: true,
  browserSupportsSpeechRecognition: false,
  browserSupportsContinuousListening: false,
  error: null,
});

const isDOMException = (e: unknown) =>
  typeof DOMException !== "undefined" && e instanceof DOMException;

/**
 * Pilote UNE instance de SpeechRecognition pour toute l'application.
 * L'état du micro est global : tous les hooks voient la même chose.
 * Compatible `useSyncExternalStore` (subscribe / getState / getServerState).
 */
export class RecognitionManager {
  private recognition: SpeechRecognitionLike | null = null;
  private state: RecognitionState = { ...SERVER_STATE };

  private stateListeners = new Set<() => void>();
  private transcriptListeners = new Set<TranscriptListener>();

  /** Une session de reconnaissance est active côté navigateur (start() → end). */
  private running = false;
  private pauseAfterDisconnect = false;
  private fatalError = false;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  private interimTranscript = "";
  private finalTranscript = "";
  private previousResultWasFinalOnly = false;
  private lastFinalOnly = "";

  constructor(SpeechRecognitionCtor: SpeechRecognitionConstructor | null) {
    this.setSpeechRecognition(SpeechRecognitionCtor);
  }

  /* ------------------------- Abonnements / état ------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  getState = (): RecognitionState => this.state;
  getServerState = (): RecognitionState => SERVER_STATE;

  subscribeTranscript(listener: TranscriptListener): () => void {
    this.transcriptListeners.add(listener);
    return () => {
      this.transcriptListeners.delete(listener);
    };
  }

  /** Transcript intermédiaire en cours (utile pour un composant monté en cours d'écoute). */
  getInterimTranscript() {
    return this.interimTranscript;
  }

  getRecognition() {
    return this.recognition;
  }

  private setState(patch: Partial<RecognitionState>) {
    const keys = Object.keys(patch) as Array<keyof RecognitionState>;
    if (keys.every((k) => this.state[k] === patch[k])) return;
    this.state = { ...this.state, ...patch };
    for (const l of [...this.stateListeners]) l();
  }

  private emitTranscript(interim: string, final: string) {
    for (const l of [...this.transcriptListeners]) l.onTranscript(interim, final);
  }

  private emitClear() {
    this.interimTranscript = "";
    this.finalTranscript = "";
    this.previousResultWasFinalOnly = false;
    this.lastFinalOnly = "";
    for (const l of [...this.transcriptListeners]) l.onClear();
  }

  /* ------------------------------ Moteur ------------------------------- */

  setSpeechRecognition(Ctor: SpeechRecognitionConstructor | null | undefined) {
    this.detach();

    const supported = !!Ctor && (isNative(Ctor) || browserSupportsPolyfills());
    if (supported && Ctor) {
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = this.handleResult;
      recognition.onend = this.handleEnd;
      recognition.onerror = this.handleError;
      recognition.onaudiostart = this.handleAudioStart;
      this.recognition = recognition;
    }

    this.setState({
      browserSupportsSpeechRecognition: supported,
      // Chrome Android relance le micro (bip) en continu : on ne l'annonce pas comme supporté.
      browserSupportsContinuousListening: supported && (!isNative(Ctor) || !isAndroid()),
      listening: false,
    });
  }

  /** Débranche proprement l'ancienne instance (changement de polyfill). */
  private detach() {
    const old = this.recognition;
    if (!old) return;
    old.onresult = null;
    old.onend = null;
    old.onerror = null;
    old.onaudiostart = null;
    if (this.running) {
      try {
        old.abort();
      } catch {
        /* déjà arrêtée */
      }
    }
    this.running = false;
    this.clearStop();
    this.recognition = null;
  }

  private clearStop() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.stopPromise = null;
    const resolve = this.resolveStop;
    this.resolveStop = null;
    resolve?.();
  }

  private handleAudioStart = () => {
    this.setState({ isMicrophoneAvailable: true });
  };

  private handleError = (event: SpeechRecognitionErrorEventLike) => {
    const error = event?.error;
    // "aborted" est la conséquence normale de abort(), pas un vrai problème.
    if (!error || error === "aborted") return;
    if (FATAL_ERRORS.has(error)) this.fatalError = true;
    if (error === "not-allowed" || error === "service-not-allowed") {
      // On NE désactive pas la reconnaissance : l'utilisateur peut accorder le micro plus tard.
      this.setState({ isMicrophoneAvailable: false, error });
    } else {
      this.setState({ error });
    }
  };

  private handleEnd = () => {
    // Fin tardive (déjà traitée par le timeout de sécurité) : on ignore.
    if (!this.running && !this.stopPromise) return;

    this.running = false;
    const paused = this.pauseAfterDisconnect;
    this.pauseAfterDisconnect = false;
    this.clearStop();

    const recognition = this.recognition;
    if (paused || !recognition) {
      this.setState({ listening: false });
      return;
    }
    if (recognition.continuous && !this.fatalError) {
      this.restart(recognition);
    } else {
      this.setState({ listening: false });
    }
  };

  /** Le navigateur coupe régulièrement les sessions continues : on relance sans bruit. */
  private restart(recognition: SpeechRecognitionLike) {
    try {
      const result = recognition.start();
      this.running = true;
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch(() => {
          this.running = false;
          this.setState({ listening: false });
        });
      }
    } catch {
      this.running = false;
      this.setState({ listening: false });
    }
  }

  private handleResult = (event: SpeechRecognitionEventLike) => {
    this.setState({ isMicrophoneAvailable: true });

    const { results } = event;
    const start = event.resultIndex === undefined ? results.length - 1 : event.resultIndex;
    const android = isAndroid();

    let interim = "";
    let final = "";
    for (let i = Math.max(start, 0); i < results.length; i++) {
      const result = results[i];
      const best = result?.[0];
      if (!result || !best) continue;
      // Android renvoie des finals avec confidence 0 qui sont des doublons.
      if (result.isFinal && (!android || best.confidence > 0)) {
        final = concatTranscripts(final, best.transcript);
      } else {
        interim = concatTranscripts(interim, best.transcript);
      }
    }

    this.interimTranscript = interim;
    this.finalTranscript = final;

    const finalOnly = interim === "" && final !== "";
    // Android peut émettre deux fois le même résultat final d'affilée.
    const duplicate =
      android && finalOnly && this.previousResultWasFinalOnly && final === this.lastFinalOnly;
    this.previousResultWasFinalOnly = finalOnly;
    this.lastFinalOnly = finalOnly ? final : "";

    if (!duplicate) this.emitTranscript(interim, final);
  };

  /* --------------------------- API publique --------------------------- */

  private disconnect(type: DisconnectType): Promise<void> {
    const recognition = this.recognition;

    if (!recognition || !this.running) {
      if (type !== "RESET") this.setState({ listening: false });
      return Promise.resolve();
    }

    if (this.stopPromise) {
      if (type === "ABORT") {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
      return this.stopPromise;
    }

    this.pauseAfterDisconnect = type !== "RESET";
    const promise = new Promise<void>((resolve) => {
      this.resolveStop = resolve;
    });
    this.stopPromise = promise;
    this.stopTimer = setTimeout(this.handleEnd, STOP_TIMEOUT_MS);

    try {
      if (type === "STOP") recognition.stop();
      else recognition.abort();
    } catch {
      /* ignore : onend / timeout prendront le relais */
    }
    if (type !== "RESET") this.setState({ listening: false });
    return promise;
  }

  /** Vide le transcript. En écoute continue, relance la session pour repartir de zéro. */
  resetTranscript = () => {
    void this.disconnect("RESET");
  };

  stopListening = async () => {
    await this.disconnect("STOP");
  };

  abortListening = async () => {
    await this.disconnect("ABORT");
  };

  startListening = async (options: StartListeningOptions = {}) => {
    if (!this.recognition) return;
    if (this.stopPromise) await this.stopPromise;

    // La reconnaissance a pu être remplacée (polyfill) pendant l'attente.
    const recognition = this.recognition as SpeechRecognitionLike | null;
    if (!recognition) return;

    const { continuous = false, interimResults = true, processLocally, phrases } = options;
    const language = options.language ?? recognition.lang;

    const configChanged =
      continuous !== recognition.continuous ||
      language !== recognition.lang ||
      interimResults !== recognition.interimResults;

    if (configChanged && this.running) await this.stopListening();

    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    if (language !== undefined) recognition.lang = language;
    this.applyOptionalFeatures(recognition, processLocally, phrases);

    if (this.running) return;

    if (!continuous) this.emitClear();

    this.fatalError = false;
    try {
      await recognition.start();
      this.running = true;
      this.setState({ listening: true, error: null });
    } catch (e) {
      // Une DOMException = start() redondant (déjà démarré) : sans danger.
      if (!isDOMException(e)) this.setState({ isMicrophoneAvailable: false });
    }
  };

  /** `processLocally` et `phrases` n'existent que dans les navigateurs récents. */
  private applyOptionalFeatures(
    recognition: SpeechRecognitionLike,
    processLocally: boolean | undefined,
    phrases: StartListeningOptions["phrases"],
  ) {
    try {
      if (processLocally !== undefined && "processLocally" in recognition) {
        recognition.processLocally = processLocally;
      }
      if (phrases && "phrases" in recognition) {
        const PhraseCtor = (globalThis as { SpeechRecognitionPhrase?: new (p: string, b?: number) => unknown })
          .SpeechRecognitionPhrase;
        recognition.phrases = PhraseCtor
          ? phrases.map((p) => new PhraseCtor(p.phrase, p.boost))
          : phrases;
      }
    } catch {
      /* fonctionnalité optionnelle : on ignore si le navigateur refuse */
    }
  }
}

export { getNativeSpeechRecognition };
