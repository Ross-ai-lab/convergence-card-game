/**
 * Replay one fuzz duel and name the ACTION that first puts an instance on the
 * board twice.
 *
 * The gate reports the breach as a count and a turn number, which says a bug
 * exists but not which effect caused it. This walks the same duel one action at
 * a time and stops at the first duplicate, printing the action, the events it
 * produced, and both slots holding the instance. It also watches the pocket-room
 * store, because that is where the first such breach came from: a room holding
 * the SAME minion as both its friendly and its enemy side releases it twice.
 *
 * Usage: npx tsx scripts/find-duplicate-instance.mts <seed> <driverA,driverB>
 */
import { applyAction, createInitialGame, getLegalActions, makeCardLibrary } from "../src/engine/game";
import { chooseBotAction, type BotSkill } from "../src/engine/bot";
import { loadData, type Driver } from "./sim-core";
import type { GameAction, GameState, PlayerId } from "../src/engine/types";

const seed = process.argv[2] ?? "sim-fuzz-46";
const drivers = (process.argv[3] ?? "random,bot").split(",") as [Driver, Driver];
const skills: [BotSkill, BotSkill] = ["normal", "normal"];

// Same driver RNG as sim-core, so the duel walked here is the duel the gate saw.
function makeRng(text: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    s ^= text.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function duplicates(state: GameState): { id: string; where: string[] } | null {
  const seen = new Map<string, string>();
  for (const player of state.players) {
    for (const [slot, minion] of player.board.entries()) {
      if (!minion) continue;
      const at = `p${player.id} slot ${slot} (${minion.name})`;
      const first = seen.get(minion.instanceId);
      if (first) return { id: minion.instanceId, where: [first, at] };
      seen.set(minion.instanceId, at);
    }
  }
  return null;
}

const { cards, relics } = loadData();
const library = makeCardLibrary(cards, relics);
const rng = makeRng(`${seed}:driver`);
let state = createInitialGame(cards, seed, relics, {});

let step = 0;
let roomsSeen = 0;
while (state.phase !== "gameOver" && state.turnNumber <= 120) {
  const legal = getLegalActions(state, library);
  if (legal.length === 0) break;

  const actor: PlayerId =
    state.phase === "mulligan" && state.mulligan
      ? state.mulligan.player
      : state.phase === "drawChoice" && state.drawChoice
        ? state.drawChoice.player
        : state.phase === "targeting" && state.pendingTarget
          ? state.pendingTarget.player
          : state.activePlayer;

  const mine = legal.filter((action) => action.player === actor);
  const pool = mine.length ? mine : legal;
  const action: GameAction =
    drivers[actor] === "bot"
      ? (chooseBotAction(state, library, actor, skills[actor]) ?? pool[0])
      : pool[Math.floor(rng() * pool.length)];

  const result = applyAction(state, action, library);
  state = result.state;
  step += 1;

  const rooms = state.pocketRooms ?? [];
  if (rooms.length > roomsSeen) {
    for (const room of rooms.slice(roomsSeen)) {
      console.log(`POCKET ROOM opened at step ${step}, turn ${state.turnNumber}, owner p${room.owner}`);
      console.log(`  friendly: ${room.friendly.name} ${room.friendly.instanceId} owner p${room.friendly.owner} slot ${room.friendlySlot} atk ${room.friendly.atk}`);
      console.log(`  enemy:    ${room.enemy.name} ${room.enemy.instanceId} owner p${room.enemy.owner} slot ${room.enemySlot} atk ${room.enemy.atk}`);
      if (room.friendly.instanceId === room.enemy.instanceId) {
        console.log("  >>> BOTH SIDES ARE THE SAME INSTANCE. On an ATK tie this releases it twice.");
      }
      console.log(`  same object: ${room.friendly === room.enemy}`);
    }
  }
  roomsSeen = rooms.length;

  const dup = duplicates(state);
  if (dup) {
    console.log(`\nDUPLICATE after step ${step}, turn ${state.turnNumber}`);
    console.log(`  instance ${dup.id} is in TWO slots:`);
    for (const where of dup.where) console.log(`    ${where}`);
    console.log(`  the action that did it: ${JSON.stringify(action)}`);
    console.log("  events from that action:");
    for (const event of result.events) console.log(`    [${event.kind}] ${event.text}`);
    process.exit(1);
  }
}

console.log(`No duplicate in ${step} actions of ${seed} (${drivers.join(",")}).`);
