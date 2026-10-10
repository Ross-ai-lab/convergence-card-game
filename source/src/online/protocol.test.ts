import { describe, expect, it } from "vitest";
import { cards, relics } from "../data/cards";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "../engine/game";
import { CAMPAIGN_STARTER_DECK } from "../campaign";
import {
  cleanName, inviteLink, newRoomCode, normaliseRoomCode, parseMessage, ROOM_CODE_LENGTH, roomPeerId, stateFingerprint, stepPlayer,
} from "./protocol";

describe("online protocol", () => {
  it("makes six-character codes without look-alike characters, and reads them back however they are typed", () => {
    for (let index = 0; index < 50; index++) {
      const code = newRoomCode();
      expect(code).toMatch(new RegExp(`^[A-Z2-9]{${ROOM_CODE_LENGTH}}$`));
      expect(code).not.toMatch(/[01OIL]/);
      expect(normaliseRoomCode(code.toLowerCase())).toBe(code);
      expect(normaliseRoomCode(` ${code.slice(0, 3)} ${code.slice(3)} `)).toBe(code);
      expect(normaliseRoomCode(inviteLink(code, { origin: "https://example.org", pathname: "/play/" }))).toBe(code);
    }
    expect(normaliseRoomCode("ABC")).toBeNull();
    expect(normaliseRoomCode("ABCDE0")).toBeNull();
    expect(roomPeerId("K7P2QX")).toBe("convergence-duel-k7p2qx");
  });

  it("drops malformed messages instead of acting on them", () => {
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage({ t: "step", seq: 1, step: { kind: "action" }, hash: "x" })).toBeNull();
    expect(parseMessage({ t: "step", seq: 1, step: { kind: "timeout", player: 2 }, hash: "x" })).toBeNull();
    expect(parseMessage({ t: "hello", v: 1, build: "b", token: "t", name: "N", deck: [1], heroPower: null })).toBeNull();
    expect(parseMessage({ t: "launch-missiles" })).toBeNull();
    const step = { t: "step", seq: 3, step: { kind: "action", action: { type: "end_turn", player: 1 } }, hash: "abc" };
    expect(parseMessage(step)).toEqual(step);
    expect(stepPlayer(step.step as never)).toBe(1);
    expect(stepPlayer({ kind: "concede", player: 0 })).toBe(0);
  });

  it("gives two copies of one duel the same fingerprint, step after step, through a JSON round trip", () => {
    const library = makeCardLibrary(cards, relics);
    let host = createInitialGame(cards, "fingerprint-seed", relics, { decks: [CAMPAIGN_STARTER_DECK, CAMPAIGN_STARTER_DECK], mulliganPlayers: [0, 1], hasCoin: true });
    host = JSON.parse(JSON.stringify(host));
    let guest = JSON.parse(JSON.stringify(host));
    expect(stateFingerprint(guest)).toBe(stateFingerprint(host));
    for (let step = 0; step < 12 && host.phase !== "gameOver"; step++) {
      const legal = getLegalActions(host, library);
      const action = legal.find((candidate) => candidate.type === "confirm_mulligan") ?? legal.find((candidate) => candidate.type === "play_card") ?? legal.find((candidate) => candidate.type === "end_turn");
      if (!action) break;
      host = applyAction(host, action, library).state;
      guest = applyAction(guest, JSON.parse(JSON.stringify(action)), library).state;
      expect(stateFingerprint(guest)).toBe(stateFingerprint(host));
    }
  });

  it("keeps names short and never empty", () => {
    expect(cleanName("   ", "Guest")).toBe("Guest");
    expect(cleanName("  Ross   the   Great  ", "Guest")).toBe("Ross the Great");
    expect(cleanName("x".repeat(40), "Guest")).toHaveLength(20);
  });
});
