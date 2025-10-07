// /api/trends/rising.js
export const config = { runtime: 'nodejs' };

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

// Normalize links returned by google-trends-api (they are relative)
function normalizeRising(rising) {
  return (rising || []).map((x) => {
    const link =
      x?.link && x.link.startsWith('/')
        ? `https://trends.google.com${x.link}`
        : x?.link || null;
    return { ...x, link };
  });
}

async function getViaGoogleTrendsApi(keyword) {
  const mod = await import('google-trends-api');
  const trends = mod.default ?? mod;
  const raw = await trends.relatedQueries({ keyword, hl: 'en-US', timezone: 0 });
  const data = JSON.parse(raw); // will throw if Google returns HTML/captcha
  const rising = data?.default?.rankedList?.[1]?.rankedKeyword ?? [];
  return normalizeRising(rising);
}

export default async function handler(req, res) {
  // Rate limit
  if (rateLimit(req, res)) return;

  // Auth
  if (req.headers['x-api-key'] !== process.env.PRIVATE_API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Inputs
  const keyword = String(req.query.keyword ?? '').trim();
  if (!keyword) return res.status(400).json({ ok: false, error: 'Missing `keyword`' });
  if (keyword.length > 64) {
    return res.status(400).json({ ok: false, error: '`keyword` too long (max 64 chars)' });
  }

  try {
    const rising = await getViaGoogleTrendsApi(keyword);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, data: { keyword, rising, source: 'google-trends-api' } });
  } catch (primaryErr) {
    // No third-party fallback for now; return graceful 503
    return res.status(503).json({
      ok: false,
      error: 'Google Trends appears to be blocking this serverless request.',
      detail: String(primaryErr?.message ?? primaryErr),
      suggestion:
        'Use a third-party provider (e.g., RapidAPI/SerpApi) or proxy google-trends-api through a trusted IP.',
    });
  }
}
