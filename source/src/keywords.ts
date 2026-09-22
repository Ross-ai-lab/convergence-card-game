/**
 * Every word the card text is allowed to assume you know, defined once.
 *
 * There are two surfaces that have to say the same thing about Chained: the
 * How to play guide, which is where a player goes to look a word up, and the
 * card face itself, where clicking the word now answers on the spot. Those two
 * were never going to stay in step as prose in two files, and the way that fails
 * is silent — the guide says two turns, a card tooltip says one, and both look
 * authoritative. So the definitions live here as data and both surfaces render
 * them.
 *
 * The text carries `*emphasis*` markers rather than markup. A definition has to
 * survive being read as a plain string (the tooltip measures and wraps it) and
 * as rich text (the guide bolds the load-bearing numbers), and one marker that
 * both sides understand is the smallest thing that does both.
 */
export interface KeywordEntry {
  /** The printed term, exactly as the guide lists it. */
  term: string;
  /**
   * Other spellings that appear in card text and should point at this entry.
   * `Frozen` is the state `Freeze` puts a minion in, and a card prints either.
   */
  aliases?: string[];
  /** The definition, with `*emphasis*` markers. */
  text: string;
  /**
   * False for entries that explain a concept rather than a printed word, so the
   * card face does not underline half a sentence. They still appear in the guide.
   */
  onCard?: boolean;
}

export const KEYWORDS: KeywordEntry[] = [
  { term: "Battlecry", text: "Happens once when the minion enters play." },
  {
    term: "Ongoing",
    text: "Happens at the start of each of the owner’s turns.",
  },
  { term: "Passive", text: "Applies while the minion is alive." },
  { term: "Battlecry/Ongoing", text: "Both: once on arrival, then again every owner turn." },
  { term: "Deathrattle", text: "Happens after the minion dies." },
  { term: "Taunt", text: "Prevents the enemy from targeting any other minion or core." },
  { term: "Charge", text: "May attack the same turn it is summoned." },
  {
    term: "Chained",
    aliases: ["Chain"],
    text:
      "The minion loses *two* of its turns — always two, and no card prints a different number. Across both it cannot attack, its Passive and Ongoing effects do not fire, and it is untargetable by *both* players: not by an attack, not by removal, not by a buff of your own.",
  },
  {
    term: "Divine Shield",
    text: "Blocks the next instance of damage.",
  },
  {
    term: "Freeze",
    aliases: ["Frozen"],
    text: "Loses one turn.",
  },
  {
    term: "Silence",
    aliases: ["Silenced"],
    text: "Removes all effects and buffs to stats.",
  },
  {
    term: "Cannot attack",
    text: "Cannot attack, but still retaliates.",
  },
  {
    term: "Reborn",
    text: "Returns after death at 1 HP with printed ATK and no buffs or relics.",
  },
  {
    term: "Reborn, how many times",
    onCard: false,
    text: "Plain Reborn gives one life. Reborn twice gives two. Reborn infinitely never runs out.",
  },
  {
    term: "Asleep",
    aliases: ["Sleeping"],
    text: "The one-turn wait after being played or summoned.",
  },
  { term: "Evade", text: "A percentage chance to dodge an incoming attack." },
  { term: "Invulnerable", text: "Takes no damage." },
  { term: "Immune", text: "Takes no damage from one named source." },
  {
    term: "Adapted",
    text: "Gains temporary immunity to the camp that last damaged it.",
  },
  { term: "Untargetable", text: "Attacks and effects cannot choose it." },
  { term: "Attack Locked", text: "Cannot attack until the lock ends." },
  {
    term: "Marked",
    text: "A delayed effect is waiting to resolve on the minion.",
  },
  { term: "Destroy", text: "Removes a minion, bypassing Divine Shield." },
  { term: "Summon", text: "Puts a new minion into an open slot." },
  { term: "Discover", text: "Offers three choices. Choose one." },
  {
    term: "Transform",
    aliases: ["Devolve"],
    text: "Replaces a minion with another roster minion. Relics are lost.",
  },
  { term: "Seize", text: "Moves an enemy minion to your board. It arrives asleep unless it has Charge." },
];

/**
 * Every clickable spelling, longest first.
 *
 * Longest first is the whole correctness of the matcher: `Divine Shield` has to
 * be offered before `Shield` would be, and `Attack Locked` before `Attack`, or
 * the shorter word wins the position and swallows the phrase. Built once at
 * module load, not per card.
 */
export const KEYWORD_LOOKUP: Array<{ match: string; entry: KeywordEntry }> = KEYWORDS.filter(
  (entry) => entry.onCard !== false,
)
  .flatMap((entry) => [entry.term, ...(entry.aliases ?? [])].map((match) => ({ match, entry })))
  .sort((a, b) => b.match.length - a.match.length);

/** Strips the `*emphasis*` markers, for anywhere that needs the bare sentence. */
export function plainKeywordText(text: string): string {
  return text.replace(/\*/g, "");
}

/**
 * Splits a definition into its plain and emphasised runs, so a renderer can
 * bold the second kind without either surface owning a parser of its own.
 */
export function keywordRuns(text: string): Array<{ text: string; strong: boolean }> {
  return text
    .split("*")
    .map((part, index) => ({ text: part, strong: index % 2 === 1 }))
    .filter((run) => run.text.length > 0);
}
