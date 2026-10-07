/** A card's Star Chart profile: header, card rail, lore, radar and relationships. */
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LORE_DETAILS, type LoreDetail } from "../data/lore";
import { isRelicCard, rarityName } from "../engine/types";
import type { PlayableCard } from "../engine/types";
import type { CardFaceModel } from "../card-presentation";
import { campAccent, CardFace } from "../card-face";
import { useProfileFit } from "../profile-fit";

const STAR_CHART_AXES = ["STR", "VIT", "WIL", "MAG", "INT", "AGI"] as const;

function loreFor(card: PlayableCard): LoreDetail | null {
  return LORE_DETAILS[card.id] ?? null;
}

export type GalleryEntry = { key: string; card: PlayableCard; face: CardFaceModel };

/**
 * The six-axis lore radar.
 *
 * Redesigned 5 September 2026. The old one drew a 240-unit chart at 220px with
 * 10px labels, which renders around 9 real pixels — unreadable, and absurd once
 * the profile copy around it went to 20px. Three things changed and all three
 * are about legibility rather than decoration: the axis name and its value are
 * now two stacked lines instead of one cramped string, the value is the larger
 * of the two because the number is what a reader is actually scanning for, and
 * the whole chart is drawn 1:1 so an SVG unit IS a CSS pixel and a size written
 * here is the size on screen.
 *
 * The rings fade outward so the shape reads against them rather than through a
 * uniform grid, and the plotted polygon carries a real glow in the card's camp
 * colour, which is what makes a hexagon feel like an instrument.
 */
