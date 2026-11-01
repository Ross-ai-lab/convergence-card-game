/** Constants and pure helpers for seating a duel, shared by App and its hooks. */
import campaignVoiceManifest from "../../data/campaign-voices.json";
import { BOT_CHEATS } from "../engine/bot";
import { randomHeroPower } from "../engine/hero-powers";
import type { GameEvent, HeroPowerId, PlayerId } from "../engine/types";
import type { GameMode } from "../screens/Screens";

export function campaignVoiceDuration(key: string): number | undefined {
  const entries = campaignVoiceManifest as Record<string, { duration?: unknown }>;
  const entry = entries[key];
  return typeof entry?.duration === "number" ? entry.duration : undefined;
}

export function heroPowersForDuel(
  mode: GameMode,
  playerPower: HeroPowerId | null,
  seed: string,
): [HeroPowerId | null, HeroPowerId | null] {
  return mode.kind === "hotseat" ? [playerPower, playerPower] : [playerPower, randomHeroPower(seed)];
}

/** Core at or under this swaps the music to the tense bed. Roughly a quarter. */
export const TENSION_CORE = 12;

/**
 * The made-up damage tally behind the developer result screen.
 *
 * A tally entry needs an instance id and a number, and neither exists when no
 * duel was played. The id is spelled out rather than random so a screenshot of
 * that screen is reproducible, and the damage is a flat figure because there is
 * nothing to derive it from — see `developerShowResult`.
 */
export const DEVELOPER_MVP_INSTANCE = "developer-mvp";
export const DEVELOPER_MVP_DAMAGE = 42;

export const BOT_ID: PlayerId = 1;

/**
 * The one cheat the engine has to know about, because the draw it changes
 * happens deep inside `beginTurn` where nothing knows which seat is a bot.
 * Every other cheat lives in the bot's own search. Hotseat grants it to nobody.
 */
export function foresightSeat(mode: GameMode): PlayerId | null {
  // A draft rival carries its own fair cheats in the duel state instead.
  return (mode.kind === "bot" || mode.kind === "campaign") && BOT_CHEATS[mode.skill].foresight ? BOT_ID : null;
}
// The practice bot thinks fast enough to be invisible — these pauses exist so a
// human can watch what it did, not because it is slow.
export const BOT_DELAY_MS = 620;
export const BOT_FIRST_DELAY_MS = 900;

export const openingEvent: GameEvent = {
  kind: "info",
  text: "The rift opens. Player One begins.",
};
