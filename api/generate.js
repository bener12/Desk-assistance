// Vercel serverless function that proxies requests to the Anthropic Messages API.
// The API key stays server-side (set ANTHROPIC_API_KEY in the Vercel project's
// Environment Variables) so it is never exposed to the browser, and this also
// avoids the CORS block on calling api.anthropic.com directly from a page.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is not configured: ANTHROPIC_API_KEY is missing." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { model, max_tokens, system, messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Request must include a non-empty 'messages' array." });
      return;
    }

    const payload = {
      model: model || "claude-sonnet-4-6",
      max_tokens: max_tokens || 1000,
      messages,
    };
    if (system) payload.system = system;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Unexpected error contacting the model." });
  }
}
