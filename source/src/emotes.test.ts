import { describe, expect, it } from "vitest";
import { CAMPAIGN_CHAPTERS } from "./campaign";
import { EMOTES, EMOTE_IDS, emoteBubbleDuration, emoteLine, emoteReply, isEmoteId, RIVAL_REPLIES } from "./emotes";

describe("emotes", () => {
  it("offers Hi, Well played, Oops and Taunt, in that order", () => {
    expect(EMOTES.map((emote) => emote.label)).toEqual(["Hi", "Well played", "Oops", "Taunt"]);
    expect(EMOTE_IDS.every(isEmoteId)).toBe(true);
    expect(isEmoteId("wow")).toBe(false);
    expect(emoteLine("wellPlayed")).toBe("Well played.");
  });

  it("gives every champion its own answer to every emote", () => {
    expect(CAMPAIGN_CHAPTERS).toHaveLength(20);
    const answers = new Set<string>();
    for (const chapter of CAMPAIGN_CHAPTERS) {
      for (const id of EMOTE_IDS) {
        const reply = emoteReply(id, chapter);
        expect(reply.trim().length, `chapter ${chapter.chapter} ${id}`).toBeGreaterThan(0);
        expect(reply).not.toBe(RIVAL_REPLIES[id]);
        answers.add(reply);
      }
    }
    // No champion borrows another's line.
    expect(answers.size).toBe(CAMPAIGN_CHAPTERS.length * EMOTE_IDS.length);
  });

  it("answers as a rival outside the campaign", () => {
    for (const id of EMOTE_IDS) expect(emoteReply(id)).toBe(RIVAL_REPLIES[id]);
  });

  it("keeps a bubble up long enough to read, and never all turn", () => {
    expect(emoteBubbleDuration("Hi!")).toBe(2600);
    const longest = Math.max(...CAMPAIGN_CHAPTERS.flatMap((chapter) => EMOTE_IDS.map((id) => emoteReply(id, chapter).length)));
    expect(emoteBubbleDuration("x".repeat(longest))).toBeLessThanOrEqual(6500);
    expect(emoteBubbleDuration("x".repeat(400))).toBe(6500);
  });
});
