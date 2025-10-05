import axios from "axios";
import { guard } from "../_lib/guard.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { subreddits, q = "", sort = "hot", limit = 25 } = req.query;
    if (!subreddits) return res.status(400).json({ error: "Missing subreddits" });

    const subs = subreddits.split(",").map(s => s.trim()).filter(Boolean);
    const results = [];

    for (const sub of subs) {
      // Use a mirror to avoid Reddit 403s from cloud/datacenter IPs.
      // r.jina.ai returns the raw content of the requested URL.
      const url = `https://r.jina.ai/http://www.reddit.com/r/${sub}/${sort}.json?limit=${Math.min(Number(limit),100)}&raw_json=1`;
      const r = await axios.get(url, { timeout: 15000, responseType: "text" });

      // Mirror returns text; parse to JSON
      const data = JSON.parse(r.data);
      const posts = (data?.data?.children || []).map(c => ({
        title: c.data?.title || "",
        url: `https://reddit.com${c.data?.permalink || ""}`,
        score: c.data?.score ?? 0,
        num_comments: c.data?.num_comments ?? 0,
        subreddit: c.data?.subreddit || sub,
        created_utc: c.data?.created_utc ?? 0
      }));

      results.push(...(q ? posts.filter(p => p.title.toLowerCase().includes(q.toLowerCase())) : posts));
    }

    res.json({ posts: results });
  } catch (e) {
    res.status(500).json({
      error: "Reddit upstream error",
      detail: e?.message || "unknown error"
    });
  }
}
