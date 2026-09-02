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
  { term: "Battlecry", text: "Happens once, when the minion enters play." },
  {
    term: "Ongoing",
    text: "Happens again at the start of its owner’s turn. An enemy Ongoing waits for the enemy’s turn, not yours.",
  },
  { term: "Passive", text: "A standing rule that applies for as long as the minion is active. It never “fires”." },
  { term: "Battlecry/Ongoing", text: "Both: once on arrival, then again every owner turn." },
  { term: "Deathrattle", text: "Happens after the minion dies — unless it was Silenced first." },
  { term: "Taunt", text: "The enemy must deal with this minion before attacking your core." },
  { term: "Charge", text: "May attack the same turn it is summoned, or the turn it changes controller." },
  {
    term: "Chained",
    aliases: ["Chain"],
    text:
      "The minion loses *two* of its turns — always two, and no card prints a different number. Across both it cannot attack, its Passive and Ongoing effects do not fire, and it is untargetable by *both* players: not by an attack, not by removal, not by a buff of your own. It is the price a card pays for being too strong for its cost: a *Freeze* that lasts a turn longer and bites deeper.",
  },
  {
    term: "Divine Shield",
    text:
      "Blocks the next instance of damage, whatever its size, then the gold rim goes out. *Silence* switches it off for as long as it lasts.",
  },
  {
    term: "Freeze",
    aliases: ["Frozen"],
    text:
      "The minion loses *one* turn, then thaws once it has sat that turn out. It keeps its Passive and stays targetable throughout — that, and the extra turn, is what separates it from *Chained*.",
  },
  {
    term: "Silence",
    aliases: ["Silenced"],
    text:
      "Strips the printed effect and keywords, Divine Shield included, and takes back every stat *buff* the minion is carrying, down to its printed stats. Nerfs it has taken are kept. A Silence that its own card calls temporary only suspends the buffs.",
  },
  {
    term: "Cannot attack",
    text:
      "This minion never attacks, whatever its ATK. It still blocks, still takes damage, and still strikes back when attacked. Its ATK gem is grey.",
  },
  {
    term: "Reborn",
    text:
      "When the minion dies it comes back where it fell, at *1 HP*, with its printed ATK and nothing else it was carrying: no buffs, no relic, no shield. A full board leaves it nowhere to return to, and *Silence* stops it like any other keyword.",
  },
  {
    term: "Reborn, how many times",
    onCard: false,
    text:
      "The card says. Plain *Reborn* is once; *Reborn twice* is two lives; *Reborn infinitely* never runs out. A card that comes back spends a life, so the text you read on the returning body is always what it has left — and when the last one is gone, the text is gone with it.",
  },
  {
    term: "Asleep",
    aliases: ["Sleeping"],
    text:
      "The one-turn wait after a minion is played or summoned. Separate from Chained, and skipped by Charge. Drifting z’s show it.",
  },
  { term: "Evade", text: "A printed percentage chance to dodge an incoming attack outright." },
  { term: "Invulnerable", text: "Takes no damage while the condition lasts; a blue-and-white rim shows it." },
  { term: "Immune", text: "Takes no damage from one named source — a camp, an alignment, a damage type." },
  {
    term: "Adapted",
    text:
      "The minion has learned the camp that last hit it and shrugs that camp off for a few turns. A purple glow rises from the card, and it fades when the immunity does.",
  },
  { term: "Untargetable", text: "Attacks and effects cannot choose it while the condition lasts." },
  { term: "Attack Locked", text: "Cannot attack until the printed lock ends; the attack gem greys out." },
  {
    term: "Marked",
    text:
      "A delayed effect is waiting on the minion, and a red pulse runs round the card. The card that marked it says when it lands.",
  },
  {
    term: "Stasis",
    text:
      "The minion is lifted off the board for two turns and comes back exactly as it left, in its own slot if that slot is still free.",
  },
  { term: "Banished", text: "The minion is put away until the card that banished it dies. Then it returns." },
  {
    term: "Pocket room",
    text:
      "One friendly and one enemy minion are shut away together for two turns. The higher ATK walks out; the other is gone. Equal ATK and both walk out.",
  },
  {
    term: "Protected slot",
    text:
      "A board position that shields whoever stands in it from Silence, Freeze and Chained — but not from damage, targeting or removal.",
  },
  { term: "Destroy", text: "Removes a minion outright, dealing no damage. Divine Shield does not stop it." },
  { term: "Summon", text: "Puts a new minion into an open slot. No open slot, no summon." },
  {
    term: "Discover",
    text:
      "Offers you three cards from the shared deck and you keep one. The other two stay in the deck. Your opponent is not shown what you were offered.",
  },
  {
    term: "Transform",
    aliases: ["Devolve"],
    text:
      "Replaces a minion with a different one from the roster, usually one mana step up or down. Its relics are lost with it. *Devolve* is the same word pointing downward.",
  },
  { term: "Seize", text: "Moves an enemy minion onto your board. It arrives asleep unless it has Charge, and it needs a free slot." },
  {
    term: "Return to hand",
    text:
      "Takes a minion off the board and puts its card back in its owner’s hand, at full printed stats. Attached relics are discarded.",
  },
  { term: "Gain stats", text: "Adds ATK and both maximum and current HP." },
  { term: "Target", onCard: false, text: "A minion, card or board slot that you choose when the effect resolves." },
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
