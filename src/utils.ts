/** Concatène des morceaux de transcript avec un seul espace, sans blancs parasites. */
export const concatTranscripts = (...parts: string[]): string =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");

/* --------------------- Commande -> RegExp (avec cache) -------------------- */
// Syntaxe dérivée de Backbone.Router (MIT) : `*` splat, `:nom` variable, `(x)` optionnel.
const optionalParam = /\s*\((.*?)\)\s*/g;
const optionalRegex = /(\(\?:[^)]+\))\?/g;
const namedParam = /(\(\?)?:\w+/g;
const splatParam = /\*/g;
const escapeRegExp = /[-{}[\]+?.,\\^$|#]/g;

const MAX_CACHE = 500;
const regexCache = new Map<string, RegExp>();

export const commandToRegExp = (command: string | RegExp): RegExp => {
  const key = command instanceof RegExp ? `r:${command.source}` : `s:${command}`;
  const cached = regexCache.get(key);
  if (cached) return cached;

  let regex: RegExp;
  if (command instanceof RegExp) {
    regex = new RegExp(command.source, "i");
  } else {
    const source = command
      .replace(escapeRegExp, "\\$&")
      .replace(optionalParam, "(?:$1)?")
      .replace(namedParam, (match, optional) => (optional ? match : "([^\\s]+)"))
      .replace(splatParam, "(.*?)")
      .replace(optionalRegex, "\\s*$1?\\s*");
    regex = new RegExp(`^${source}$`, "i");
  }

  if (regexCache.size >= MAX_CACHE) regexCache.clear();
  regexCache.set(key, regex);
  return regex;
};

/** Similarité de Dice sur bigrammes, entre 0 (rien en commun) et 1 (identique). */
export const diceCoefficient = (a: string, b: string): number => {
  const first = a.replace(/\s+/g, "").toLowerCase();
  const second = b.replace(/\s+/g, "").toLowerCase();

  if (!first.length && !second.length) return 1;
  if (!first.length || !second.length) return 0;
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < first.length - 1; i++) {
    const bigram = first.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < second.length - 1; i++) {
    const bigram = second.substring(i, i + 2);
    const count = bigrams.get(bigram) ?? 0;
    if (count > 0) {
      bigrams.set(bigram, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (first.length + second.length - 2);
};
