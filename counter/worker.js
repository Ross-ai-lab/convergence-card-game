import { DurableObject } from "cloudflare:workers";

const ALLOWED_ORIGIN = "https://ross-ai-lab.github.io";
const COUNTER_NAME = "convergence-players-live";

/**
 * A dev server may READ the count, and may never WRITE it.
 *
 * Reading was blocked before, which meant every local run of the game filled the
 * browser console with CORS failures — noise that sits in front of whatever real
 * error a session is actually looking for, on every screenshot script and every
 * check that reads the console.
 *
 * Writing stays locked to the published origin, and that asymmetry is the whole
 * point rather than an oversight. The count is a real public number. If a local
 * dev server could increment it, every debugging session, every screenshot run
 * and every automated check would silently inflate the figure the landing page
 * shows the world, and nothing would ever reveal that the number had drifted.
 *
 * The port is deliberately unpinned: vite takes whatever port is free, and
 * shoot-card.mjs asks the OS for an arbitrary one, so pinning a port here would
 * put this straight back to failing on a run that picked a different number.
 */
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function mayRead(origin) {
  return origin === ALLOWED_ORIGIN || LOCAL_ORIGIN.test(origin ?? "");
}

function responseHeaders(origin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });

  if (mayRead(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
  }

  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return mayRead(origin)
        ? new Response(null, { status: 204, headers: responseHeaders(origin) })
        : json({ error: "Origin not allowed" }, 403, origin);
    }

    if (url.pathname !== "/count") {
      return json({ error: "Not found" }, 404, origin);
    }

    const counter = env.PLAYER_COUNTER.getByName(COUNTER_NAME);

    if (request.method === "GET") {
      return json({ count: await counter.getValue() }, 200, origin);
    }

    if (request.method === "POST") {
      if (origin !== ALLOWED_ORIGIN) {
        return json({ error: "Origin not allowed" }, 403, origin);
      }

      return json({ count: await counter.increment() }, 200, origin);
    }

    return json({ error: "Method not allowed" }, 405, origin);
  },
};

export class PlayerCounter extends DurableObject {
  async getValue() {
    return (await this.ctx.storage.get("value")) ?? 0;
  }

  async increment() {
    const nextValue = (await this.getValue()) + 1;
    await this.ctx.storage.put("value", nextValue);
    return nextValue;
  }
}
