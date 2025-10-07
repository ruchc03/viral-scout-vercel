// /api/youtube/top_shorts_hardened.js
export const config = { runtime: 'nodejs' };

/**
 * Hardened YouTube Shorts search using YouTube Data API v3.
 * Query: ?q=football&max_results=8&min_views=50000&region=US&lang=en
 * Returns:
 * {
 *   ok: true,
 *   data: {
 *     q, region, lang, minViews, count,
 *     items: [{ videoId, title, channelTitle, url, viewCount, likeCount, duration, publishedAt, isShort }]
 *   }
 * }
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

// --- ISO8601 PT#M#S (lenient) -> seconds ---
function parseISODurationToSeconds(iso) {
  // Supports PT#H#M#S, PT#M#S, PT#S
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso || '');
  const h = Number(m?.[1] || 0);
  const min = Number(m?.[2] || 0);
  const sec = Number(m?.[3] || 0);
  return h * 3600 + min * 60 + sec;
}

export default async function handler(req, res) {
  // Rate limit
  if (rateLimit(req, res)) return;

  // Auth
  if (req.headers['x-api-key'] !== process.env.PRIVATE_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY || '';
  const q = String(req.query.q ?? '').trim();
  const maxResults = Math.min(Math.max(Number(req.query.max_results ?? 10) || 10, 1), 25); // 1..25
  const minViews = Math.max(Number(req.query.min_views ?? 10000) || 10000, 0);
  const region = String(req.query.region ?? 'US').trim();
  const lang = String(req.query.lang ?? 'en').trim();

  if (!q) return res.status(400).json({ ok: false, error: 'Missing `q`' });

  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: 'YOUTUBE_API_KEY not set',
      detail:
        'Set YOUTUBE_API_KEY in Vercel to use /api/youtube/top_shorts_hardened. Until then, keep using /api/youtube/top_shorts.',
    });
  }

  try {
    // Phase 1: Search likely Shorts
    const searchParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      type: 'video',
      q,
      maxResults: String(maxResults),
      videoDuration: 'short', // < 4 minutes (YouTube's definition) — we re-check below
      order: 'viewCount',
      safeSearch: 'strict',
      relevanceLanguage: lang,
      regionCode: region,
    });

    const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`, {
      cache: 'no-store',
    });
    const searchText = await searchResp.text();
    if (!searchResp.ok) throw new Error(`YouTube search ${searchResp.status}: ${searchText.slice(0, 300)}`);

    const search = JSON.parse(searchText);
    const ids = (search.items || []).map((it) => it.id?.videoId).filter(Boolean);

    if (ids.length === 0) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
      return res.status(200).json({ ok: true, data: { q, region, lang, minViews, count: 0, items: [] } });
    }

    // Phase 2: Hydrate with details
    const videosParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet,contentDetails,statistics',
      id: ids.join(','),
    });

    const videosResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videosParams}`, {
      cache: 'no-store',
    });
    const videosText = await videosResp.text();
    if (!videosResp.ok) throw new Error(`YouTube videos ${videosResp.status}: ${videosText.slice(0, 300)}`);

    const videos = JSON.parse(videosText);

    const items = (videos.items || [])
      .map((v) => {
        const id = v.id;
        const title = v.snippet?.title || '';
        const channelTitle = v.snippet?.channelTitle || '';
        const publishedAt = v.snippet?.publishedAt || null;
        const durationISO = v.contentDetails?.duration || 'PT0S';
        const durationSec = parseISODurationToSeconds(durationISO);

        // Shorts heuristic: allow small buffer (<=70s) and/or #shorts hints
        const tags = Array.isArray(v.snippet?.tags) ? v.snippet.tags : [];
        const desc = v.snippet?.description || '';
        const hasShortsHint =
          /#shorts/i.test(title) || /#shorts/i.test(desc) || tags.some((t) => /shorts?/i.test(String(t)));

        const isShort = durationSec > 0 && (durationSec <= 70 || hasShortsHint);

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
          durationSec,
        };
      })
      // Keep actual Shorts and apply min_views
      .filter((x) => x.isShort && x.viewCount >= minViews)
      // Order by views desc (assert)
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, maxResults)
      // Strip helper field before returning
      .map(({ durationSec, ...rest }) => rest);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
    return res.status(200).json({
      ok: true,
      data: {
        q,
        region,
        lang,
        minViews,
        count: items.length,
        items,
      },
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: 'YouTube upstream error',
      detail: String(err?.message ?? err),
    });
  }
}
