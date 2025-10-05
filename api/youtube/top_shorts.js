import axios from "axios";
import { guard } from "../_lib/guard.js";

function isShortISO8601(duration) {
  // Basic check: treat anything with minutes > 1 as not a Short.
  // Accept PTxxS and PT1MxxS as Shorts.
  // YouTube's ISO8601: PT#M#S or PT#S, etc.
  const m = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return false;
  const minutes = parseInt(m[1] || "0", 10);
  const seconds = parseInt(m[2] || "0", 10);
  const total = minutes * 60 + seconds;
  return total > 0 && total <= 60;
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { q, published_after, max_results = 20, regionCode = "US" } = req.query;
    if (!q) return res.status(400).json({ error: "Missing q" });

    // 1) search.list
    const search = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        key: process.env.YT_API_KEY,
        part: "snippet",
        q,
        type: "video",
        regionCode,
        maxResults: Math.min(Number(max_results), 50),
        publishedAfter: published_after || undefined,
        order: "viewCount"
      }
    });

    const ids = (search.data.items || []).map(i => i.id.videoId).filter(Boolean);
    if (!ids.length) return res.json({ items: [] });

    // 2) videos.list for stats + duration
    const videos = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
      params: {
        key: process.env.YT_API_KEY,
        part: "snippet,contentDetails,statistics",
        id: ids.join(",")
      }
    });

    const items = (videos.data.items || []).map(v => {
      const dur = v.contentDetails?.duration || "";
      const isShort = isShortISO8601(dur);
      return {
        videoId: v.id,
        title: v.snippet?.title || "",
        channelTitle: v.snippet?.channelTitle || "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        viewCount: Number(v.statistics?.viewCount || 0),
        likeCount: Number(v.statistics?.likeCount || 0),
        duration: dur,
        publishedAt: v.snippet?.publishedAt || "",
        isShort
      };
    }).filter(it => it.isShort);

    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: "YouTube upstream error", detail: e?.response?.data || (e && e.message) || 'unknown error' });
  }
}
