// Reports how long Kimi's shared queue is right now (tiny request).
export default async function handler(req, res) {
  if (!process.env.CEREBRAS_API_KEY) return res.status(500).json({ error: "Server key not set" });
  try {
    const r = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.CEREBRAS_API_KEY },
      body: JSON.stringify({
        model: process.env.CEREBRAS_MODEL || "moonshotai-kimi-k3.1-pro-trial",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const d = await r.json();
    const q = d && d.time_info ? d.time_info.queue_time : null;
    res.status(r.ok ? 200 : r.status).json({ queue: typeof q === "number" ? q : null, status: r.status });
  } catch (e) {
    res.status(502).json({ error: "Upstream failed" });
  }
}
