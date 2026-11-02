/**
 * Emotes: the four things a player can say from their portrait during a duel,
 * and what the opponent says back.
 *
 * Emotes never touch the duel. They are not engine actions, are not saved with
 * the duel, and online they travel beside the numbered steps rather than as one,
 * so two browsers can disagree about an emote without disagreeing about the game.
 */
import { CAMPAIGN_PROTAGONIST, CAMPAIGN_RICK_EMOTES, type CampaignChapter, type CampaignEmoteReplies } from "./campaign";

export type EmoteId = keyof CampaignEmoteReplies;

export interface EmoteDefinition {
  readonly id: EmoteId;
  /** The button in the emote menu. */
  readonly label: string;
  /** What the player says in their speech bubble, in Rick's words from campaign-story.json. */
  readonly line: string;
}

/** Menu order: the two friendly emotes first, then the two cheeky ones. */
export const EMOTES: readonly EmoteDefinition[] = Object.freeze([
  { id: "hi", label: "Hi", line: CAMPAIGN_RICK_EMOTES.hi },
  { id: "wellPlayed", label: "Well played", line: CAMPAIGN_RICK_EMOTES.wellPlayed },
  { id: "oops", label: "Oops", line: CAMPAIGN_RICK_EMOTES.oops },
  { id: "taunt", label: "Taunt", line: CAMPAIGN_RICK_EMOTES.taunt },
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

/**
 * The recording for a line said from a portrait: a champion's reply, or Rick's
 * own emote. Rivals and named online players have none.
 */
export function emoteVoiceKey(id: EmoteId, speaker: string, chapter?: Pick<CampaignChapter, "chapter">): string | null {
  if (chapter) return `${String(chapter.chapter).padStart(2, "0")}-emote-${id}`;
  return speaker === CAMPAIGN_PROTAGONIST ? `rick-emote-${id}` : null;
}

/** The pause before a bot answers, so the reply reads as a reply and not an echo. */
export const EMOTE_REPLY_DELAY_MS = 1100;

/**
 * The pause before a bot answers a spoken emote: the usual beat, or until Rick
 * has finished, so the reply never cuts him off.
 */
export function emoteReplyDelay(voiceSeconds = 0): number {
  return Math.max(EMOTE_REPLY_DELAY_MS, Math.round(voiceSeconds * 1000) + 350);
}

/**
 * Long enough to read the line, never long enough to sit over the board all
 * turn. A recorded line stays up until it has been spoken.
 */
export function emoteBubbleDuration(text: string, voiceSeconds = 0): number {
  return Math.max(Math.min(6500, Math.max(2600, 1800 + text.length * 45)), Math.round(voiceSeconds * 1000) + 600);
}
