// Cloud sync for the Memory tab, backed by the Supabase table public.desk_memory.
// Env vars (Vercel → Settings → Environment Variables):
//   SUPABASE_URL               e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  server-only key; RLS blocks every other role
//   DESK_MEMORY_KEY            passcode you type once in the Memory tab
// GET  /api/memory  -> { data, updated_at }
// PUT  /api/memory  body { data } -> { updated_at }
// Add ?doc=content for the saved posts, weekly plans and resume reviews,
// stored as a second row (id "content") in the same table.

const ROWS = { memory: "default", content: "content" };

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DESK_MEMORY_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DESK_MEMORY_KEY) {
    res.status(500).json({ error: "Cloud memory is not configured on the server." });
    return;
  }
  if (req.headers["x-desk-key"] !== DESK_MEMORY_KEY) {
    res.status(401).json({ error: "Wrong passcode." });
    return;
  }

  const doc = (req.query && req.query.doc) || new URL(req.url, "http://x").searchParams.get("doc") || "memory";
  const ROW_ID = ROWS[doc];
  if (!ROW_ID) {
    res.status(400).json({ error: "Unknown doc." });
    return;
  }

  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/desk_memory`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${base}?id=eq.${ROW_ID}&select=data,updated_at`, { headers });
      const rows = await r.json();
      if (!r.ok) throw new Error(rows.message || `Supabase error ${r.status}`);
      res.status(200).json(rows[0] || { data: null, updated_at: null });
      return;
    }
    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const data = body.data;
      const valid = doc === "content"
        ? data && typeof data === "object" && ["savedPosts", "savedWeeks", "savedReviews"].every((k) => Array.isArray(data[k]))
        : data && typeof data === "object" && Array.isArray(data.notes) && typeof data.clients === "object";
      if (!valid) {
        res.status(400).json({ error: doc === "content" ? "Body must be { data: { savedPosts: [], savedWeeks: [], savedReviews: [] } }." : "Body must be { data: { notes: [], clients: {} } }." });
        return;
      }
      const updated_at = new Date().toISOString();
      const r = await fetch(base, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: ROW_ID, data, updated_at }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message || `Supabase error ${r.status}`);
      }
      res.status(200).json({ updated_at });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Unexpected error." });
  }
}
