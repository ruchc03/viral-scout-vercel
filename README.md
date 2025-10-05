# Viral Scout (Vercel)

Serverless endpoints for your custom GPT **Actions**. Provides:
- `/api/youtube/top_shorts` — YouTube Data API v3 search + stats (Shorts heuristic)
- `/api/trends/rising` — Google Trends rising related queries (via `google-trends-api`)
- `/api/reddit/search` — Reddit public JSON for hot/top/new posts (unauthenticated)

## 1) Setup
1. Create a new project at https://vercel.com and import this folder.
2. In Vercel → Project → Settings → Environment Variables, add:
   - `PRIVATE_API_KEY` = a long random secret. The GPT will send this in the `x-api-key` header.
   - `YT_API_KEY` = your YouTube Data API v3 key.
3. Deploy.

## 2) Test locally (optional)
Vercel CLI:
```bash
npm i -g vercel
vercel dev
```
Then visit:
- `http://localhost:3000/api/youtube/top_shorts?q=football%20animations&max_results=10`
- `http://localhost:3000/api/reddit/search?subreddits=soccer,shorts&sort=hot&limit=10`
- `http://localhost:3000/api/trends/rising?keyword=football`

Remember to include header: `x-api-key: YOUR_PRIVATE_API_KEY`

## 3) OpenAPI for GPT Actions
Import `openapi.yaml` (or `openapi.json`) into your GPT (Configure → Actions → Add API → Import).

## 4) Notes
- **Shorts detection:** There is no official Shorts flag. We treat duration ≤ 60 seconds as Shorts.
- **Quota:** YouTube `videos.list` consumes quota. Keep `max_results` reasonable.
- **Security:** Keep third-party keys on Vercel only. The GPT uses `x-api-key` to call these endpoints.
- **Reddit:** Uses public JSON. For heavy use, consider authenticated API + caching.
