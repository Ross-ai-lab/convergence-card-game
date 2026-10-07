import { useEffect, type Dispatch, type SetStateAction } from "react";
import { relics } from "../data/cards";
import { equipRelicFromOutside, TARGETED_EFFECTS, type CardLibrary } from "../engine/game";
import { isMinionCard } from "../engine/types";
import type { GameState, PlayerId } from "../engine/types";
import { spawnTestMinion } from "../engine/test-utils";

export function useDebugHook(
  active: boolean,
  game: GameState,
  library: CardLibrary,
  viewerId: PlayerId,
  setGame: Dispatch<SetStateAction<GameState>>,
) {
  /**
   * The test hook. DEV ONLY.
   *
   * `scripts/check-ui.mjs` can drive most of the game by clicking, but some
   * situations cannot be reached that way without luck: a card that asks for a
   * target has to BE in your hand, and a relic must be played onto a chosen
   * bearer. Playing cards and hoping made those checks
   * skip on almost every run, which is coverage in name only.
   *
   * This lets a test say "put this card in my hand" and "hang this relic on
   * that minion" directly, so those checks run every time.
   *
   * It cannot reach the built game. `import.meta.env.DEV` is replaced by the
   * bundler with a literal `false` and the whole body is dead-code-eliminated —
   * the same treatment the analyser probes in `audio/sfx.ts` get. `npm run
   * build` is checked for the string `__debug` as part of this; if it ever
   * appears there, this has broken.
   *
   * `spawnTestMinion` is imported at the top of the file rather than pulled in
   * here through a dynamic `import()`. The dynamic form was there to keep
   * test-utils out of the production bundle, and it stopped doing that the day
   * the Ross-mode workbench — which SHIPS — started calling the same function:
   * the module was already in the graph, so all the lazy import bought was an
   * extra async hop and a comment that was no longer true.
   */
  useEffect(() => {
    if (!import.meta.env.DEV || !active) return;
    const w = window as unknown as { __debug?: Record<string, unknown> };

    const findCard = (nameOrId: string) => {
      const key = nameOrId.trim().toLowerCase();
      return (
        Object.values(library).find((c) => c.id.toLowerCase() === key) ??
        Object.values(library).find((c) => c.name.toLowerCase() === key) ??
        Object.values(library).find((c) => c.name.toLowerCase().includes(key))
      );
    };
    // `opponent()` is internal to the engine; the flip is trivial enough not
    // to widen that module's surface just for a dev hook.
    const other: PlayerId = viewerId === 0 ? 1 : 0;
    const sideOf = (side: string): PlayerId => (side === "them" ? other : viewerId);

    w.__debug = {
      /** Names of every card whose battlecry opens a prompt. */
      targetingCards: () =>
        Object.values(library)
          .filter(
            (c) =>
              isMinionCard(c) &&
              (c.effectTiming === "onPlay" || c.effectTiming === "onPlayAndOngoing") &&
              c.effectId in TARGETED_EFFECTS,
          )
          .map((c) => c.name),

      /** Put a card straight into a hand. */
      giveCard(nameOrId: string, side = "me") {
        const card = findCard(nameOrId);
        if (!card) return `no card matching "${nameOrId}"`;
        const owner = sideOf(side);
        setGame((current) => {
          const players = [...current.players] as GameState["players"];
          players[owner] = { ...players[owner], hand: [...players[owner].hand, card.id] };
          return { ...current, players };
        });
        return card.name;
      },

      /** Drop a minion onto a board slot, already awake. */
      place(nameOrId: string, side = "them", slotIndex = 0) {
        const card = findCard(nameOrId);
        if (!card || !isMinionCard(card)) return `"${nameOrId}" is not a minion`;
        const owner = sideOf(side);
        setGame((current) => {
          const players = [...current.players] as GameState["players"];
          const board = [...players[owner].board];
          board[slotIndex] = spawnTestMinion(card, owner, { sleeping: false });
          players[owner] = { ...players[owner], board };
          return { ...current, players };
        });
        return card.name;
      },

      /**
       * Set a core to any value, so a duel can be brought to the brink.
       *
       * Added for the card-pack screen, which only exists after a duel ends
       * and was otherwise reachable only by playing twenty real turns. It does
       * NOT end the duel by itself, on purpose: the phase flip belongs to the
       * engine's own win check, so a duel finished this way finishes through
       * exactly the path a real one takes. Drop a core to 1, swing at it, and
       * everything downstream — the record, the reward, the pack — runs for
       * real.
       */
      setCore(side = "them", value = 1) {
        const owner = sideOf(side);
        setGame((current) => {
          const players = [...current.players] as GameState["players"];
          players[owner] = { ...players[owner], health: value };
          return { ...current, players };
        });
        return `${side} core = ${value}`;
      },

      /** Hang a relic on a minion already on the board. */
      equipRelic(relicName: string, side = "me", slotIndex = 0) {
        const owner = sideOf(side);
        // Resolve the relic BEFORE setGame. Reading it inside the updater and
        // assigning to an outer variable returns the stale default, because
        // the updater runs after this function has already returned.
        const wanted = relicName.trim().toLowerCase();
        const relicDef = relics.find((r) => r.name.toLowerCase() === wanted) ?? relics[0];
        if (!relicDef) return "relic catalog is empty";
        // Through the engine, so the relic fires whatever it fires on landing.
        setGame((current) => {
          const equipped = equipRelicFromOutside(current, owner, slotIndex, relicDef, library);
          return equipped ? equipped.state : current;
        });
        return relicDef.name;
      },

      /** A small readable summary, for assertions that need numbers. */
      state: () => ({
        phase: game.phase,
        activePlayer: game.activePlayer,
        viewer: viewerId,
        hand: game.players[viewerId].hand.length,
        mine: game.players[viewerId].board.filter(Boolean).length,
        theirs: game.players[viewerId === 0 ? 1 : 0].board.filter(Boolean).length,
      }),
    };

    return () => {
      delete w.__debug;
    };
  }, [active, game, library, setGame, viewerId]);
}
