import { describe, expect, it } from "vitest";
import { commandToRegExp, concatTranscripts, diceCoefficient } from "../src/utils";

describe("concatTranscripts", () => {
  it("joint avec un seul espace et ignore les morceaux vides", () => {
    expect(concatTranscripts("hello ", "", " world")).toBe("hello world");
    expect(concatTranscripts("", "")).toBe("");
    expect(concatTranscripts("a", "", "b")).toBe("a b");
  });
});

describe("commandToRegExp", () => {
  it("splat *", () => {
    expect(commandToRegExp("order *").exec("order two pizzas")?.slice(1)).toEqual(["two pizzas"]);
  });
  it("variable nommée :x (un seul mot)", () => {
    const re = commandToRegExp("I am :h metres tall");
    expect(re.exec("I am 2 metres tall")?.[1]).toBe("2");
    expect(re.exec("I am very big metres tall")).toBeNull();
  });
  it("mots optionnels (x)", () => {
    const re = commandToRegExp("pass the salt (please)");
    expect(re.test("pass the salt")).toBe(true);
    expect(re.test("pass the salt please")).toBe(true);
    expect(re.test("pass the pepper")).toBe(false);
  });
  it("insensible à la casse et ancrée", () => {
    const re = commandToRegExp("Hello");
    expect(re.test("HELLO")).toBe(true);
    expect(re.test("oh hello there")).toBe(false);
  });
  it("accepte une RegExp", () => {
    expect(commandToRegExp(/^go (up|down)$/).exec("go up")?.[1]).toBe("up");
  });
  it("met en cache (même instance)", () => {
    expect(commandToRegExp("cache me")).toBe(commandToRegExp("cache me"));
  });
  it("échappe les caractères spéciaux de regex", () => {
    expect(commandToRegExp("a.b").test("axb")).toBe(false);
    expect(commandToRegExp("a.b").test("a.b")).toBe(true);
  });
});

describe("diceCoefficient", () => {
  it("identique = 1, vide = 1, un vide = 0", () => {
    expect(diceCoefficient("abc", "ABC")).toBe(1);
    expect(diceCoefficient("", "")).toBe(1);
    expect(diceCoefficient("a", "")).toBe(0);
  });
  it("proche > lointain", () => {
    expect(diceCoefficient("Beijing", "Beijin")).toBeGreaterThan(diceCoefficient("Beijing", "Paris"));
  });
});
