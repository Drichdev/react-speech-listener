import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecognitionManager } from "../src/RecognitionManager";
import { MockSpeechRecognition, flush, stubPolyfillSupport } from "./mock";

const win = window as unknown as Record<string, unknown>;

const make = () => {
  const manager = new RecognitionManager(MockSpeechRecognition);
  return { manager, rec: MockSpeechRecognition.last };
};

beforeEach(() => {
  MockSpeechRecognition.instances = [];
  win.SpeechRecognition = MockSpeechRecognition;
});

afterEach(() => {
  delete win.SpeechRecognition;
  delete win.AudioContext;
  vi.useRealTimers();
});

describe("support navigateur", () => {
  it("natif : supporté, continu supporté", () => {
    const { manager } = make();
    expect(manager.getState().browserSupportsSpeechRecognition).toBe(true);
    expect(manager.getState().browserSupportsContinuousListening).toBe(true);
  });

  it("aucun moteur : non supporté, startListening ne plante pas", async () => {
    const manager = new RecognitionManager(null);
    expect(manager.getState().browserSupportsSpeechRecognition).toBe(false);
    await expect(manager.startListening()).resolves.toBeUndefined();
    await expect(manager.stopListening()).resolves.toBeUndefined();
  });

  it("polyfill refusé sans getUserMedia/AudioContext, accepté avec", () => {
    delete win.SpeechRecognition;
    class Poly extends MockSpeechRecognition {}
    const manager = new RecognitionManager(Poly);
    expect(manager.getState().browserSupportsSpeechRecognition).toBe(false);

    stubPolyfillSupport();
    manager.setSpeechRecognition(Poly);
    expect(manager.getState().browserSupportsSpeechRecognition).toBe(true);
    expect(manager.getState().browserSupportsContinuousListening).toBe(true);
  });

  it("Chrome Android : continu non supporté", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Chrome/120");
    const { manager } = make();
    expect(manager.getState().browserSupportsSpeechRecognition).toBe(true);
    expect(manager.getState().browserSupportsContinuousListening).toBe(false);
  });
});

describe("start / stop / abort", () => {
  it("start : listening = true, config appliquée", async () => {
    const { manager, rec } = make();
    await manager.startListening({ continuous: true, language: "fr-FR" });
    expect(manager.getState().listening).toBe(true);
    expect(rec.continuous).toBe(true);
    expect(rec.lang).toBe("fr-FR");
    expect(rec.interimResults).toBe(true);
  });

  it("stop : appelle stop(), listening = false, la promesse se résout", async () => {
    const { manager, rec } = make();
    await manager.startListening();
    await manager.stopListening();
    expect(rec.stopCalls).toBe(1);
    expect(manager.getState().listening).toBe(false);
  });

  it("abort : appelle abort()", async () => {
    const { manager, rec } = make();
    await manager.startListening();
    await manager.abortListening();
    expect(rec.abortCalls).toBe(1);
    expect(manager.getState().listening).toBe(false);
  });

  it("stop quand on n'écoute pas : se résout tout de suite (pas de blocage)", async () => {
    const { manager } = make();
    const winner = await Promise.race([
      manager.stopListening().then(() => "done"),
      new Promise((r) => setTimeout(() => r("hang"), 100)),
    ]);
    expect(winner).toBe("done");
  });

  it("deuxième start pendant l'écoute : no-op", async () => {
    const { manager, rec } = make();
    await manager.startListening();
    await manager.startListening();
    expect(rec.startCalls).toBe(1);
  });

  it("start pendant un stop en cours : attend la fin puis redémarre", async () => {
    const { manager, rec } = make();
    await manager.startListening();
    const stopping = manager.stopListening();
    const starting = manager.startListening();
    await Promise.all([stopping, starting]);
    expect(rec.startCalls).toBe(2);
    expect(manager.getState().listening).toBe(true);
  });

  it("start redondant (DOMException) : avalé, micro toujours disponible", async () => {
    const { manager, rec } = make();
    rec.started = true; // le navigateur croit déjà écouter
    await manager.startListening();
    expect(manager.getState().isMicrophoneAvailable).toBe(true);
    expect(manager.getState().listening).toBe(false);
  });

  it("fin naturelle (silence) en mode simple : listening = false", async () => {
    const { manager, rec } = make();
    await manager.startListening();
    rec.end();
    expect(manager.getState().listening).toBe(false);
  });

  it("timeout de sécurité si onend n'arrive jamais", async () => {
    vi.useFakeTimers();
    const { manager, rec } = make();
    await manager.startListening();
    rec.autoEnd = false;
    const stopping = manager.stopListening();
    await vi.advanceTimersByTimeAsync(2100);
    await expect(stopping).resolves.toBeUndefined();
  });
});

