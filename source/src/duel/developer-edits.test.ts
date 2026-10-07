import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { createInitialGame, makeCardLibrary, STARTING_CORE } from "../engine/game";
import { spawnTestMinion } from "../engine/test-utils";
import type { CardDefinition, GameState, PlayerId } from "../engine/types";
import { applyDeveloperEdit } from "./developer-edits";

const library = makeCardLibrary(cards, relics);
const byName = (name: string) => {
  const card = [...cards, ...relics].find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card;
};
const minion = (name: string, owner: PlayerId) => spawnTestMinion(byName(name) as CardDefinition, owner);

function freshGame(): GameState {
  return createInitialGame(cards, "developer-edits", relics);
}

describe("developer workbench edits", () => {
  it("names the viewer's side and the opponent's side in the log", () => {
    const game = freshGame();
    expect(applyDeveloperEdit(game, { kind: "setCore", owner: 0, value: 1 }, library, 0)?.text).toBe("Developer mode set your Core to 1.");
    expect(applyDeveloperEdit(game, { kind: "setCore", owner: 1, value: 1 }, library, 0)?.text).toBe("Developer mode set the opponent's Core to 1.");
  });

  it("sets, heals and protects a core without touching the other seat", () => {
    const hurt = applyDeveloperEdit(freshGame(), { kind: "setCore", owner: 1, value: 3 }, library, 0)!.state;
    expect(hurt.players[1].health).toBe(3);
    expect(hurt.players[0].health).toBe(STARTING_CORE);
    expect(applyDeveloperEdit(hurt, { kind: "healCore", owner: 1 }, library, 0)!.state.players[1].health).toBe(STARTING_CORE);
    expect(applyDeveloperEdit(hurt, { kind: "invincibleCore", owner: 0 }, library, 0)!.state.coreInvincible).toEqual([true, false]);
  });

  it("clears a hand together with its pending pressure", () => {
    const game = freshGame();
    game.players[1].pressured = { cardId: game.players[1].hand[0], dueTurn: 3 };
    const cleared = applyDeveloperEdit(game, { kind: "clearHand", owner: 1 }, library, 0)!.state;
    expect(cleared.players[1].hand).toEqual([]);
    expect(cleared.players[1].pressured).toBeNull();
  });

  it("reports a full hand instead of claiming the card was added", () => {
    const game = freshGame();
    game.players[0].hand = Array(10).fill(byName("Batman").id);
    const result = applyDeveloperEdit(game, { kind: "giveCard", owner: 0, cardId: byName("Joker").id }, library, 0)!;
    expect(result.state).toBe(game);
    expect(result.text).toBe("Developer mode could not add Joker: your hand is full.");
  });

  it("places an awake minion in the first empty slot and refuses a full board", () => {
    const game = freshGame();
    game.players[0].board[0] = minion("Batman", 0);
    const placed = applyDeveloperEdit(game, { kind: "placeCard", owner: 0, cardId: byName("Joker").id }, library, 0)!.state;
    expect(placed.players[0].board[1]?.name).toBe("Joker");
    expect(placed.players[0].board[1]?.sleeping).toBe(false);
    const full = freshGame();
    full.players[0].board = full.players[0].board.map(() => minion("Batman", 0));
    expect(applyDeveloperEdit(full, { kind: "placeCard", owner: 0, cardId: byName("Joker").id }, library, 0)!.text)
      .toBe("Developer mode could not place Joker: your board is full.");
  });

  it("equips through the engine on the first minion that can carry the relic", () => {
    const game = freshGame();
    game.players[0].board[0] = minion("Joker", 0);
    game.players[0].board[1] = minion("Batman", 0);
    const result = applyDeveloperEdit(game, { kind: "equipRelic", owner: 0, cardId: byName("Excalibur").id }, library, 0)!;
    expect(result.state.players[0].board[0]?.relic).toBeNull();
    expect(result.state.players[0].board[1]?.relic?.name).toBe("Excalibur");
    expect(result.text).toBe("Developer mode equipped Excalibur on Batman.");
    const grail = applyDeveloperEdit(game, { kind: "equipRelic", owner: 0, cardId: byName("The Holy Grail").id }, library, 0)!;
    expect(grail.state.players[0].board[0]?.atk).toBe(2 * game.players[0].board[0]!.atk);
  });

  it("ignores a card that does not fit the edit", () => {
    const game = freshGame();
    expect(applyDeveloperEdit(game, { kind: "placeCard", owner: 0, cardId: byName("Excalibur").id }, library, 0)).toBeNull();
    expect(applyDeveloperEdit(game, { kind: "equipRelic", owner: 0, cardId: byName("Joker").id }, library, 0)).toBeNull();
    expect(applyDeveloperEdit(game, { kind: "giveCard", owner: 0, cardId: "missing" }, library, 0)).toBeNull();
  });

  it("empties a board without changing its slot count", () => {
    const game = freshGame();
    game.players[1].board[2] = minion("Joker", 1);
    const cleared = applyDeveloperEdit(game, { kind: "clearBoard", owner: 1 }, library, 0)!.state;
    expect(cleared.players[1].board).toEqual([null, null, null, null]);
  });
});
