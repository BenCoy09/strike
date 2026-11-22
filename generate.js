// Vercel serverless function: keeps the Cerebras key on the server.
// Env vars: CEREBRAS_API_KEY (required); optional CEREBRAS_MODEL, CEREBRAS_REASONING (low|high|max, or off to omit),
// CEREBRAS_FALLBACK_MODEL, KIMI_MAX_WAIT_MS
const SYS = `You write launch kits. Reply in exactly three sections, each starting with its marker on its own line:
===THREAD===
An X thread of 6 short posts, numbered 1/ to 6/.
===REPLIES===
10 one-line reply hooks in different tones.
===PAGE===
One complete self-contained HTML landing page (inline CSS, no external assets, distinctive design, no markdown fences).`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.CEREBRAS_API_KEY) return res.status(500).json({ error: "Server key not set" });

  const body = req.body || {};
  const msgs = body.messages || [];
  const user = String((msgs[msgs.length - 1] || {}).content || "").slice(0, 400);
  if (!user.trim()) return res.status(400).json({ error: "Empty idea" });

  const strict = !!body.strict; // true = wait for Kimi only, never fall back
  const KIMI = process.env.CEREBRAS_MODEL || "moonshotai-kimi-k3.1-pro-trial";
  const FALLBACK = process.env.CEREBRAS_FALLBACK_MODEL || "gpt-oss-120b";
  const WAIT = strict ? Number(process.env.KIMI_STRICT_WAIT_MS || 240000) : Number(process.env.KIMI_MAX_WAIT_MS || 20000);

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  res.write(": connected\n\n");
  const ka = setInterval(() => res.write(": waiting\n\n"), 5000);

  // Streams one model to the client. Aborts if no first chunk arrives within `wait` ms.
  async function run(model, wait) {
    const ctl = new AbortController();
    let timer = wait ? setTimeout(() => ctl.abort(), wait) : null;
    try {
      const isKimi = model === KIMI;
      const up = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.CEREBRAS_API_KEY },
        body: JSON.stringify({
          model,
          stream: true,
          // Reasoning tokens count toward this limit, so leave real headroom.
          max_tokens: isKimi ? 8000 : 4000,
          ...(isKimi && process.env.CEREBRAS_REASONING !== "off" ? { reasoning_effort: process.env.CEREBRAS_REASONING || "low" } : {}),
          messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
        }),
      });
      if (!up.ok) throw new Error("status " + up.status);
      let first = true;
      for await (const chunk of up.body) {
        if (first) { first = false; if (timer) { clearTimeout(timer); timer = null; } }
        res.write(chunk);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  try {
    try {
      await run(KIMI, WAIT);
    } catch (e) {
      if (strict) throw e;
      res.write('data: {"notice":"Kimi was busy, so this run used ' + FALLBACK + '."}\n\n');
      await run(FALLBACK, 0);
    }
  } catch (e) {
    const code = e && /^status (\d+)$/.exec(e.message || "");
    const msg = e && e.name === "AbortError"
      ? "Kimi is too busy right now. Try again in a few minutes."
      : code
        ? "Cerebras returned " + code[1] + (code[1] === "429" ? " (too many requests, wait a minute)" : code[1] === "401" || code[1] === "403" ? " (key problem)" : "")
        : "Cerebras request failed";
    res.write('data: {"error":"' + msg + '"}\n\n');
  } finally {
    clearInterval(ka);
    res.end();
  }
}
