import { describe, expect, it } from "vitest";

import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, makeCardLibrary } from "./game";
import {
  BOT_CHEATS,
  chooseBotAction,
  clairvoyanceEdge,
  rolloutTurn,
  turnsConsidered,
  worstReply,
  type BotCheats,
} from "./bot";
import { spawnTestMinion } from "./test-utils";
import type { GameState, MinionInstance, PlayerId } from "./types";

/**
 * The difficulty ladder is a CHEAT ladder: the three opponents differ in what
 * they are allowed to know, not only in how far they search. These tests exist
 * because every one of those cheats is invisible from the outside — a bot that
 * silently stopped reading the deck would look exactly like a bot having a bad
 * game, and the README table would quietly become fiction.
 */
const library = makeCardLibrary(cards, relics);
const BOT: PlayerId = 1;
const HUMAN: PlayerId = 0;
// Keep this seeded tactical sample on the pool it was authored against. The
// live library remains complete; only this fixture stays stable as the roster
// grows with relics that can change a random opening.
const stableInsightRelics = relics.filter((relic) => Number(relic.id.slice(1)) <= 28);

function cardId(name: string): string {
  const card = cards.find((entry) => entry.name === name);
  if (!card) throw new Error(`Missing card ${name}`);
  return card.id;
}

function dummy(name: string, owner: PlayerId, overrides: Partial<MinionInstance> = {}): MinionInstance {
  return spawnTestMinion(library[cardId(name)] as never, owner, {
    effectId: "none",
    effectTiming: "none",
    keywords: [],
    ...overrides,
  });
}

/** A duel wound forward to a plain main phase with nobody mid-choice. */
function mainState(seed: string, active: PlayerId = BOT): GameState {
  const state = createInitialGame(cards, seed, relics);
  state.phase = "main";
  state.drawChoice = null;
  state.pendingTarget = null;
  state.heroPowers = [null, null];
  state.activePlayer = active;
  return state;
}

// ---------------------------------------------------------------------------
// The table itself
// ---------------------------------------------------------------------------

