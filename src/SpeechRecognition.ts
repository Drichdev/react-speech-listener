import { getNativeSpeechRecognition } from "./environment";
import { RecognitionManager } from "./RecognitionManager";
import type { SpeechRecognitionConstructor, StartListeningOptions } from "./types";

let manager: RecognitionManager | null = null;

const getRecognitionManager = (): RecognitionManager => {
  if (!manager) manager = new RecognitionManager(getNativeSpeechRecognition());
  return manager;
};

/**
 * Contrôle global du micro. L'état est partagé : un appel ici affecte
 * tous les composants qui utilisent `useSpeechRecognition`.
 */
const SpeechRecognition = {
  /** Remplace la reconnaissance native par un polyfill (ex. Azure) compatible Web Speech API. */
  applyPolyfill(Polyfill: SpeechRecognitionConstructor) {
    getRecognitionManager().setSpeechRecognition(Polyfill);
  },
  removePolyfill() {
    getRecognitionManager().setSpeechRecognition(getNativeSpeechRecognition());
  },
  getRecognitionManager,
  getRecognition: () => getRecognitionManager().getRecognition(),

  startListening: (options?: StartListeningOptions) =>
    getRecognitionManager().startListening(options),
  /** Coupe le micro mais termine le traitement de la parole en cours. */
  stopListening: () => getRecognitionManager().stopListening(),
  /** Coupe le micro et abandonne la parole en cours. */
  abortListening: () => getRecognitionManager().abortListening(),

  browserSupportsSpeechRecognition: () =>
    getRecognitionManager().getState().browserSupportsSpeechRecognition,
  browserSupportsContinuousListening: () =>
    getRecognitionManager().getState().browserSupportsContinuousListening,
};

export default SpeechRecognition;
