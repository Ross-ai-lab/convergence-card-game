import chapterScripts from '../../materials/lore/chapters.json';

export type LorePanel = { caption: string; dialogue: string; scene: string };

/** A Lore book chapter. `art` is a painted six-panel atlas; without one the reader draws a storyboard. */
export type LoreChapter = {
  number: number;
  title: string;
  slug: string;
  panels: readonly LorePanel[];
  art?: string;
};

export const LORE_CHAPTER_ONE = {
  title: 'The Empty Chair',
  panels: [
    {caption:'The arena went quiet.',dialogue:"That's one.",scene:'Rick Gramps stands alone in a ruined arena beside his glowing reward card.'},
    {caption:'His prize refused to stay a prize.',dialogue:'',scene:'The reward card unfolds into a golden paper bird and flies toward a keyhole in the sky.'},
    {caption:'It led him somewhere between worlds.',dialogue:'Late again.',scene:'Rick follows the bird into an impossible waiting room. A young archivist carries golden keys.'},
    {caption:'',dialogue:"Those aren't trophies. They're doors. Someone has been locking them.",scene:'The archivist reveals floating cards, each containing a living world and a golden lock.'},
    {caption:'An empty chair. A familiar face.',dialogue:"It's been waiting for you.",scene:'Rick finds his own portrait on the seat at the head of an enormous card table.'},
    {caption:'Somewhere above, a hand stopped shuffling.',dialogue:"Then I'll deal.",scene:'Rick takes the chair and fans his deck. Worlds spiral around him beneath an enormous shadowy hand.'},
  ],
} as const;

export const LORE_CHAPTERS: readonly LoreChapter[] = [
  {number:1,title:LORE_CHAPTER_ONE.title,slug:'the-empty-chair',panels:LORE_CHAPTER_ONE.panels,art:'lore/the-empty-chair.webp?v=chapter-one-2026'},
  ...chapterScripts.chapters.map(({number,title,slug,panels})=>({
    number,title,slug,
    panels:panels.map(({caption,dialogue,scene})=>({caption,dialogue,scene})),
  })),
];

/**
 * First champion victories needed for each chapter. The first opens on any
 * victory, the rest roughly every two, and the finale only once all twenty
 * champions have fallen.
 */
export const LORE_CHAPTER_VICTORIES = [1, 2, 4, 6, 8, 10, 12, 14, 17, 20] as const;

export function isLoreChapterUnlocked(chapter: number, completedBosses: readonly number[]): boolean {
  const needed = LORE_CHAPTER_VICTORIES[chapter - 1];
  return needed !== undefined && new Set(completedBosses).size >= needed;
}
