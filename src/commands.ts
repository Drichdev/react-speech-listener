import type { SpeechCommand } from "./types";
import { commandToRegExp, diceCoefficient } from "./utils";

const SPECIAL_CHARS = /[&/\\#,+()!$~%.'":*?<>{}]/g;

interface FuzzyHit {
  command: string | RegExp;
  withoutSpecials: string;
  similarity: number;
}

const fuzzyTest = (
  command: string | RegExp,
  input: string,
  threshold: number,
): FuzzyHit | null => {
  const withoutSpecials = String(command)
    .replace(SPECIAL_CHARS, "")
    .replace(/ {2,}/g, " ")
    .trim();
  const similarity = diceCoefficient(withoutSpecials, input);
  return similarity >= threshold ? { command, withoutSpecials, similarity } : null;
};

/**
 * Compare la parole reconnue à la liste de commandes et déclenche les callbacks.
 * Fonction pure (hors callbacks) : facile à tester, aucun état React.
 */
export const runCommands = (
  commands: readonly SpeechCommand[],
  interimTranscript: string,
  finalTranscript: string,
  resetTranscript: () => void,
): void => {
  for (const spec of commands) {
    const {
      command,
      callback,
      matchInterim = false,
      isFuzzyMatch = false,
      fuzzyMatchingThreshold = 0.8,
      bestMatchOnly = false,
    } = spec;

    const input = !finalTranscript && matchInterim ? interimTranscript.trim() : finalTranscript.trim();
    // Une entrée vide ne doit jamais déclencher de commande (ex. une commande "*").
    if (!input) continue;

    const subcommands = Array.isArray(command) ? command : [command];

    if (isFuzzyMatch) {
      let hits = subcommands
        .map((c) => fuzzyTest(c, input, fuzzyMatchingThreshold))
        .filter((h): h is FuzzyHit => h !== null);
      if (bestMatchOnly && hits.length > 1) {
        hits = [hits.reduce((best, h) => (h.similarity > best.similarity ? h : best))];
      }
      for (const hit of hits) {
        callback(hit.withoutSpecials, input, hit.similarity, {
          command: hit.command,
          resetTranscript,
        });
      }
      continue;
    }

    for (const sub of subcommands) {
      const match = commandToRegExp(sub).exec(input);
      if (match) {
        callback(...match.slice(1), { command: sub, resetTranscript });
      }
    }
  }
};
