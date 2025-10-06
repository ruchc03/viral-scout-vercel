// Force Node runtime on Vercel
export const config = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  if (req.headers['x-api-key'] !== process.env.PRIVATE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const keyword = String(req.query.keyword ?? '');
  if (!keyword) return res.status(400).json({ error: 'Missing `keyword`' });

  try {
    // google-trends-api is CJS; in ESM use dynamic import and grab .default if present
    const mod = await import('google-trends-api');
    const trends = mod.default ?? mod;

    const raw = await trends.relatedQueries({ keyword, hl: 'en-US', timezone: 0 });
    const data = JSON.parse(raw);
    const rising = data?.default?.rankedList?.[1]?.rankedKeyword ?? [];
    return res.status(200).json({ keyword, rising });
  } catch (err) {
    return res.status(502).json({
      error: 'Google Trends upstream error',
      detail: String(err?.message ?? err),
    });
  }
}
