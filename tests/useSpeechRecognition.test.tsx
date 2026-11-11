import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpeechRecognition, { useSpeechRecognition } from "../src";
import { MockSpeechRecognition } from "./mock";

const win = window as unknown as Record<string, unknown>;

const rec = () => MockSpeechRecognition.last;
const start = (opts?: Parameters<typeof SpeechRecognition.startListening>[0]) =>
  act(async () => {
    await SpeechRecognition.startListening(opts);
  });
const emit = (...args: Parameters<MockSpeechRecognition["emitResult"]>) =>
  act(() => {
    rec().emitResult(...args);
  });

beforeEach(() => {
  MockSpeechRecognition.instances = [];
  win.SpeechRecognition = MockSpeechRecognition;
  SpeechRecognition.applyPolyfill(MockSpeechRecognition); // nouvelle instance propre
});

afterEach(() => {
  cleanup();
  delete win.SpeechRecognition;
});

describe("useSpeechRecognition", () => {
  it("valeurs initiales", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current).toMatchObject({
      transcript: "",
      interimTranscript: "",
      finalTranscript: "",
      listening: false,
      isMicrophoneAvailable: true,
      browserSupportsSpeechRecognition: true,
      error: null,
    });
  });

  it("listening suit start / stop", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await start();
    expect(result.current.listening).toBe(true);
    await act(async () => {
      await SpeechRecognition.stopListening();
    });
    expect(result.current.listening).toBe(false);
  });

  it("transcript = final + intermédiaire", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await start({ continuous: true });

    await emit([{ transcript: "hello wor" }]);
    expect(result.current.interimTranscript).toBe("hello wor");
    expect(result.current.transcript).toBe("hello wor");

    await emit([{ transcript: "hello world", isFinal: true }]);
    expect(result.current.finalTranscript).toBe("hello world");
    expect(result.current.interimTranscript).toBe("");

    await emit([{ transcript: "hello world", isFinal: true }, { transcript: "how are" }], 1);
    expect(result.current.transcript).toBe("hello world how are");
  });

  it("accumule les résultats finaux successifs", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await start({ continuous: true });
    await emit([{ transcript: "one", isFinal: true }]);
    await emit([{ transcript: "one", isFinal: true }, { transcript: "two", isFinal: true }], 1);
    expect(result.current.finalTranscript).toBe("one two");
  });

  it("resetTranscript vide le transcript", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await start({ continuous: true });
    await emit([{ transcript: "bye", isFinal: true }]);
    expect(result.current.transcript).toBe("bye");
    await act(async () => {
      result.current.resetTranscript();
    });
    expect(result.current.transcript).toBe("");
  });

  it("clearTranscriptOnListen (défaut) vide au redémarrage", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await start();
    await emit([{ transcript: "first", isFinal: true }]);
    await act(async () => {
      await SpeechRecognition.stopListening();
    });
    expect(result.current.transcript).toBe("first");
    await start();
    expect(result.current.transcript).toBe("");
  });

  it("clearTranscriptOnListen: false conserve le transcript", async () => {
    const { result } = renderHook(() => useSpeechRecognition({ clearTranscriptOnListen: false }));
    await start();
    await emit([{ transcript: "keep me", isFinal: true }]);
    await act(async () => {
      await SpeechRecognition.stopListening();
    });
    await start();
    expect(result.current.transcript).toBe("keep me");
  });

  it("transcribing: false ne met pas à jour le transcript mais les commandes fonctionnent", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ transcribing: false, commands: [{ command: "ping", callback }] }),
    );
    await start();
    await emit([{ transcript: "ping", isFinal: true }]);
    expect(result.current.transcript).toBe("");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("commandes : déclenchées sur résultat final, avec resetTranscript dans le contexte", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({
        commands: [{ command: "order *", callback: (item, ctx) => callback(item, ctx.resetTranscript()) }],
      }),
    );
    await start({ continuous: true });
    await emit([{ transcript: "order pizza", isFinal: true }]);
    expect(callback.mock.calls[0]![0]).toBe("pizza");
    expect(result.current.transcript).toBe("");
  });

  it("utilise toujours la dernière liste de commandes (pas de callback périmé)", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useSpeechRecognition({ commands: [{ command: "go", callback: cb }] }),
      { initialProps: { cb: first } },
    );
    await start({ continuous: true });
    rerender({ cb: second });
    await emit([{ transcript: "go", isFinal: true }]);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("deux hooks partagent le micro mais gardent un transcript local", async () => {
    const a = renderHook(() => useSpeechRecognition());
    const b = renderHook(() => useSpeechRecognition());
    await start({ continuous: true });
    expect(a.result.current.listening).toBe(true);
    expect(b.result.current.listening).toBe(true);

    await emit([{ transcript: "shared", isFinal: true }]);
    expect(a.result.current.transcript).toBe("shared");
    expect(b.result.current.transcript).toBe("shared");

    await act(async () => {
      a.result.current.resetTranscript();
    });
    expect(a.result.current.transcript).toBe("");
    expect(b.result.current.transcript).toBe("shared");
  });

  it("un composant monté en cours d'écoute récupère l'intermédiaire courant", async () => {
    await start({ continuous: true });
    await emit([{ transcript: "already talking" }]);
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.interimTranscript).toBe("already talking");
  });

  it("après démontage : plus d'abonnement (pas d'erreur sur un nouvel événement)", async () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() =>
      useSpeechRecognition({ commands: [{ command: "x", callback }] }),
    );
    await start({ continuous: true });
    unmount();
    await emit([{ transcript: "x", isFinal: true }]);
    expect(callback).not.toHaveBeenCalled();
  });

  it("ne re-rend pas si l'intermédiaire est identique", async () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useSpeechRecognition();
    });
    await start({ continuous: true });
    await emit([{ transcript: "same" }]);
    const after = renders;
    await emit([{ transcript: "same" }]);
    expect(renders).toBe(after);
  });

  it("micro refusé : isMicrophoneAvailable passe à false", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await start();
    act(() => {
      rec().emitError("not-allowed");
      rec().end();
    });
    expect(result.current.isMicrophoneAvailable).toBe(false);
    expect(result.current.error).toBe("not-allowed");
    expect(result.current.listening).toBe(false);
  });

  it("l'API globale reflète le support", () => {
    expect(SpeechRecognition.browserSupportsSpeechRecognition()).toBe(true);
    expect(SpeechRecognition.browserSupportsContinuousListening()).toBe(true);
    expect(SpeechRecognition.getRecognition()).toBe(rec());
  });
});
