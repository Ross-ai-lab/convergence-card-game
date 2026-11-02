/**
 * Emotes: the four things a player can say from their portrait during a duel,
 * and what the opponent says back.
 *
 * Emotes never touch the duel. They are not engine actions, are not saved with
 * the duel, and online they travel beside the numbered steps rather than as one,
 * so two browsers can disagree about an emote without disagreeing about the game.
 */
import type { CampaignChapter, CampaignEmoteReplies } from "./campaign";

export type EmoteId = keyof CampaignEmoteReplies;

export interface EmoteDefinition {
  readonly id: EmoteId;
  /** The button in the emote menu. */
  readonly label: string;
  /** What the player says in their speech bubble. */
  readonly line: string;
}

/** Menu order: the two friendly emotes first, then the two cheeky ones. */
export const EMOTES: readonly EmoteDefinition[] = Object.freeze([
  { id: "hi", label: "Hi", line: "Hi!" },
  { id: "wellPlayed", label: "Well played", line: "Well played." },
  { id: "oops", label: "Oops", line: "Oops." },
  { id: "taunt", label: "Taunt", line: "You'll look great in my collection." },
]);

export const EMOTE_IDS: readonly EmoteId[] = Object.freeze(EMOTES.map((emote) => emote.id));

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && (EMOTE_IDS as readonly string[]).includes(value);
}

export function emoteLine(id: EmoteId): string {
  return EMOTES.find((emote) => emote.id === id)!.line;
}

/** Practice opponents and Arena rivals have no champion's voice, so they share one. */
export const RIVAL_REPLIES: CampaignEmoteReplies = Object.freeze({
  hi: "Hello. Good luck out there.",
  wellPlayed: "Thanks. Not bad yourself.",
  oops: "It happens to the best of us.",
  taunt: "Big words. Let's see your cards back them up.",
});

/** A champion answers in their own voice; anyone else answers as a rival. */
export function emoteReply(id: EmoteId, chapter?: Pick<CampaignChapter, "story">): string {
  return (chapter?.story.emotes ?? RIVAL_REPLIES)[id];
}

/** The pause before a bot answers, so the reply reads as a reply and not an echo. */
export const EMOTE_REPLY_DELAY_MS = 1100;

/** Long enough to read the line, never long enough to sit over the board all turn. */
export function emoteBubbleDuration(text: string): number {
  return Math.min(6500, Math.max(2600, 1800 + text.length * 45));
}
