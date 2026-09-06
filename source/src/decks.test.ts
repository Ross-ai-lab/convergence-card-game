import { describe, expect, it } from "vitest";
import { cards, relics } from "./data/cards";
import { CAMPAIGN_STARTER_DECK } from "./campaign";
import { DECK_SIZE, validateDeck } from "./decks";

const roster = [...cards, ...relics].map(({ id }) => id);

describe("thirty-card deck construction", () => {
  it("accepts the starter with exactly its own unlocked collection", () => {
    expect(DECK_SIZE).toBe(30);
    expect(validateDeck(CAMPAIGN_STARTER_DECK, roster, CAMPAIGN_STARTER_DECK)).toEqual({ valid: true, issues: [] });
  });

  it.each([0, 29, 31])("rejects %i cards with an exact size diagnostic", (size) => {
    expect(validateDeck(roster.slice(0, size), roster, roster)).toEqual({
      valid: false, issues: [{ code: "wrong-size", actual: size, required: 30 }],
    });
  });

  it("rejects duplicate copies even if thirty slots are filled", () => {
    const deck = [...CAMPAIGN_STARTER_DECK.slice(0, 28), "c001", "c001"];
    expect(validateDeck(deck, roster, roster)).toEqual({
      valid: false, issues: [{ code: "duplicate-card", cardId: "c001" }],
    });
  });

  it("rejects a known boss card before it is unlocked", () => {
    const deck = [...CAMPAIGN_STARTER_DECK.slice(0, 29), "c084"];
    expect(validateDeck(deck, roster, CAMPAIGN_STARTER_DECK)).toEqual({
      valid: false, issues: [{ code: "locked-card", cardId: "c084" }],
    });
    expect(validateDeck(deck, roster, [...CAMPAIGN_STARTER_DECK, "c084"]).valid).toBe(true);
  });

  it.each(["missing-card", "token-knight", "", " c001 "])("rejects non-roster ID %j even when marked unlocked", (id) => {
    const deck = [...CAMPAIGN_STARTER_DECK.slice(0, 29), id];
    expect(validateDeck(deck, roster, [...roster, id])).toEqual({
      valid: false, issues: [{ code: "unknown-card", cardId: id }],
    });
  });

  it("accepts any legal custom curve and counts relics as full deck slots", () => {
    const allRelics = relics.slice(0, 30).map(({ id }) => id);
    expect(allRelics).toHaveLength(30);
    expect(validateDeck(allRelics, roster, roster)).toEqual({ valid: true, issues: [] });
  });

  it("does not impose starter rarity restrictions on later custom decks", () => {
    const mythic = cards.find(({ rarity }) => rarity === "Red")!;
    const deck = [...CAMPAIGN_STARTER_DECK.slice(0, 29), mythic.id];
    expect(validateDeck(deck, roster, roster).valid).toBe(true);
  });

  it("reports independent problems together without modifying its inputs", () => {
    const deck = Object.freeze(["c001", "c001", "c084", "unknown"]);
    const unlocked = new Set(["c001"]);
    expect(validateDeck(deck, roster, unlocked)).toEqual({ valid: false, issues: [
      { code: "wrong-size", actual: 4, required: 30 },
      { code: "duplicate-card", cardId: "c001" },
      { code: "locked-card", cardId: "c084" },
      { code: "unknown-card", cardId: "unknown" },
    ] });
    expect(deck).toEqual(["c001", "c001", "c084", "unknown"]);
    expect([...unlocked]).toEqual(["c001"]);
  });
});