describe("the cheat ladder", () => {
  it("grants exactly what the README says, and nothing to the lower two", () => {
    // Recruit and Veteran are honest opponents. Everything they get wrong, a
    // human at the same seat could also get wrong.
    expect(BOT_CHEATS.easy).toEqual({
      trueDice: false,
      readsYourReply: false,
      clairvoyance: false,
      foresight: false,
    });
    expect(BOT_CHEATS.normal).toEqual(BOT_CHEATS.easy);
    expect(BOT_CHEATS.hard).toEqual({
      trueDice: true,
      readsYourReply: true,
      clairvoyance: true,
      foresight: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Foresight — draw two, keep one
// ---------------------------------------------------------------------------

describe("Foresight", () => {
  /** Ends the human's turn and reports what the bot's turn start looked like. */
  function botTurnStart(foresightFor: PlayerId | null): GameState {
    const state = createInitialGame(cards, "foresight", relics, { foresightFor });
    // Skip the opening mulligan; this is about the draw, not the opening.
    state.phase = "main";
    state.mulligan = null;
    state.activePlayer = HUMAN;
    return applyAction(state, { type: "end_turn", player: HUMAN }, library).state;
  }

  it("stops the Ascendant's turn on a two-card choice", () => {
    const state = botTurnStart(BOT);
    expect(state.phase).toBe("drawChoice");
    expect(state.drawChoice?.player).toBe(BOT);
    expect(state.drawChoice?.cards).toHaveLength(2);
  });

  it("is granted to nobody by default, so hotseat and self-play draw one card", () => {
    const state = botTurnStart(null);
    expect(state.phase).toBe("main");
    expect(state.drawChoice).toBeNull();
  });

  it("takes the rejected card off the SHARED deck, so the other seat never sees it", () => {
    const plain = botTurnStart(null);
    const cheating = botTurnStart(BOT);
    // Same duel, same shuffle: the only difference is how deep into the deck the
    // Ascendant's single draw reached.
    expect(plain.deck.length - cheating.deck.length).toBe(1);
  });

  it("survives a save, because the grant lives in the state and not in the bot", () => {
    const state = createInitialGame(cards, "foresight-save", relics, { foresightFor: BOT });
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(restored.foresightFor).toBe(BOT);
  });
});

// ---------------------------------------------------------------------------
// True dice — only the Ascendant sees the roll coming
// ---------------------------------------------------------------------------

describe("reading the dice", () => {
  /**
   * A confused attacker whose swing is worth taking on exactly one roll in three.
   *
   * The bot's only minion is a 5/20 Taunt and its core is low enough that losing
   * that blocker is lethal next turn. The swing goes somewhere the engine picks:
   * slot 0 is a free kill and the Taunt walks away, slots 1 and 2 are 20/20 walls
   * that eat it whole and hand the human the game.
   *
   * Everything else is stripped out on purpose. Both hands are empty and the deck
   * is stacked with a card neither side can afford, so the drawn card cannot
   * rewrite the position — an early version of this test failed because the human
   * drew a bomb and every line projected a loss, which made all five candidates
   * tie and told us nothing. The alternative, ending the turn, stays genuinely
   * available and genuinely reasonable: that is what makes this a choice rather
   * than a forced move.
   */
  function confusedSwing(rngSeed: number): GameState {
    const state = mainState("dice");
    state.rngSeed = rngSeed;
    state.deck = Array.from({ length: 20 }, () => cardId("Black Hole")); // 10 mana, unplayable here
    state.bottomDeck = [];
    state.players[BOT] = {
      ...state.players[BOT],
      hand: [],
      coins: 0,
      health: 38, // exactly inside the two walls' combined reach
      board: [
        dummy("Zoro", BOT, { atk: 5, hp: 20, maxHp: 20, sleeping: false, keywords: ["Taunt"] }),
        null,
        null,
        null,
        null,
      ],
      randomAttacksFromTurn: state.turnNumber,
      randomAttacksUntilTurn: state.turnNumber,
    };
    state.players[HUMAN] = {
      ...state.players[HUMAN],
      hand: [],
      coins: 0,
      board: [
        dummy("Fort", HUMAN, { atk: 1, hp: 1, maxHp: 1 }),
        dummy("Death Star", HUMAN, { atk: 20, hp: 20, maxHp: 20 }),
        dummy("Kurogiri", HUMAN, { atk: 20, hp: 20, maxHp: 20 }),
        null,
        null,
      ],
    };
    return state;
  }

  // Found by walking the engine's xorshift: the first roll off these seeds picks
  // target 0 and target 2 respectively.
  const ROLLS_THE_FREE_KILL = 1103527590;
  const ROLLS_A_WALL = -112468174;

  function swings(state: GameState, skill: "easy" | "normal" | "hard"): boolean {
    const action = chooseBotAction(state, library, BOT, skill);
    return action?.type === "attack_minion" || action?.type === "attack_core";
  }

  it("lets the Ascendant swing only when the roll is already in its favour", () => {
    expect(swings(confusedSwing(ROLLS_THE_FREE_KILL), "hard")).toBe(true);
    expect(swings(confusedSwing(ROLLS_A_WALL), "hard")).toBe(false);
  });

  it("leaves the Veteran guessing — its answer does not track the real roll", () => {
    // Two chances in three the swing is a disaster, so a bot pricing the gamble
    // honestly declines. The point is not that it declines; it is that it gives
    // the SAME answer to two positions the Ascendant can tell apart.
    //
    // Recruit is deliberately left out. It runs the identical blind code path,
    // but its own silliness is seeded from the state too, so it answers these
    // two positions differently for a reason that has nothing to do with dice —
    // there is no way to read blindness off its choices.
    expect(swings(confusedSwing(ROLLS_THE_FREE_KILL), "normal")).toBe(swings(confusedSwing(ROLLS_A_WALL), "normal"));
    expect(swings(confusedSwing(ROLLS_THE_FREE_KILL), "normal")).toBe(false);
  });

  it("keeps every skill replayable — the blind roll is derived, never random", () => {
    const state = confusedSwing(ROLLS_A_WALL);
    for (const skill of ["easy", "normal", "hard"] as const) {
      const first = chooseBotAction(state, library, BOT, skill);
      const second = chooseBotAction(state, library, BOT, skill);
      expect(first).toEqual(second);
    }
  });
});

// ---------------------------------------------------------------------------
// Clairvoyance — reading the top of the shared deck
// ---------------------------------------------------------------------------

describe("Clairvoyance", () => {
  function deckState(top: string[], active: PlayerId, foresightFor: PlayerId | null = null): GameState {
    const state = mainState("clairvoyance", active);
    state.deck = [...top];
    state.foresightFor = foresightFor;
    return state;
  }

  const bomb = cardId("Black Hole"); // 10 mana, the top of the printed power scale
  const scrap = cardId("Fort"); // 1 mana

  // Every assertion below has to turn on WHICH card is coming, not merely on
  // whose turn it is to draw. An earlier version compared "deck with a bomb" to
  // "no deck at all" and passed happily even when the valuation was stubbed to
  // return the same number for every card — it was measuring the alternating
  // walk and nothing else.

  it("cares which seat the bomb lands on, not just that a bomb exists", () => {
    // The bot is active, so it has already drawn and the human takes the top
    // card. Same two cards both times; only the order changes.
    const humanGetsIt = clairvoyanceEdge(deckState([bomb, scrap], BOT), library, BOT);
    const botGetsIt = clairvoyanceEdge(deckState([scrap, bomb], BOT), library, BOT);
    expect(humanGetsIt).toBeLessThan(botGetsIt);
  });

  it("rates a big incoming card above a small one for the same seat", () => {
    const big = clairvoyanceEdge(deckState([bomb, scrap], HUMAN), library, BOT);
    const small = clairvoyanceEdge(deckState([scrap, scrap], HUMAN), library, BOT);
    expect(big).toBeGreaterThan(small);
  });

  it("puts the near future ahead of the far one", () => {
    const soon = clairvoyanceEdge(deckState([bomb, scrap, scrap], HUMAN), library, BOT);
    const later = clairvoyanceEdge(deckState([scrap, scrap, bomb], HUMAN), library, BOT);
    expect(soon).toBeGreaterThan(later);
  });

  it("is worth nothing when the deck holds nothing worth seeing", () => {
    expect(clairvoyanceEdge(deckState([], BOT), library, BOT)).toBe(0);
  });

  it("knows Foresight keeps the better of two, so a buried bomb still counts", () => {
    // The human draws next. Without Foresight they take the scrap and the bomb
    // falls through to the bot; with it they see both and keep the bomb, which
    // flips who benefits.
    const withForesight = clairvoyanceEdge(deckState([scrap, bomb, scrap], BOT, HUMAN), library, BOT);
    const without = clairvoyanceEdge(deckState([scrap, bomb, scrap], BOT, null), library, BOT);
    expect(withForesight).toBeLessThan(without);
  });
});

// ---------------------------------------------------------------------------
// Insight+ — assuming the opponent answers well
// ---------------------------------------------------------------------------

describe("Insight+", () => {
  const greedy: BotCheats = { trueDice: true, readsYourReply: false, clairvoyance: false, foresight: false };
  const branching: BotCheats = { ...greedy, readsYourReply: true };

  /**
   * Real mid-duel boards with the human on move.
   *
   * Hand-built positions were tried first and were useless: on a tidy two-minion
   * board the greedy line already IS the strongest reply, so the branch agreed
   * with it every time and the test proved nothing. Positions that actually
   * separate the two come from real games, where the opponent is holding cards
   * whose best use is not their highest-scoring first move.
   */
  function positions(): GameState[] {
    // Keep the sample's resource trade available explicitly. The old opening
    // draft happened to select a draw power in this seed; the menu no longer
    // rolls powers, so make that test fixture's tactical premise explicit.
    let state = createInitialGame(cards, "insight-plus", stableInsightRelics, { heroPowers: ["core_trade_draw", "core_trade_draw"] });
    const collected: GameState[] = [];
    for (let step = 0; step < 400 && collected.length < 12; step += 1) {
      if (state.phase === "gameOver") break;
      const actor: PlayerId =
        state.phase === "mulligan" && state.mulligan
          ? state.mulligan.player
          : state.phase === "drawChoice" && state.drawChoice
            ? state.drawChoice.player
            : state.phase === "targeting" && state.pendingTarget
              ? state.pendingTarget.player
              : state.activePlayer;
      if (actor === HUMAN && state.phase === "main") collected.push(state);
      const action = chooseBotAction(state, library, actor, "normal");
      if (!action) break;
      state = applyAction(state, action, library).state;
    }
    expect(collected.length).toBeGreaterThan(4); // the sample itself has to be real
    return collected;
  }

  it("never rates a position higher than the single-greedy reply did", () => {
    for (const state of positions()) {
      expect(worstReply(state, library, BOT, branching)).toBeLessThanOrEqual(
        worstReply(state, library, BOT, greedy) + 1e-9,
      );
    }
  });

  it("actually finds a reply the greedy model missed", () => {
    // The guard above passes trivially if the branch never disagrees with the
    // greedy line. This is the half that proves the search is doing work.
    const gaps = positions().filter(
      (state) => worstReply(state, library, BOT, branching) < worstReply(state, library, BOT, greedy) - 1e-6,
    );
    expect(gaps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The beam — judging whole turns instead of one move at a time
// ---------------------------------------------------------------------------

describe("planning a whole turn", () => {
  const cheats = BOT_CHEATS.hard;

  /**
   * Real mid-duel boards with the BOT on move and a turn worth planning.
   *
   * The mana and hand filters are the whole point. A first attempt sampled
   * whatever positions came along, which meant turns at one to three mana
   * holding one castable card: there is no multi-card turn to find there, the
   * beam correctly agreed with the greedy line every time, and the test read
   * that as "the beam does nothing". A combo needs the mana to pay for two
   * cards before it can exist at all.
   */
  let cached: GameState[] | null = null;
  function positions(): GameState[] {
    if (cached) return cached;
    let state = createInitialGame(cards, "beam-positions", relics, { foresightFor: BOT });
    const collected: GameState[] = [];
    for (let step = 0; step < 400 && collected.length < 10; step += 1) {
      if (state.phase === "gameOver") break;
      const actor: PlayerId =
        state.phase === "mulligan" && state.mulligan
          ? state.mulligan.player
          : state.phase === "drawChoice" && state.drawChoice
            ? state.drawChoice.player
            : state.phase === "targeting" && state.pendingTarget
              ? state.pendingTarget.player
              : state.activePlayer;
      if (
        actor === BOT &&
        state.phase === "main" &&
        state.players[BOT].mana >= 6 &&
        state.players[BOT].hand.length >= 4
      ) {
        collected.push(state);
      }
      const action = chooseBotAction(state, library, actor, "normal");
      if (!action) break;
      state = applyAction(state, action, library).state;
    }
    expect(collected.length).toBeGreaterThan(3);
    cached = collected;
    return collected;
  }

  /** How good a finished turn is, judged the way the real search judges it. */
  function judge(finished: GameState): number {
    return worstReply(finished, library, BOT, cheats);
  }

  it("builds several different turns rather than one", () => {
    const widths = positions().map((state) => turnsConsidered(state, library, BOT, cheats).length);
    expect(Math.max(...widths)).toBeGreaterThan(1);
  }, 120_000);

  it("every turn it builds is a turn that actually ended", () => {
    for (const state of positions()) {
      for (const line of turnsConsidered(state, library, BOT, cheats)) {
        const stillOurs = line.state.phase !== "gameOver" && line.state.activePlayer === BOT
          && line.state.phase === "main";
        expect(stillOurs).toBe(false);
      }
    }
  }, 120_000);

  it("finds a better turn than playing the best-looking card each time", () => {
    // The greedy line is what the search used to do: best move, look again,
    // best move. If the beam never beats it, the beam is decoration.
    let beamBetter = 0;
    for (const state of positions()) {
      const greedy = judge(rolloutTurn(state, library, BOT, cheats.trueDice));
      const lines = turnsConsidered(state, library, BOT, cheats);
      const best = Math.max(...lines.map((line) => judge(line.state)));
      expect(best).toBeGreaterThanOrEqual(greedy - 1e-9);
      if (best > greedy + 1e-6) beamBetter += 1;
    }
    expect(beamBetter).toBeGreaterThan(0);
  }, 120_000);
});
