/**
 * The Ross-mode workbench's board edits, as pure state changes.
 *
 * Each edit returns the next state and the one log line that describes what
 * actually happened. The line is written from the result, so an edit that could
 * not apply — a full hand, a full board, no minion able to carry the relic —
 * says so instead of reporting a change that never landed.
 */
import { equipRelicFromOutside, STARTING_CORE, type CardLibrary } from "../engine/game";
import { isMinionCard, isRelicCard } from "../engine/types";
import type { GameState, PlayerId } from "../engine/types";
import { spawnTestMinion } from "../engine/test-utils";

const HAND_LIMIT = 10;

export type DeveloperEdit =
  | { kind: "setCore"; owner: PlayerId; value: number }
  | { kind: "invincibleCore"; owner: PlayerId }
  | { kind: "healCore"; owner: PlayerId }
  | { kind: "clearHand"; owner: PlayerId }
  | { kind: "clearBoard"; owner: PlayerId }
  | { kind: "giveCard"; owner: PlayerId; cardId: string }
  | { kind: "placeCard"; owner: PlayerId; cardId: string }
  | { kind: "equipRelic"; owner: PlayerId; cardId: string };

export interface DeveloperEditResult {
  state: GameState;
  text: string;
}

function withPlayer(state: GameState, owner: PlayerId, change: Partial<GameState["players"][number]>): GameState {
  const players = [...state.players] as GameState["players"];
  players[owner] = { ...players[owner], ...change };
  return { ...state, players };
}

/** Applies one workbench edit. Returns null when the named card does not fit the edit at all. */
export function applyDeveloperEdit(
  state: GameState,
  edit: DeveloperEdit,
  library: CardLibrary,
  viewerId: PlayerId,
): DeveloperEditResult | null {
  const whose = edit.owner === viewerId ? "your" : "the opponent's";
  const player = state.players[edit.owner];
  switch (edit.kind) {
    case "setCore":
      return { state: withPlayer(state, edit.owner, { health: edit.value }), text: `Developer mode set ${whose} Core to ${edit.value}.` };
    case "invincibleCore": {
      const coreInvincible = [...(state.coreInvincible ?? [false, false])] as [boolean, boolean];
      coreInvincible[edit.owner] = true;
      return { state: { ...state, coreInvincible }, text: `Developer mode made ${whose} Core invincible.` };
    }
    case "healCore":
      return { state: withPlayer(state, edit.owner, { health: STARTING_CORE }), text: `Developer mode fully healed ${whose} Core.` };
    case "clearHand":
      return { state: withPlayer(state, edit.owner, { hand: [], pressured: null }), text: `Developer mode removed all cards from ${whose} hand.` };
    case "clearBoard":
      return {
        state: withPlayer(state, edit.owner, { board: Array(player.board.length).fill(null) }),
        text: `Developer mode cleared ${whose} board.`,
      };
    case "giveCard": {
      const card = library[edit.cardId];
      if (!card) return null;
      if (player.hand.length >= HAND_LIMIT) return { state, text: `Developer mode could not add ${card.name}: ${whose} hand is full.` };
      return {
        state: withPlayer(state, edit.owner, { hand: [...player.hand, card.id] }),
        text: `Developer mode added ${card.name} to ${whose} hand.`,
      };
    }
    case "placeCard": {
      const card = library[edit.cardId];
      if (!card || !isMinionCard(card)) return null;
      const slotIndex = player.board.findIndex((slot) => !slot);
      if (slotIndex < 0) return { state, text: `Developer mode could not place ${card.name}: ${whose} board is full.` };
      const board = [...player.board];
      board[slotIndex] = spawnTestMinion(card, edit.owner, { sleeping: false });
      return { state: withPlayer(state, edit.owner, { board }), text: `Developer mode placed ${card.name} on ${whose} board.` };
    }
    case "equipRelic": {
      const relic = library[edit.cardId];
      if (!relic || !isRelicCard(relic)) return null;
      // Through the engine, so the relic fires whatever it fires on landing. The
      // first minion that can actually carry it gets it, which skips bodies whose
      // relic slots are full or whose alignment the relic refuses.
      for (let slotIndex = 0; slotIndex < player.board.length; slotIndex++) {
        const equipped = equipRelicFromOutside(state, edit.owner, slotIndex, relic, library);
        if (equipped) {
          const bearer = player.board[slotIndex];
          return { state: equipped.state, text: `Developer mode equipped ${relic.name} on ${bearer?.name ?? `${whose} minion`}.` };
        }
      }
      return { state, text: `Developer mode could not equip ${relic.name}: no minion on ${whose} board can carry it.` };
    }
  }
}
