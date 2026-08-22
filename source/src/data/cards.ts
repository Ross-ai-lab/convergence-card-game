import cardsCsv from "../../data/cards.csv?raw";
import relicsCsv from "../../data/relics.csv?raw";
import { parseCardsCsv, parseRelicsCsv } from "../engine/csv";
import { resolvePublicAssetUrl } from "../engine/asset-url";

// Lives in the engine now, because the engine builds asset addresses too — the
// summoned tokens in `game.ts` need the same base handling these cards get, and
// engine code cannot import this module without dragging both CSVs in with it.
// Re-exported so every existing importer keeps working unchanged.
export { resolvePublicAssetUrl };

export const cards = parseCardsCsv(cardsCsv).map((card) => ({
  ...card,
  art: resolvePublicAssetUrl(card.art),
}));

export const relics = parseRelicsCsv(relicsCsv).map((relic) => ({
  ...relic,
  art: resolvePublicAssetUrl(relic.art),
}));
