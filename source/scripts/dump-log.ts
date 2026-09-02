/**
 * Plays one self-play duel and prints every event the duel log would show.
 *
 * An audit tool, kept because "does the log read correctly" is a question that
 * will be asked again: it is the only way to see a whole duel's narration end
 * to end without playing one, and the failures it finds are ordering and
 * omission, neither of which any test asserts. Run it with:
 *
 *   npx tsx scripts/dump-log.ts [seed]
 */
import { chooseBotAction } from "../src/engine/bot";
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "../src/engine/game";
import type { GameEvent, GameState, PlayerId } from "../src/engine/types";
import { loadData } from "./sim-core";

const seed = process.argv[2] ?? "log-audit-1";
const { cards, relics } = loadData();
const library = makeCardLibrary(cards, relics);
let state = createInitialGame(cards, seed, relics);
const log: GameEvent[] = [];

/** Whoever the engine is currently waiting on, which is not always activePlayer. */
function actor(current: GameState): PlayerId {
  if (current.phase === "mulligan" && current.mulligan) return current.mulligan.player;
  if (current.phase === "drawChoice" && current.drawChoice) return current.drawChoice.player;
  if (current.phase === "targeting" && current.pendingTarget) return current.pendingTarget.player;
  return current.activePlayer;
}

for (let step = 0; step < 6000 && state.phase !== "gameOver"; step += 1) {
  const legal = getLegalActions(state, library);
  if (legal.length === 0) break;
  const action = chooseBotAction(state, library, actor(state), "normal", legal) ?? legal[0];
  const result = applyAction(state, action, library);
  state = result.state;
  log.push(...result.events);
}

for (const event of log) console.log(`${event.kind.padEnd(8)} ${event.text}`);
console.log(`\n--- ${log.length} events, phase ${state.phase}, turn ${state.turnNumber} ---`);