describe("mode continu", () => {
  it("relance la session quand le navigateur la coupe", async () => {
    const { manager, rec } = make();
    await manager.startListening({ continuous: true });
    rec.end();
    expect(rec.startCalls).toBe(2);
    expect(manager.getState().listening).toBe(true);
  });

  it("ne relance PAS après une erreur fatale (évite la boucle infinie)", async () => {
    const { manager, rec } = make();
    await manager.startListening({ continuous: true });
    rec.emitError("network");
    rec.end();
    expect(rec.startCalls).toBe(1);
    expect(manager.getState().listening).toBe(false);
    expect(manager.getState().error).toBe("network");
  });

  it("no-speech n'est pas fatal : on relance", async () => {
    const { manager, rec } = make();
    await manager.startListening({ continuous: true });
    rec.emitError("no-speech");
    rec.end();
    expect(rec.startCalls).toBe(2);
    expect(manager.getState().listening).toBe(true);
  });

  it("changer la langue en écoutant redémarre avec la nouvelle langue", async () => {
    const { manager, rec } = make();
    await manager.startListening({ continuous: true, language: "en-US" });
    await manager.startListening({ continuous: true, language: "fr-FR" });
    expect(rec.lang).toBe("fr-FR");
    expect(rec.startCalls).toBe(2);
    expect(manager.getState().listening).toBe(true);
  });

  it("resetTranscript relance la session pour repartir de zéro", async () => {
    const { manager, rec } = make();
    await manager.startListening({ continuous: true });
    manager.resetTranscript();
    await flush();
    expect(rec.abortCalls).toBe(1);
    expect(rec.startCalls).toBe(2);
    expect(manager.getState().listening).toBe(true);
  });
});

describe("micro refusé", () => {
  it("not-allowed : isMicrophoneAvailable = false, puis récupération si accordé", async () => {
    const { manager, rec } = make();
    await manager.startListening();
    rec.emitError("not-allowed");
    rec.end();
    expect(manager.getState().isMicrophoneAvailable).toBe(false);
    expect(manager.getState().listening).toBe(false);

    // L'utilisateur accorde le micro, la reconnaissance n'est pas morte.
    await manager.startListening();
    expect(manager.getState().listening).toBe(true);
    rec.emitResult([{ transcript: "ça marche", isFinal: true }]);
    expect(manager.getState().isMicrophoneAvailable).toBe(true);
  });

  it("une erreur non-DOMException au start() marque le micro indisponible", async () => {
    const { manager, rec } = make();
    rec.start = () => {
      throw new Error("boom");
    };
    await manager.startListening();
    expect(manager.getState().isMicrophoneAvailable).toBe(false);
  });
});

