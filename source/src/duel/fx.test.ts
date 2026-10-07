import { expect, it } from "vitest";
import { budgetParticles, makeParticles, PARTICLE_BUDGET } from "./fx";

it("leaves an ordinary trade's particles untouched", () => {
  const bursts = [{ particles: makeParticles("hit") }, { particles: makeParticles("hit") }, { particles: makeParticles("death") }, { particles: makeParticles("death") }];
  const before = bursts.map((burst) => burst.particles);
  budgetParticles(bursts);
  expect(bursts.map((burst) => burst.particles)).toEqual(before);
});

it("thins a board-wide clear to the budget while every burst still reads", () => {
  const bursts = [
    ...Array.from({ length: 7 }, () => ({ particles: makeParticles("hit") })),
    ...Array.from({ length: 7 }, () => ({ particles: makeParticles("death") })),
    { particles: makeParticles("summon", "Magic") },
  ];
  budgetParticles(bursts);
  const total = bursts.reduce((sum, burst) => sum + burst.particles.length, 0);
  expect(total).toBeLessThanOrEqual(PARTICLE_BUDGET + bursts.length);
  for (const burst of bursts) {
    expect(burst.particles.length).toBeGreaterThanOrEqual(4);
    expect(new Set(burst.particles.map((particle) => particle.key)).size).toBe(burst.particles.length);
  }
});

it("samples a sigil ring evenly instead of keeping one arc of it", () => {
  const ring = { particles: makeParticles("summon", "Magic") };
  budgetParticles([ring, ...Array.from({ length: 12 }, () => ({ particles: makeParticles("death") }))]);
  const keys = ring.particles.map((particle) => particle.key);
  // Every key is a position on the 15-point ring; an even sample spans it.
  expect(Math.max(...keys)).toBeGreaterThanOrEqual(10);
});
