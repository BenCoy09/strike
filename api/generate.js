// Vercel serverless function: keeps the Cerebras key on the server.
// Env vars: CEREBRAS_API_KEY (required), CEREBRAS_MODEL, CEREBRAS_REASONING (optional)
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

  const msgs = (req.body && req.body.messages) || [];
  const user = String((msgs[msgs.length - 1] || {}).content || "").slice(0, 400);
  if (!user.trim()) return res.status(400).json({ error: "Empty idea" });

  // Open the stream right away and send keep-alives so mobile networks do not drop the wait.
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  res.write(": connected\n\n");
  const ka = setInterval(() => res.write(": waiting\n\n"), 5000);

  try {
    const upstream = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.CEREBRAS_API_KEY,
      },
      body: JSON.stringify({
        model: process.env.CEREBRAS_MODEL || "moonshotai-kimi-k3.1-pro-trial",
        stream: true,
        max_tokens: 3500,
        ...(process.env.CEREBRAS_REASONING ? { reasoning_effort: process.env.CEREBRAS_REASONING } : {}),
        messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
      }),
    });
    if (!upstream.ok) {
      res.write('data: {"error":"Cerebras returned ' + upstream.status + '"}\n\n');
    } else {
      for await (const chunk of upstream.body) res.write(chunk);
    }
  } catch (e) {
    res.write('data: {"error":"Connection to Cerebras failed"}\n\n');
  } finally {
    clearInterval(ka);
    res.end();
  }
}
