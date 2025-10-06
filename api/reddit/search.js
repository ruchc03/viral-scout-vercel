export const config = { runtime: 'nodejs' };

async function fetchSub(base, sub, sort, limit) {
  const url = `${base}/r/${encodeURIComponent(sub)}/${sort}.json?limit=${limit}&raw_json=1`;
  const r = await fetch(url, {
    headers: {
      'user-agent': 'viral-scout-vercel/1.0 (by u/ruchc03)',
      accept: 'application/json',
      'accept-language': 'en-US,en;q=0.8',
    },
    cache: 'no-store',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Reddit ${r.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Non-JSON: ${text.slice(0, 200)}`); }
}

async function getSubreddit(sub, sort, limit) {
  try { return await fetchSub('https://www.reddit.com', sub, sort, limit); }
  catch { return await fetchSub('https://old.reddit.com', sub, sort, limit); }
}

export default async function handler(req, res) {
  if (req.headers['x-api-key'] !== process.env.PRIVATE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subs = String(req.query.subreddits ?? 'all').split(',').map(s => s.trim()).filter(Boolean);
  const sort = String(req.query.sort ?? 'hot').toLowerCase(); // hot | top | new
  const limit = Math.min(Number(req.query.limit ?? 10) || 10, 50);

  try {
    const results = await Promise.allSettled(subs.map(s => getSubreddit(s, sort, limit)));
    const items = results.flatMap((p, i) => {
      const subreddit = subs[i];
      if (p.status !== 'fulfilled') {
        return [{ subreddit, error: true, detail: String(p.reason) }];
      }
      const children = p.value?.data?.children ?? [];
      return children.map(c => ({
        subreddit,
        id: c?.data?.id,
        title: c?.data?.title,
        url: `https://www.reddit.com${c?.data?.permalink ?? ''}`,
        score: c?.data?.score,
        numComments: c?.data?.num_comments,
        createdUtc: c?.data?.created_utc,
        thumbnail: c?.data?.thumbnail,
        isVideo: !!c?.data?.is_video,
      }));
    });
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(502).json({ error: 'Reddit upstream error', detail: String(err?.message ?? err) });
  }
}
