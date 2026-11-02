/**
 * The Achievements page, its title-screen medal, and the toast that announces
 * an achievement the moment it is earned.
 */
import { Trophy } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, achievementById, type AchievementSave, type AchievementSnapshot } from "../achievements";
import { sfx } from "../audio/sfx";
import { Overlay } from "./Screens";
import "./Achievements.css";

export function AchievementsButton({ earned, total, unseen, onOpen }: { earned: number; total: number; unseen: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={unseen ? "achievements-button has-new" : "achievements-button"}
      aria-label={`Achievements: ${earned} of ${total}${unseen ? `, ${unseen} new` : ""}`}
      onClick={() => { sfx.play("button"); onOpen(); }}
    >
      <span className="achievements-medal" aria-hidden="true"><Trophy weight="fill" /></span>
      <span className="achievements-tally" aria-hidden="true">{earned}/{total}</span>
      {unseen ? <span className="achievements-new" aria-hidden="true">{unseen}</span> : null}
    </button>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Every achievement by category: earned ones lit with the day they were earned,
 * the rest dimmed, with a progress bar where the saves can measure the way there.
 * `fresh` marks the achievements earned since the page was last opened.
 */
export function AchievementsScreen({ save, snapshot, fresh, onClose }: {
  save: AchievementSave; snapshot: AchievementSnapshot; fresh: readonly string[]; onClose: () => void;
}) {
  const earnedCount = Object.keys(save.earned).length;
  return (
    <Overlay title="Achievements" onClose={onClose} wide>
      <div className="achievements-page">
        <p className="achievements-summary">
          <strong>{earnedCount}</strong> of {ACHIEVEMENTS.length} earned
          <span className="achievements-summary-bar" aria-hidden="true"><i style={{ width: `${(earnedCount / ACHIEVEMENTS.length) * 100}%` }} /></span>
        </p>
        {ACHIEVEMENT_CATEGORIES.map((category) => (
          <section key={category} className="achievements-group" aria-label={category}>
            <h3>{category}</h3>
            <ul>
              {ACHIEVEMENTS.filter((achievement) => achievement.category === category).map((achievement) => {
                const at = save.earned[achievement.id];
                const measured = at === undefined ? achievement.measure?.(snapshot) : undefined;
                const isNew = fresh.includes(achievement.id);
                return (
                  <li key={achievement.id} className={`achievement${at !== undefined ? " is-earned" : ""}${isNew ? " is-new" : ""}`} data-achievement={achievement.id}>
                    <span className="achievement-icon" aria-hidden="true"><Trophy weight={at !== undefined ? "fill" : "regular"} /></span>
                    <span className="achievement-copy">
                      <strong>{achievement.title}{isNew ? <em>New</em> : null}</strong>
                      <small>{achievement.description}</small>
                      {measured && measured.goal > 1 ? (
                        <span className="achievement-progress">
                          <span className="achievement-bar" aria-hidden="true"><i style={{ width: `${(measured.value / measured.goal) * 100}%` }} /></span>
                          <span>{measured.value} / {measured.goal}</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="achievement-state">{at !== undefined ? dateFormat.format(at) : "Locked"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Overlay>
  );
}

/** One achievement at a time, each for a few seconds, over whatever screen is showing. */
export function AchievementToast({ id, onDone }: { id: string; onDone: () => void }) {
  const achievement = achievementById(id);
  useEffect(() => {
    sfx.play("coin");
    const timer = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(timer);
  }, [id, onDone]);
  if (!achievement) return null;
  return (
    <aside className="achievement-toast" role="status" data-achievement-toast={id}>
      <span className="achievement-toast-icon" aria-hidden="true"><Trophy weight="fill" /></span>
      <span>
        <small>Achievement unlocked</small>
        <strong>{achievement.title}</strong>
        <span>{achievement.description}</span>
      </span>
    </aside>
  );
}
