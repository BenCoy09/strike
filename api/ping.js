// Reports Kimi's queue time. Gives up after 12s so the phone connection never idles.
export default async function handler(req, res) {
  if (!process.env.CEREBRAS_API_KEY) return res.status(500).json({ error: "Server key not set" });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.CEREBRAS_API_KEY },
      body: JSON.stringify({
        model: process.env.CEREBRAS_MODEL || "moonshotai-kimi-k3.1-pro-trial",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const d = await r.json();
    const q = d && d.time_info ? d.time_info.queue_time : null;
    res.status(200).json({ queue: typeof q === "number" ? q : null, status: r.status });
  } catch (e) {
    if (e && e.name === "AbortError") return res.status(200).json({ over: 12 });
    res.status(502).json({ error: "Upstream failed" });
  } finally {
    clearTimeout(timer);
  }
}
