// /api/youtube/top_shorts_hardened.js
export const config = { runtime: 'nodejs' };

/**
 * Hardened YouTube Shorts search using YouTube Data API v3 (if YOUTUBE_API_KEY is set).
 * Query: ?q=football&max_results=5
 * Returns: { ok: true, data: { items: [...] } }
 */

// --- tiny, in-memory rate limiter (best-effort per-IP) ---
function rateLimit(req, res) {
  try {
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0] || 'unknown';
    const now = Date.now();
    globalThis.__rate = globalThis.__rate || new Map();
    const hits = (globalThis.__rate.get(ip) || []).filter((t) => now - t < 60_000);
    hits.push(now);
    globalThis.__rate.set(ip, hits);
    if (hits.length > 60) {
      res.status(429).json({ ok: false, error: 'Too many requests' });
      return true;
    }
  } catch {
    // ignore limiter failures
  }
  return false;
}

export default async function handler(req, res) {
  // Rate limit
  if (rateLimit(req, res)) return;

  // Require your shared API key header like the other routes
  if (req.headers['x-api-key'] !== process.env.PRIVATE_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY || '';
  const q = String(req.query.q ?? '').trim();
  const maxResults = Math.min(Math.max(Number(req.query.max_results ?? 10) || 10, 1), 25); // 1..25

  if (!q) return res.status(400).json({ ok: false, error: 'Missing `q`' });

  if (!apiKey) {
    // Non-breaking behavior: tell user how to enable this hardened endpoint
    return res.status(503).json({
      ok: false,
      error: 'YOUTUBE_API_KEY not set',
      detail:
        'Set YOUTUBE_API_KEY in Vercel to use /api/youtube/top_shorts_hardened. Until then, keep using /api/youtube/top_shorts.',
    });
  }

  try {
    // Search (shorts are usually <60s; filter via videoDuration=short and order=viewCount)
    const searchParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      type: 'video',
      q,
      maxResults: String(maxResults),
      videoDuration: 'short', //  under 4 minutes; we’ll re-check duration trimmer below
      order: 'viewCount',
      safeSearch: 'none',
    });

    const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`, {
      cache: 'no-store',
    });
    const searchText = await searchResp.text();
    if (!searchResp.ok) throw new Error(`YouTube search ${searchResp.status}: ${searchText.slice(0, 200)}`);

    const search = JSON.parse(searchText);
    const ids = (search.items || []).map((it) => it.id?.videoId).filter(Boolean);
    if (ids.length === 0) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
      return res.status(200).json({ ok: true, data: { items: [] } });
    }

    // Get stats + contentDetails to compute duration and publishedAt
    const videosParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet,contentDetails,statistics',
      id: ids.join(','),
    });

    const videosResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videosParams}`, {
      cache: 'no-store',
    });
    const videosText = await videosResp.text();
    if (!videosResp.ok) throw new Error(`YouTube videos ${videosResp.status}: ${videosText.slice(0, 200)}`);

    const videos = JSON.parse(videosText);

    // Helpers
    const parseISODurationToSeconds = (iso) => {
      // Basic PT#M#S parser
      const m = /^PT(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
      const mins = Number(m?.[1] || 0);
      const secs = Number(m?.[2] || 0);
      return mins * 60 + secs;
    };

    const items = (videos.items || [])
      .map((v) => {
        const id = v.id;
        const title = v.snippet?.title || '';
        const channelTitle = v.snippet?.channelTitle || '';
        const publishedAt = v.snippet?.publishedAt || null;
        const durationISO = v.contentDetails?.duration || 'PT0S';
        const durationSec = parseISODurationToSeconds(durationISO);
        const isShort = durationSec <= 60;
        const viewCount = Number(v.statistics?.viewCount || 0);
        const likeCount = Number(v.statistics?.likeCount || 0);
        return {
          videoId: id,
          title,
          channelTitle,
          url: `https://www.youtube.com/watch?v=${id}`,
          viewCount,
          likeCount,
          duration: durationISO,
          publishedAt,
          isShort,
        };
      })
      // Keep actual Shorts
      .filter((x) => x.isShort)
      // Order by views desc (search was already ordered, but re-assert)
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, maxResults);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, data: { items } });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: 'YouTube upstream error',
      detail: String(err?.message ?? err),
    });
  }
}
