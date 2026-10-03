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

export function isLoreChapterUnlocked(chapter: number, completedBosses: readonly number[]): boolean {
  return chapter === 1 && completedBosses.length > 0;
}
