import { KEYWORD_LOOKUP, type KeywordEntry } from "./keywords";
import { TOKEN_CARDS } from "./engine/tokens";

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
