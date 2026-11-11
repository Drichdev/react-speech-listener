import { describe, expect, it, vi } from "vitest";
import { runCommands } from "../src/commands";

const reset = () => {};

describe("runCommands", () => {
  it("passe les paramètres du splat puis le contexte", () => {
    const cb = vi.fn();
    runCommands([{ command: "I would like to order *", callback: cb }], "", "I would like to order tea", reset);
    expect(cb).toHaveBeenCalledWith("tea", { command: "I would like to order *", resetTranscript: reset });
  });

  it("plusieurs splats = plusieurs arguments", () => {
    const cb = vi.fn();
    runCommands([{ command: "top sports are * and *", callback: cb }], "", "top sports are golf and rugby", reset);
    expect(cb.mock.calls[0]!.slice(0, 2)).toEqual(["golf", "rugby"]);
  });

  it("tableau de commandes : indique laquelle a matché", () => {
    const cb = vi.fn();
    runCommands([{ command: ["Hello", "Hi"], callback: cb }], "", "hi", reset);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].command).toBe("Hi");
  });

  it("ignore l'intermédiaire sans matchInterim", () => {
    const cb = vi.fn();
    runCommands([{ command: "hello", callback: cb }], "hello", "", reset);
    expect(cb).not.toHaveBeenCalled();
  });

  it("matchInterim teste l'intermédiaire quand il n'y a pas de final", () => {
    const cb = vi.fn();
    runCommands([{ command: "hello", callback: cb, matchInterim: true }], "hello", "", reset);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("une entrée vide ne déclenche jamais une commande '*'", () => {
    const cb = vi.fn();
    runCommands([{ command: "*", callback: cb, matchInterim: true }], "", "", reset);
    expect(cb).not.toHaveBeenCalled();
  });

  it("mode flou : (commande, parole, similarité, contexte)", () => {
    const cb = vi.fn();
    runCommands(
      [{ command: "Beijing", callback: cb, isFuzzyMatch: true, fuzzyMatchingThreshold: 0.2 }],
      "",
      "Benji",
      reset,
    );
    const [command, spoken, similarity, ctx] = cb.mock.calls[0]!;
    expect(command).toBe("Beijing");
    expect(spoken).toBe("Benji");
    expect(similarity).toBeGreaterThanOrEqual(0.2);
    expect(ctx.resetTranscript).toBe(reset);
  });

  it("mode flou : en dessous du seuil, rien", () => {
    const cb = vi.fn();
    runCommands([{ command: "Beijing", callback: cb, isFuzzyMatch: true }], "", "Paris", reset);
    expect(cb).not.toHaveBeenCalled();
  });

  it("bestMatchOnly : un seul callback, le plus proche", () => {
    const cb = vi.fn();
    runCommands(
      [
        {
          command: ["eat", "eats", "sleep"],
          callback: cb,
          isFuzzyMatch: true,
          fuzzyMatchingThreshold: 0.2,
          bestMatchOnly: true,
        },
      ],
      "",
      "eat",
      reset,
    );
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).toBe("eat");
  });
});
