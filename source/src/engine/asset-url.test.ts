import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePublicAssetUrl } from "./asset-url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

describe("public asset addresses", () => {
  /**
   * The guard that the rest of the suite structurally cannot provide.
   *
   * Vitest runs at base `/`, so a root-absolute `"/card-art/raw/x.webp"` and the
   * correctly resolved address are the SAME STRING here. Every runtime assertion
   * on artwork therefore passes whether the code is right or wrong — which is
   * exactly how six summoned tokens shipped pointing at the domain root and 404ing
   * on the published site while all 196 real cards loaded.
   *
   * The only thing that separates the two cases is the source text itself, so this
   * reads it. A leading slash on an asset address means the base was skipped.
   */
  it("never writes a root-absolute asset address into the source", () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const hits = readFileSync(file, "utf8").match(/\b(?:art|src)\s*[:=]\s*"\/[^"]*"/g) ?? [];
      return hits.map((hit) => `${file.slice(SRC.length + 1)}: ${hit}`);
    });
    expect(offenders).toEqual([]);
  });

  it("puts an asset under the published folder rather than the domain root", () => {
    const deployed = "/convergence-card-game/play/";
    expect(resolvePublicAssetUrl("/card-art/raw/galactus.webp", deployed)).toBe(
      "/convergence-card-game/play/card-art/raw/galactus.webp",
    );
    expect(resolvePublicAssetUrl("/card-art/raw/token-drakath.webp", deployed)).toBe(
      "/convergence-card-game/play/card-art/raw/token-drakath.webp",
    );
  });

  it("adds the separator when the base has no trailing slash", () => {
    expect(resolvePublicAssetUrl("/card-art/raw/galactus.webp", "/play")).toBe("/play/card-art/raw/galactus.webp");
  });

  it("leaves already-usable addresses alone", () => {
    expect(resolvePublicAssetUrl("https://cdn.example/x.webp", "/play/")).toBe("https://cdn.example/x.webp");
    expect(resolvePublicAssetUrl("data:image/webp;base64,AAAA", "/play/")).toBe("data:image/webp;base64,AAAA");
    expect(resolvePublicAssetUrl("", "/play/")).toBe("");
  });
});
