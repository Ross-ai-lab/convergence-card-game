import { KEYWORD_LOOKUP, type KeywordEntry } from "./keywords";
import { TOKEN_CARDS } from "./engine/tokens";
import { isMinionCard, type MinionInstance, type PlayableCard } from "./engine/types";

export interface CardTextPiece {
  text: string;
  entry?: KeywordEntry;
  token?: string;
}

const tokenReferences = TOKEN_CARDS.flatMap(card => {
  const aliases = card.id === "token:margit" ? ["Margit"] : card.id === "token:larva" ? ["Larvae"] : [];
  return [card.name, `${card.name}s`, ...aliases].map(match => ({ match, lower: match.toLowerCase(), token: card.id }));
}).sort((a, b) => b.match.length - a.match.length);
const keywordReferences = KEYWORD_LOOKUP.map(reference => ({ ...reference, lower: reference.match.toLowerCase() }));
const isWord = (character: string | undefined) => character !== undefined && /[A-Za-z0-9]/.test(character);

function matchesAt(text: string, offset: number, match: string, lower: string): boolean {
  return text.slice(offset, offset + match.length).toLowerCase() === lower
    && !isWord(text[offset - 1]) && !isWord(text[offset + match.length]);
}

/** Preserve printed text; highlight each keyword once and expose token references. */
export function splitCardText(text: string, allowRelic = true): CardTextPiece[] {
  const pieces: CardTextPiece[] = [];
  const highlighted = new Set<KeywordEntry>();
  let plain = "", offset = 0;
  const flush = () => { if (plain) { pieces.push({ text: plain }); plain = ""; } };
  while (offset < text.length) {
    const token = tokenReferences.find(reference => matchesAt(text, offset, reference.match, reference.lower));
    if (token) {
      flush();
      pieces.push({ text: text.slice(offset, offset + token.match.length), token: token.token });
      offset += token.match.length;
      continue;
    }
    const keyword = keywordReferences.find(reference =>
      (allowRelic || reference.lower !== "relic" && reference.lower !== "relics")
      && matchesAt(text, offset, reference.match, reference.lower));
    if (keyword) {
      flush();
      pieces.push({ text: text.slice(offset, offset + keyword.match.length), entry: highlighted.has(keyword.entry) ? undefined : keyword.entry });
      highlighted.add(keyword.entry);
      offset += keyword.match.length;
      continue;
    }
    plain += text[offset++];
  }
  flush();
  return pieces;
}

const ART_POSITIONS: Readonly<Record<string, string>> = {
  Yujiro: "center 0%",
  Conquest: "center 0%",
  "Stand Arrow": "center 40%",
  "Mob Psycho": "center 70%",
  "Walter White": "center 60%",
};

/** Both the full image and its loading preview use this same crop. */
export function cardArtPosition(name: string): string {
  return ART_POSITIONS[name] ?? "center 26%";
}

/** The visible card, independent of engine bookkeeping and simulation clones. */
export interface CardFaceModel {
  name: string;
  art: string;
  origin: string;
  effect: string;
  rarity: string;
  camp: string;
  alignment: string;
  cost?: number;
  atk?: number;
  hp?: number;
  flavor?: string;
  keywords?: readonly string[];
}
const FACE_FIELDS = ['name', 'art', 'origin', 'effect', 'rarity', 'camp', 'alignment',
  'cost', 'atk', 'hp', 'flavor'] as const;
export function sameStrings(a: readonly string[] = [], b: readonly string[] = []): boolean {
  return a === b || a.length === b.length && a.every((value, index) => value === b[index]);
}
/** A counter or copied passive changing must not repaint an unchanged face. */
export function sameCardFace(a: CardFaceModel, b: CardFaceModel): boolean {
  return a === b || FACE_FIELDS.every(field => a[field] === b[field]) && sameStrings(a.keywords, b.keywords);
}

/**
 * The glossary entries for a card's printed keywords, in the card's own order.
 *
 * Matched case-insensitively against every spelling the glossary knows, so
 * "Cannot Attack" on a card finds the "Cannot attack" entry. A keyword with no
 * entry is skipped rather than shown blank; duplicates are collapsed.
 */
function keywordEntriesFor(keywords: readonly string[]): KeywordEntry[] {
  const found: KeywordEntry[] = [];
  for (const keyword of keywords) {
    const hit = KEYWORD_LOOKUP.find(({ match }) => match.toLowerCase() === keyword.toLowerCase());
    if (hit && !found.includes(hit.entry)) found.push(hit.entry);
  }
  return found;
}

/**
 * Every glossary word a card puts in front of the player, in printed order.
 *
 * THE RULES TEXT IS SCANNED, not only the keywords column, and relics are
 * scanned as well. The column-only version missed the word players ask about
 * most: `Battlecry` is written in the effect line and is in no card's keywords
 * column, so the one panel that exists to explain a card's timing never once
 * explained it. Relics printed no column at all and so armed nothing, while
 * their whole card is rules text.
 *
 * `splitCardText` is the scan — the same pass the gallery's clickable words
 * use, longest match first and word boundaries respected — so a definition can
 * never be offered by one surface and missed by the other. The text comes first
 * because it is the card's own order; a keyword carried only in the column, with
 * no mention in the text, is appended after it. Deduped by entry, so `Freeze`
 * and `Frozen` on one card are one line.
 */
export function handKeywordEntriesFor(card: PlayableCard): KeywordEntry[] {
  const found: KeywordEntry[] = [];
  const add = (entry: KeywordEntry) => {
    if (!found.includes(entry)) found.push(entry);
  };
  for (const piece of splitCardText(card.effect ?? "", isMinionCard(card))) {
    if (piece.entry) add(piece.entry);
  }
  for (const entry of keywordEntriesFor(isMinionCard(card) ? card.keywords : [])) add(entry);
  return found;
}

export function minionKeywordEntriesFor(minion: MinionInstance): KeywordEntry[] {
  const found: KeywordEntry[] = [];
  const add = (entry: KeywordEntry) => {
    if (!found.includes(entry)) found.push(entry);
  };
  if (minion.silenced) return found;
  for (const piece of splitCardText(minion.effect)) {
    if (piece.entry) add(piece.entry);
  }
  for (const effect of minion.gainedEffects) {
    for (const piece of splitCardText(effect.text)) {
      if (piece.entry) add(piece.entry);
    }
  }
  for (const entry of keywordEntriesFor(minion.keywords)) add(entry);
  return found;
}