function StarChart({ values, accent, name }: { values: number[]; accent: string; name: string }) {
  const size = 300;
  const centre = size / 2;
  const radius = 90;
  const point = (index: number, value: number, extra = 0) => {
    const angle = (-90 + index * 60) * (Math.PI / 180);
    const distance = (radius * Math.max(0, Math.min(10, value))) / 10 + extra;
    return { x: centre + Math.cos(angle) * distance, y: centre + Math.sin(angle) * distance, angle };
  };
  const polygon = (value: number) =>
    STAR_CHART_AXES.map((_axis, index) => {
      const at = point(index, value);
      return `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
    }).join(" ");
  const dataPoints = STAR_CHART_AXES.map((_axis, index) => point(index, values[index] ?? 0));
  const accentStyle = { "--chart-accent": accent } as CSSProperties;
  // One id per mounted chart, so two charts on one page cannot share a filter.
  const glowId = `radar-glow-${name.replace(/[^a-z0-9]+/gi, "")}`;

  return (
    <svg className="star-chart" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${name} Star Chart`} style={accentStyle}>
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`${glowId}-bed`}>
          <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={centre} cy={centre} r={radius + 10} fill={`url(#${glowId}-bed)`} />

      {/* Outermost ring brightest: it is the boundary the shape is read against. */}
      {[2, 4, 6, 8, 10].map((level) => (
        <polygon key={level} className="star-chart-ring" points={polygon(level)} style={{ opacity: 0.18 + level * 0.028 }} />
      ))}
      {STAR_CHART_AXES.map((_axis, index) => {
        const end = point(index, 10);
        return <line key={index} className="star-chart-axis" x1={centre} y1={centre} x2={end.x} y2={end.y} />;
      })}

      <polygon
        className="star-chart-data"
        points={dataPoints.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(" ")}
        filter={`url(#${glowId})`}
      />
      {dataPoints.map((item, index) => (
        <circle key={index} className="star-chart-point" cx={item.x} cy={item.y} r="4.5" />
      ))}

      {STAR_CHART_AXES.map((axis, index) => {
        const label = point(index, 10, 24);
        const cos = Math.cos(label.angle);
        const anchor = cos > 0.28 ? "start" : cos < -0.28 ? "end" : "middle";
        // The top and bottom labels sit on the axis, so they need the whole
        // two-line block nudged clear of the ring rather than just the baseline.
        const lift = Math.sin(label.angle) < -0.9 ? -12 : Math.sin(label.angle) > 0.9 ? 2 : -6;
        return (
          <g key={axis} className="star-chart-label" textAnchor={anchor}>
            <text x={label.x} y={label.y + lift} className="star-chart-axis-name">{axis}</text>
            <text x={label.x} y={label.y + lift + 24} className="star-chart-axis-value">{values[index] ?? 0}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The card dossier.
 *
 * Rebuilt from scratch 5 September 2026 at the owner's request. The version it
 * replaces was four identical rounded rectangles of grey text with the card
 * floating in dead space beside them, and it had no title at all — the only
 * place the character's name appeared was inside the artwork.
 *
 * Two structural decisions carry the whole thing:
 *
 * 1. THE LAYOUT IS A RAIL AND A COLUMN, not a grid with per-variant overrides.
 *    The old one placed everything on one grid and then reshaped it with
 *    `display: contents`, explicit `grid-row`s, a `:last-child` span and — for
 *    relics, which have no radar — an ABSOLUTELY POSITIONED card. That last hack
 *    took the card out of flow, collapsed the column that was holding it, and
 *    let every relic profile print its Signature move underneath its own card
 *    art. Nothing in the layout said which cell anything belonged to, so the
 *    variant that had one fewer element simply fell through the floor. A rail
 *    holds the card and whatever sits under it; a column holds the prose. A
 *    relic just has a different thing in the rail.
 * 2. THE CAMP COLOUR DRIVES THE PANEL. It reached the radar and the quote bar
 *    and nothing else, so every profile in the game looked identical. It is now
 *    the edge light, the header rule, the chips, the section bars and the radar,
 *    which is what makes a Tech card feel unlike a Magic one.
 *
 * The header is new and is built out of data that was already sitting in
 * `lore.ts` unread: `epithet` ("Baba Yaga", "Clown Prince of Crime") and `rank`
 * ("C-tier · #25 in Willpower"). Relics carry both too — their rank reads
 * "Arthurian legend · Sacred vessel" — so the rail has something real to hold
 * where a relic's radar would have been.
 */
export function GalleryDetailModal({
  entry,
  locked,
  onClose,
  onNavigate,
}: {
  entry: GalleryEntry;
  locked: boolean;
  onClose: () => void;
  onNavigate: (direction: number) => void;
}) {
  const profile = locked ? null : loreFor(entry.card);
  const accent = campAccent(entry.face.camp);
  const isRelic = isRelicCard(entry.card);
  const {panel, fit} = useProfileFit(entry.key);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if(document.querySelector('.cf-kw-pop,.equipped-relic-peek[aria-label^="Token card:"]'))return;
        event.stopPropagation();
        onClose();
      } else if (!locked && event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(-1);
      } else if (!locked && event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [locked, onClose, onNavigate]);

  return (
    createPortal(<div className="gallery-detail-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="gallery-detail-fit" style={fit.width ? {width:fit.width*fit.scale,height:fit.height*fit.scale} : undefined}>
      <section
        ref={panel}
        className={`gallery-detail-panel ${isRelic ? "is-relic" : "is-minion"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.face.name} Star Chart`}
        style={{ "--accent": accent, zoom:fit.scale } as CSSProperties}
      >
        <button type="button" className="screen-x gallery-detail-close" onClick={onClose} aria-label="Close Star Chart">×</button>

        <header className="gdx-head">
          <div className="gdx-title">
            <h2>{entry.face.name}</h2>
            {profile?.epithet ? <p className="gdx-epithet">{profile.epithet}</p> : null}
          </div>
          <div className="gdx-chips">
            <span className="gdx-chip is-origin">{profile?.origin || entry.face.origin}</span>
            <span className="gdx-chip">{rarityName(entry.face.rarity)}</span>
            {isRelic ? null : <span className="gdx-chip is-camp">{entry.face.camp}</span>}
            {isRelic ? null : <span className="gdx-chip">{entry.face.alignment}</span>}
          </div>
        </header>

        <div className="gallery-detail-body">
          <div className="gdx-rail">
            <div className="gallery-detail-card">
              {/* Locked and unlocked cards draw the same complete face; the sealed
                  note below and the gallery seal are what mark a locked one. */}
              <CardFace card={entry.face} interactiveKeywords quiet />
            </div>
            {locked ? <p className="gallery-detail-sealed-note">Lore remains sealed until this card is unlocked.</p> : null}
            {!locked && profile?.rank ? <p className="gdx-rank">{profile.rank}</p> : null}
          </div>

          <div className="gdx-main">
            {locked ? (
              <div className="gallery-detail-locked">
                <span className="gallery-detail-kicker">The Rift is holding this profile</span>
                <h3>Unlock this card to read its Star Chart</h3>
                <p>The full card remains visible. Its lore profile stays sealed until the card is unlocked.</p>
              </div>
            ) : profile ? (
              <>
                <div className="gdx-top">
                  <div className="gallery-detail-lore">
                    <p>{profile.lore}</p>
                    {profile.quote ? <blockquote>“{profile.quote}”</blockquote> : null}
                  </div>
                  {isRelic ? null : (
                    <div className="gdx-scope">
                      <StarChart values={profile.vals} accent={accent} name={entry.face.name} />
                      <span className="gallery-detail-chart-caption">Lore attributes · 0 to 10</span>
                    </div>
                  )}
                </div>

                <div className="gdx-grid">
                  <DetailList title="Strengths" tone="strength" items={profile.str} />
                  <DetailList title="Weaknesses" tone="weakness" items={profile.wk} />
                  <DetailBox title="Signature move" tone="signature">
                    {profile.sig_name ? <strong>{profile.sig_name}</strong> : null}
                    <span>{profile.sig_desc || "No signature move recorded."}</span>
                  </DetailBox>
                  <section className="gallery-detail-box gallery-detail-relationships is-bonds">
                    <h3>Relationships</h3>
                    <div className="gallery-detail-box-copy">
                      {profile.rivals.length ? profile.rivals.map((rival) => (
                        <span key={`${rival.who}-${rival.rel}`} className={rival.id ? "detail-rival linked" : "detail-rival"}>
                          <b>{rival.who}</b>{rival.rel ? <> <i>{rival.rel}</i></> : null}
                        </span>
                      )) : <span className="detail-rival">No recorded relationship</span>}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="gallery-detail-locked">
                <span className="gallery-detail-kicker">Card profile</span>
                <h3>This card has no Star Chart entry yet</h3>
                <p>The current card rules remain authoritative above. The lore page has not profiled this card.</p>
              </div>
            )}
          </div>
        </div>
      </section>
      </div>
    </div>,document.body)
  );
}

function DetailList({ title, tone, items }: { title: string; tone: "strength" | "weakness"; items: string[] }) {
  return (
    <section className={`gallery-detail-box ${tone}`}>
      <h3>{title}</h3>
      <ul>{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>Not recorded</li>}</ul>
    </section>
  );
}

function DetailBox({ title, tone, children }: { title: string; tone?: string; children: ReactNode }) {
  return (
    <section className={tone ? `gallery-detail-box is-${tone}` : "gallery-detail-box"}>
      <h3>{title}</h3>
      <div className="gallery-detail-box-copy">{children}</div>
    </section>
  );
}
