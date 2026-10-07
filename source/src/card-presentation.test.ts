import { describe, expect, it } from "vitest";
import { handKeywordEntriesFor, minionKeywordEntriesFor, splitCardText, sameCardFace, type CardFaceModel } from "./card-presentation";
import { cards } from "./data/cards";
import { spawnTestMinion } from "./engine/test-utils";

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

describe("card face presentation identity", () => {
  const face:CardFaceModel={name:'Test',art:'test.webp',origin:'BASIC',effect:'Taunt',rarity:'Black',camp:'Nature',alignment:'Neutral',cost:1,atk:2,hp:3,flavor:'Hello',keywords:['Taunt']};
  it('ignores cloned engine-only fields while preserving displayed values',()=>{
    const body={...face,gainedEffects:[{text:'Passive',turn:1}],turnsAlive:3};
    expect(sameCardFace(body,structuredClone({...body,turnsAlive:4}))).toBe(true);
    for(const [field,value] of Object.entries(face)) {
      const changed={...face,[field]:Array.isArray(value)?['Charge']:typeof value==='number'?value+1:String(value)+'!'};
      expect(sameCardFace(face,changed),field).toBe(false);
    }
  });
});

describe("keyword panels", () => {
  const card = (name: string) => {
    const found = cards.find((entry) => entry.name === name);
    if (!found) throw new Error(`Missing card ${name}`);
    return found;
  };
  it("explains rules-text keywords in printed order, then column-only keywords", () => {
    const aang = card("Avatar Aang");
    expect(handKeywordEntriesFor(aang).map((entry) => entry.term)).toEqual(["Battlecry", "Deathrattle", "Summon"]);
    const batman = card("Batman");
    expect(handKeywordEntriesFor(batman).map((entry) => entry.term).slice(0, 3)).toEqual(["Battlecry", "Freeze", "Silence"]);
  });
  it("shows a silenced minion no keyword panel at all", () => {
    const minion = spawnTestMinion(card("Avatar Aang"), 0);
    expect(minionKeywordEntriesFor(minion).length).toBeGreaterThan(0);
    expect(minionKeywordEntriesFor({ ...minion, silenced: true })).toEqual([]);
  });
});
