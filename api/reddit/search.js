import axios from "axios";
import { guard } from "../_lib/guard.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { subreddits, q = "", sort = "hot", limit = 25 } = req.query;
    if (!subreddits) return res.status(400).json({ error: "Missing subreddits" });

    const subs = subreddits.split(",").map(s => s.trim()).filter(Boolean);
    const headers = {
      "User-Agent": "ViralScout/1.0 (by u/yourusername)",
      "Accept": "application/json"
    };

    const results = [];
    for (const sub of subs) {
      // Use api.reddit.com (more tolerant) + raw_json=1
      const url = `https://api.reddit.com/r/${sub}/${sort}?limit=${Math.min(Number(limit), 100)}&raw_json=1`;
      const r = await axios.get(url, { headers, timeout: 10000 });

      const posts = (r.data?.data?.children || []).map(c => ({
        title: c.data?.title || "",
        url: `https://reddit.com${c.data?.permalink || ""}`,
        score: c.data?.score || 0,
        num_comments: c.data?.num_comments || 0,
        subreddit: c.data?.subreddit || sub,
        created_utc: c.data?.created_utc || 0
      }));

      results.push(...(q ? posts.filter(p => p.title.toLowerCase().includes(q.toLowerCase())) : posts));
    }

    res.json({ posts: results });
  } catch (e) {
    const status = e?.response?.status || 500;
    res.status(500).json({
      error: "Reddit upstream error",
      status,
      detail: e?.response?.data?.message || e.message
    });
  }
}
