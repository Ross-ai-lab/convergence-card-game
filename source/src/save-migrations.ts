import artRenames from '../data/art-renames.json';
import {resolvePublicAssetUrl} from './engine/asset-url';
import { cards, relics } from "./data/cards";
import { applyAction, makeCardLibrary, STARTING_CORE } from "./engine/game";
import type { GameEvent, GameState } from "./engine/types";

const currentCards = new Map(cards.map(card => [card.id, card]));
const refreshedTiers = new Set([
  "c088", "c076", "c127", "c148", "c163", "c149", "c145", "c151", "c126",
  "c181", "c160", "c159", "c045", "c035", "c065", "c020", "c184", "c085",
]);
const refreshedRules = new Set(["c016", "c140", "c169", "c185", "c109"]);
const refreshedArt = new Set(["c126", "c127"]);
const effectRules = new Map<string, string>(["c053", ...refreshedRules, "c122"].flatMap(id => {
  const card = currentCards.get(id);
  return card ? [[card.effectId, card.effect] as const] : [];
}));
const batman = currentCards.get("c005");
const batmanReduction = batman?.effect.match(/give it (-\d+ ATK)/i)?.[1];

function refreshSavedValue(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if(object.effectId==='dodge_50'||object.effectId==='dodge_80') {
    const old=object.effectId==='dodge_50'?'50%':'80%',next=old==='50%'?'40%':'60%';
    object.effectId=old==='50%'?'dodge_40':'dodge_60';
    for(const key of ['effect','text'])if(typeof object[key]==='string')object[key]=object[key].replace(old,next);
  }
  if(typeof object.art==='string'){
    const filename=object.art.split('/').pop()?.split(/[?#]/)[0];
    const next=filename?(artRenames as Record<string,string>)[filename]:undefined;
    if(next)object.art=resolvePublicAssetUrl('/card-art/raw/'+next);
  }
  const id = typeof object.cardId === "string" ? object.cardId : "";
  const card = currentCards.get(id);
  if (card) {
    if (refreshedTiers.has(id) && "rarity" in object) object.rarity = card.rarity;
    if((id==="c004"||id==="c063")&&typeof object.effect==="string")object.effect=card.effect;
    if (refreshedRules.has(id) && typeof object.effect === "string") object.effect = card.effect;
    if (refreshedArt.has(id)) object.art = card.art;
    if (id === "c012") object.camp = card.camp;
    if (id === "c122" && object.effectId === "wall_of_flesh_grind") object.effect = card.effect;
  }
  if (object.effectId === "hashira_focus_attack") object.effectId = "hashira_good_volley";
  const effectText = typeof object.effectId === "string" ? effectRules.get(object.effectId) : undefined;
  if (effectText && typeof object.text === "string") object.text = effectText;
  if (object.effectId === "mob_ascend" && effectText && typeof object.effect === "string") object.effect = effectText;
  if (typeof object.savedCoreHealth === "number") object.savedCoreHealth = Math.min(STARTING_CORE, object.savedCoreHealth);
  for (const [key, child] of Object.entries(object)) {
    if (typeof child === "string") object[key] = child.replace(/Ascension Relics?/gi, term => /s$/i.test(term) ? "Relics" : "Relic");
  }
  if (id === "c005" && batman) {
    if (object.rarity === "Purple") object.rarity = batman.rarity;
    if (object.effectId === "batman_gadget_choice") object.effect = batman.effect;
  }
  if (object.sourceCardId === "c005" && object.kind === "option" && Array.isArray(object.labelOptions) && batmanReduction) {
    for (const option of object.labelOptions) if (option?.value === "weaken") option.label = `Give it ${batmanReduction}`;
  }
  for (const child of Object.values(object)) refreshSavedValue(child);
}

/** Refresh printed rules and compatibility fields, retaining combat stats and the duel. */
export function migrateSavedDuel(game: GameState): { game: GameState; events: GameEvent[] } {
  const oldHashiraChoice = (game.pendingTarget?.effectId as string) === "hashira_focus_attack";
  for (const player of game.players) player.health = Math.min(STARTING_CORE, player.health);
  refreshSavedValue(game);
  if (oldHashiraChoice && game.pendingTarget?.options.length) {
    const resolved = applyAction(game, { type: "choose_target", player: game.pendingTarget.player, choiceIndex: 0 }, makeCardLibrary(cards, relics));
    return { game: resolved.state, events: resolved.events };
  }
  return { game, events: [] };
}
