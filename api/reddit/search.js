// /api/reddit/search.js
export const config = { runtime: 'nodejs' };

const USER_AGENT = 'viral-scout-vercel/1.0 (by u/SavingsHorse1910)';

// App-only OAuth: client_credentials grant
async function getToken() {
  const id = process.env.REDDIT_CLIENT_ID || '';
  const secret = process.env.REDDIT_CLIENT_SECRET || '';
  if (!id || !secret) throw new Error('Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET');

  const basic = Buffer.from(`${id}:${secret}`).toString('base64');

  const r = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'read',
    }),
    cache: 'no-store',
  });

  if (!r.ok) throw new Error(`OAuth ${r.status}: ${await r.text()}`);
  const { access_token } = await r.json();
  return access_token;
}

async function fetchSub(token, sub, sort, limit) {
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${sort}?limit=${limit}`;
  const r = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': USER_AGENT,
      accept: 'application/json',
    },
    cache: 'no-store',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Reddit ${r.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON: ${text.slice(0, 200)}`);
  }
}

export default async function handler(req, res) {
  if (req.headers['x-api-key'] !== process.env.PRIVATE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subs = String(req.query.subreddits ?? 'all')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const sort = String(req.query.sort ?? 'hot').toLowerCase(); // hot | top | new
  const limit = Math.min(Number(req.query.limit ?? 10) || 10, 50);

  try {
    const token = await getToken();
    const results = await Promise.allSettled(subs.map((s) => fetchSub(token, s, sort, limit)));

    const items = results.flatMap((p, i) => {
      const subreddit = subs[i];
      if (p.status !== 'fulfilled') {
        return [{ subreddit, error: true, detail: String(p.reason) }];
      }
      const children = p.value?.data?.children ?? [];
      return children.map((c) => ({
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
    return res
      .status(502)
      .json({ error: 'Reddit upstream error', detail: String(err?.message ?? err) });
  }
}
