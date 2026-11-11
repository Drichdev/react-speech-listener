import type {
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from "../src/types";

type Item = { transcript: string; isFinal?: boolean; confidence?: number };

/** Faux moteur Web Speech API, piloté à la main par les tests. */
export class MockSpeechRecognition implements SpeechRecognitionLike {
  static instances: MockSpeechRecognition[] = [];
  static get last() {
    return MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1]!;
  }

  continuous = false;
  interimResults = false;
  lang = "";
  // Comme dans Chrome récent : propriétés présentes dès la construction.
  processLocally = false;
  phrases: unknown = [];
  onresult: SpeechRecognitionLike["onresult"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onaudiostart: SpeechRecognitionLike["onaudiostart"] = null;

  started = false;
  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;
  /** Si `false`, stop()/abort() ne déclenchent pas onend (pour tester le timeout). */
  autoEnd = true;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  start() {
    if (this.started) throw new DOMException("already started", "InvalidStateError");
    this.started = true;
    this.startCalls++;
    queueMicrotask(() => this.onaudiostart?.());
  }
  stop() {
    this.stopCalls++;
    if (this.autoEnd) queueMicrotask(() => this.end());
  }
  abort() {
    this.abortCalls++;
    if (this.autoEnd) queueMicrotask(() => this.end());
  }

  /** Le navigateur termine la session (silence, timeout…). */
  end() {
    if (!this.started) return;
    this.started = false;
    this.onend?.();
  }

  emitResult(items: Item[], resultIndex = 0) {
    const results = items.map((it) => {
      const alt = { transcript: it.transcript, confidence: it.confidence ?? 0.9 };
      return Object.assign([alt], { isFinal: it.isFinal ?? false });
    });
    const event: SpeechRecognitionEventLike = { results, resultIndex };
    this.onresult?.(event);
  }

  emitError(error: string) {
    const event: SpeechRecognitionErrorEventLike = { error };
    this.onerror?.(event);
  }
}

/** Simule un navigateur qui supporte les polyfills (getUserMedia + AudioContext). */
export const stubPolyfillSupport = () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => Promise.resolve({}) },
  });
  (window as unknown as Record<string, unknown>).AudioContext = class {};
};

export const flush = () => new Promise<void>((r) => setTimeout(r, 0));