describe("transcript", () => {
  it("émet interim puis final", async () => {
    const { manager, rec } = make();
    const events: Array<[string, string]> = [];
    manager.subscribeTranscript({ onTranscript: (i, f) => events.push([i, f]), onClear: () => {} });
    await manager.startListening();

    rec.emitResult([{ transcript: "hello wor" }]);
    rec.emitResult([{ transcript: "hello world", isFinal: true }]);

    expect(events).toEqual([
      ["hello wor", ""],
      ["", "hello world"],
    ]);
  });

  it("respecte resultIndex en mode continu (ne ré-émet pas l'ancien)", async () => {
    const { manager, rec } = make();
    const events: Array<[string, string]> = [];
    manager.subscribeTranscript({ onTranscript: (i, f) => events.push([i, f]), onClear: () => {} });
    await manager.startListening({ continuous: true });

    rec.emitResult([{ transcript: "one", isFinal: true }, { transcript: "tw" }], 1);
    expect(events).toEqual([["tw", ""]]);
  });

  it("start en mode simple vide le transcript (onClear)", async () => {
    const { manager } = make();
    const onClear = vi.fn();
    manager.subscribeTranscript({ onTranscript: () => {}, onClear });
    await manager.startListening();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("start en mode continu ne vide PAS le transcript", async () => {
    const { manager } = make();
    const onClear = vi.fn();
    manager.subscribeTranscript({ onTranscript: () => {}, onClear });
    await manager.startListening({ continuous: true });
    expect(onClear).not.toHaveBeenCalled();
  });

  it("se désabonne correctement", async () => {
    const { manager, rec } = make();
    const onTranscript = vi.fn();
    const off = manager.subscribeTranscript({ onTranscript, onClear: () => {} });
    await manager.startListening();
    off();
    rec.emitResult([{ transcript: "x", isFinal: true }]);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("Android : ignore les finals confidence 0 et les doublons consécutifs", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
    const { manager, rec } = make();
    const events: Array<[string, string]> = [];
    manager.subscribeTranscript({ onTranscript: (i, f) => events.push([i, f]), onClear: () => {} });
    await manager.startListening();

    rec.emitResult([{ transcript: "ghost", isFinal: true, confidence: 0 }]);
    rec.emitResult([{ transcript: "hello", isFinal: true, confidence: 0.9 }]);
    rec.emitResult([{ transcript: "hello", isFinal: true, confidence: 0.9 }]);

    expect(events).toEqual([
      ["ghost", ""], // confidence 0 => traité comme intermédiaire
      ["", "hello"],
    ]);
  });
});

describe("options MDN (processLocally / phrases)", () => {
  it("transmet processLocally et phrases si le moteur les supporte", async () => {
    const { manager, rec } = make();
    await manager.startListening({
      processLocally: true,
      phrases: [{ phrase: "Drichdev", boost: 5 }],
    });
    expect(rec.processLocally).toBe(true);
    expect(rec.phrases).toEqual([{ phrase: "Drichdev", boost: 5 }]);
  });

  it("ignore ces options si le moteur ne les connaît pas", async () => {
    const { manager, rec } = make();
    // biome-ignore lint/performance/noDelete: simulation d'un navigateur sans ces propriétés
    delete (rec as { processLocally?: boolean }).processLocally;
    delete (rec as { phrases?: unknown }).phrases;
    await manager.startListening({ processLocally: true, phrases: [{ phrase: "x" }] });
    expect("processLocally" in rec).toBe(false);
    expect("phrases" in rec).toBe(false);
  });
});

describe("changement de moteur", () => {
  it("remplacer le moteur coupe l'ancien proprement", async () => {
    const { manager, rec: first } = make();
    await manager.startListening();
    manager.setSpeechRecognition(MockSpeechRecognition);
    const second = MockSpeechRecognition.last;
    expect(second).not.toBe(first);
    expect(first.abortCalls).toBe(1);
    expect(first.onresult).toBeNull();
    expect(manager.getState().listening).toBe(false);
  });
});

describe("store (useSyncExternalStore)", () => {
  it("la référence de l'état ne change que si une valeur change", async () => {
    const { manager } = make();
    const listener = vi.fn();
    manager.subscribe(listener);
    const before = manager.getState();
    await manager.startListening();
    expect(manager.getState()).not.toBe(before);
    const after = manager.getState();
    await manager.startListening(); // no-op
    expect(manager.getState()).toBe(after);
  });

  it("l'état serveur (SSR) est stable et « non supporté »", () => {
    const { manager } = make();
    expect(manager.getServerState()).toBe(manager.getServerState());
    expect(manager.getServerState().browserSupportsSpeechRecognition).toBe(false);
  });
});
