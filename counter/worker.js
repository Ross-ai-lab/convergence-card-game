import { DurableObject } from "cloudflare:workers";

const ALLOWED_ORIGIN = "https://ross-ai-lab.github.io";
const COUNTER_NAME = "convergence-players-live";

function responseHeaders(origin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });

  if (origin === ALLOWED_ORIGIN) {
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
      return origin === ALLOWED_ORIGIN
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
