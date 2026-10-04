import { describe, expect, it } from "vitest";
import { splitCardText } from "./card-presentation";

describe("printed card text", () => {
  it("preserves punctuation and highlights aliases only once per concept", () => {
    const text = "Relics, then a relic. Evades attacks; Evade again. Rebirth a minion.";
    const pieces = splitCardText(text);
    expect(pieces.map(piece => piece.text).join("")).toBe(text);
    expect(pieces.flatMap(piece => piece.entry ? [piece.entry.term] : [])).toEqual(["Relic", "Evade", "Rebirth"]);
  });
  it("keeps the bearer clickable while relic faces suppress the Relic concept", () => {
    const pieces = splitCardText("The bearer discovers a relic", false);
    expect(pieces.flatMap(piece => piece.entry ? [piece.entry.term] : [])).toEqual(["Bearer"]);
  });
  it("does not match embedded words or numbers", () => {
    const pieces = splitCardText("preTaunt passively Reborn2 relicsauce");
    expect(pieces.some(piece => piece.entry || piece.token)).toBe(false);
  });
  it("recognizes plural and shortened token names without swallowing their text", () => {
    const text = "Summon TIE Fighters, Shadow Clones, Margit and Larvae";
    const pieces = splitCardText(text);
    expect(pieces.map(piece => piece.text).join("")).toBe(text);
    expect(pieces.flatMap(piece => piece.token ? [piece.token] : [])).toEqual(["token:tie-fighter", "token:shadow-clone", "token:margit", "token:larva"]);
  });
  it("retains keyword offsets after characters whose lower-case form changes length", () => {
    expect(splitCardText("İ: Freeze").find(piece => piece.entry)?.text).toBe("Freeze");
  });
});
