import cardsCsv from "../../data/cards.csv?raw";
import relicsCsv from "../../data/relics.csv?raw";
import { parseCardsCsv, parseRelicsCsv } from "../engine/csv";

export function resolvePublicAssetUrl(assetPath: string, baseUrl = import.meta.env.BASE_URL): string {
  if (!assetPath || /^(?:data:|blob:|https?:\/\/)/i.test(assetPath)) return assetPath;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, "")}`;
}

export const cards = parseCardsCsv(cardsCsv).map((card) => ({
  ...card,
  art: resolvePublicAssetUrl(card.art),
}));

export const relics = parseRelicsCsv(relicsCsv).map((relic) => ({
  ...relic,
  art: resolvePublicAssetUrl(relic.art),
}));
