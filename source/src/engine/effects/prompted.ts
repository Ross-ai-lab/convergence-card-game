/**
 * Effects that ask in stages and so run their own prompts before anything else.
 */
import { isMinionCard } from "../types";
import type { EffectStart } from "./context";
import { TARGETED_EFFECTS, requestChoice } from "../rules/targeting";
import { applyFreeze, applySilence, canDisable, isSlotProtected, setMinionAttack } from "../rules/stats";
import { discoverAlignmentMinions, putCardInHand, removeCardFromDrawPile } from "../rules/cards";
import { discoverThree } from "../rules/random";
import { effectEvent } from "../rules/core";
import { relicsInDeck, takeRelicFromDeckToHand } from "../rules/relics";
import { runEffect } from "./run-effect";

export function effectDiscoverRelicSelf(ctx: EffectStart): boolean | void {
  const { state, source, sourceSlot, library, events, chosen, label } = ctx;
  if (chosen?.kind !== "option") {
    const next = requestChoice(
      state,
      source,
      {
        kind: "option",
        side: "friendly",
        prompt: source.effectId === "discover_relic_self" ? "Discover 1 of 3 Relics" : "Choose 1 of 3 Relics",
        values: discoverThree(state, relicsInDeck(state, source.owner, library)).map((relic) => ({ label: relic.name, value: relic.id })),
      },
      library,
    );
    if (next === "asked") return true;
    if (next) return runEffect(state, source, sourceSlot, library, events, next);
    return false;
  }

  const relic = takeRelicFromDeckToHand(state, source.owner, chosen.option.value, library, events);
  if (relic) {
    events.push(effectEvent(`${label} claims ${relic.name}.`, source));
  }
  return false;
}

export function effectFrierenRelicDiscover(ctx: EffectStart): boolean | void {
  const { state, source, sourceSlot, library, events, chosen } = ctx;
  if (chosen?.kind !== "option") {
    const next = requestChoice(
      state,
      source,
      {
        kind: "option",
        side: "friendly",
        prompt: "Discover 1 of 3 Relics",
        values: discoverThree(state, relicsInDeck(state, source.owner, library)).map((relic) => ({ label: relic.name, value: relic.id })),
      },
      library,
    );
    if (next === "asked") return true;
    if (next) return runEffect(state, source, sourceSlot, library, events, next);
    return false;
  }

  const relic = takeRelicFromDeckToHand(state, source.owner, chosen.option.value, library, events);
  if (relic) events.push(effectEvent(`${source.name} discovers ${relic.name}.`, source));
  return false;
}

// Morpheus pauses twice: the pill chooses Good or Evil, then the chosen
// alignment offers three random minions from the controller's deck to draw.
export function effectMorpheusChoice(ctx: EffectStart): boolean | void {
  const { state, source, sourceSlot, library, events, chosen, label } = ctx;
  if (!chosen || chosen.kind !== "option") {
    const pill = requestChoice(state, source, TARGETED_EFFECTS.morpheus_choice!, library);
    if (pill === "asked") return true;
    if (!pill || pill.kind !== "option") return false;
    return runEffect(state, source, sourceSlot, library, events, pill);
  }

  const alignment = chosen.option.value === "good" ? "Good" : chosen.option.value === "evil" ? "Evil" : null;
  if (alignment) {
    const offers = discoverAlignmentMinions(state, source.owner, alignment, library);
    if (offers.length === 0) {
      events.push(effectEvent(`${label} finds no ${alignment} minion in the deck.`, source));
      return false;
    }
    const cardChoice = requestChoice(
      state,
      source,
      {
        kind: "option",
        side: "friendly",
        prompt: `Discover ${offers.length} ${alignment} minion${offers.length === 1 ? "" : "s"} from the deck`,
        values: offers.map((card) => ({ label: card.name, value: card.id })),
      },
      library,
    );
    if (cardChoice === "asked") return true;
    if (!cardChoice || cardChoice.kind !== "option") return false;
    return runEffect(state, source, sourceSlot, library, events, cardChoice);
  }

  const card = library[chosen.option.value];
  if (!isMinionCard(card) || (card.alignment !== "Good" && card.alignment !== "Evil")) return false;
  if (!removeCardFromDrawPile(state, source.owner, card.id)) return false;
  putCardInHand(state, source.owner, card.id, events);
  events.push(effectEvent(`${label} draws ${card.name} from the deck.`, source));
  return false;
}

// Batman resolves in two prompts: first the victim, then the gadget to use.
// Keeping the victim in priorOptions makes the second prompt save/undo safe.
export function effectBatmanGadgetChoice(ctx: EffectStart): boolean | void {
  const { state, source, sourceSlot, library, events, chosen, label } = ctx;
  if (chosen?.kind === "option") {
    const targetRef = chosen.priorOptions?.[0];
    const target = targetRef ? state.players[targetRef.owner].board[targetRef.slot] : null;
    if (!target) return false;
    if (chosen.option.value === "freeze") {
      applyFreeze(state, source, target, events);
    } else if (chosen.option.value === "silence") {
      if (!isSlotProtected(state, target) && canDisable(state, source.owner, target, "silence")) {
        applySilence(target);
        events.push(effectEvent(`${label} silences ${target.name}.`, source));
      }
    } else if (chosen.option.value === "weaken") {
      setMinionAttack(target,target.atk-2);
      events.push(effectEvent(`${label} gives ${target.name} -2 ATK.`, source));
    }
    return false;
  }
  const first = chosen?.kind === "board"
    ? chosen
    : requestChoice(state, source, { side: "enemy", prompt: "Choose an enemy minion for Batman" }, library);
  if (first === "asked") return true;
  if (!first || first.kind !== "board") return false;
  const gadget = requestChoice(
    state,
    source,
    {
      kind: "option",
      side: "friendly",
      prompt: "Choose a gadget",
      values: [
        { label: "Freeze it", value: "freeze" },
        { label: "Silence it", value: "silence" },
        { label: "Give it -2 ATK", value: "weaken" },
      ],
    },
    library,
    1,
    [first.target],
  );
  if (gadget === "asked") return true;
  if (gadget) return runEffect(state, source, sourceSlot, library, events, gadget);
  return false;
}
