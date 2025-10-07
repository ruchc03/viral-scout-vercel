# Viral Scout (Vercel)

Serverless APIs that power your custom GPT **Actions** and automation around viral content discovery.

## ✨ What’s inside

- **YouTube**
  - `/api/youtube/top_shorts` — existing endpoint for Shorts discovery (kept as-is for backward compatibility)
  - `/api/youtube/top_shorts_hardened` — optional, safer endpoint using **YouTube Data API v3** with input clamps, rate limiting, a consistent envelope, and CDN caching
- **Reddit (OAuth)**
  - `/api/reddit/search` — hot/top/new posts across one or more subreddits (reliable server-side access via OAuth)
- **Google Trends**
  - `/api/trends/rising` — rising related queries with graceful handling if Google blocks serverless IPs (no crash)
- **Utilities**
  - `/api/health` — sanity check for runtime
  - `/api/version` — deployment info (node version, commit, server time)

All protected with a shared header:  
`x-api-key: <PRIVATE_API_KEY>`

---

## 🚀 Deploy

1. **Import** this repo into [Vercel](https://vercel.com).
2. Add **Environment Variables** (Project → Settings → Environment Variables) — see the table below.
3. **Deploy**.
4. Hit `/api/health` and `/api/version` to confirm the deployment is live.

---

## 🔑 Environment variables

| Name                    | Required | Used by                                  | Notes                                                                                                           |
|-------------------------|:--------:|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `PRIVATE_API_KEY`       |   ✅     | All protected endpoints                   | Arbitrary strong secret. Must match the `x-api-key` header your clients send.                                  |
| `REDDIT_CLIENT_ID`      |   ✅     | `/api/reddit/search`                      | Create a **web app** at https://www.reddit.com/prefs/apps to get this.                                         |
| `REDDIT_CLIENT_SECRET`  |   ✅     | `/api/reddit/search`                      | From the same Reddit app. Rotate if leaked.                                                                     |
| `YOUTUBE_API_KEY`       |   ⭕️     | `/api/youtube/top_shorts_hardened`        | YouTube Data API v3. Optional; if missing, the hardened endpoint returns a friendly 503.                       |
| `SERPAPI_KEY`           |   ⭕️     | *(not used by default)*                   | Only needed if you later enable a SerpApi fallback in Trends.                                                  |

> The existing `/api/youtube/top_shorts` continues to work without `YOUTUBE_API_KEY`. The **hardened** endpoint is opt-in.

---

## 🧪 Quick verify (production)

**PowerShell**
```powershell
$base = "https://<your-vercel-domain>"
$hdr  = @{ "x-api-key" = "<PRIVATE_API_KEY>" }

# Health / Version
irm "$base/api/health"  | ConvertTo-Json -Depth 6
irm "$base/api/version" | ConvertTo-Json -Depth 6

# YouTube (existing)
irm "$base/api/youtube/top_shorts?q=football&max_results=3" -Headers $hdr | ConvertTo-Json -Depth 6

# YouTube (hardened; requires YOUTUBE_API_KEY)
irm "$base/api/youtube/top_shorts_hardened?q=football&max_results=3" -Headers $hdr | ConvertTo-Json -Depth 6

# Reddit (OAuth)
irm "$base/api/reddit/search?subreddits=soccer,shorts&sort=hot&limit=3" -Headers $hdr | ConvertTo-Json -Depth 6

# Trends
irm "$base/api/trends/rising?keyword=football" -Headers $hdr | ConvertTo-Json -Depth 6
```

**curl**
```bash
BASE="https://<your-vercel-domain>"
HDR="x-api-key: <PRIVATE_API_KEY>"

curl "$BASE/api/health"
curl "$BASE/api/version"
curl -H "$HDR" "$BASE/api/youtube/top_shorts?q=football&max_results=3"
curl -H "$HDR" "$BASE/api/youtube/top_shorts_hardened?q=football&max_results=3"
curl -H "$HDR" "$BASE/api/reddit/search?subreddits=soccer,shorts&sort=hot&limit=3"
curl -H "$HDR" "$BASE/api/trends/rising?keyword=football"
```

---

## 📡 Endpoints

### `GET /api/health`
Sanity check for runtime.

**Response**
```json
{ "ok": true, "node": "v22.x.x" }
```

---

### `GET /api/version`
Deployment metadata for debugging.

**Response**
```json
{ "ok": true, "node": "v22.x.x", "commit": "3c4c35d", "serverTime": "2025-10-06T17:03:00.000Z" }
```

---

### `GET /api/youtube/top_shorts` (existing)
**Headers:** `x-api-key: <PRIVATE_API_KEY>`  
**Query:** `q` (string), `max_results` (1..25 recommended)

**Response (legacy shape)**
```json
{ "items": [ { "videoId": "...", "title": "...", "viewCount": 123, "isShort": true, ... } ] }
```

> Kept as-is for backward compatibility. Use the **hardened** endpoint below for a consistent shape and input clamps.

---

### `GET /api/youtube/top_shorts_hardened`  *(optional)*
**Headers:** `x-api-key: <PRIVATE_API_KEY>`  
**Requires:** `YOUTUBE_API_KEY`  
**Query:** `q` (string), `max_results` (1..25; clamped on server)

**Response**
```json
{ "ok": true, "data": { "items": [ { "videoId": "...", "isShort": true, ... } ] } }
```

If `YOUTUBE_API_KEY` is missing:
```json
{ "ok": false, "error": "YOUTUBE_API_KEY not set", "detail": "..." }
```

---

### `GET /api/reddit/search`
**Headers:** `x-api-key: <PRIVATE_API_KEY>`  
**Requires:** `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`  
**Query:**  
- `subreddits` — comma-separated (max 10)  
- `sort` — `hot` \| `top` \| `new`  
- `limit` — 1..50 (clamped)

**Response**
```json
{
  "ok": true,
  "data": {
    "items": [
      { "subreddit": "soccer", "id": "xyz", "title": "...", "url": "...", "score": 123, ... }
    ]
  }
}
```

Per-subreddit failures are included inline:
```json
{ "subreddit": "someSub", "error": true, "detail": "..." }
```

---

### `GET /api/trends/rising`
**Headers:** `x-api-key: <PRIVATE_API_KEY>`  
**Query:** `keyword` (≤ 64 chars)

**Response (success)**
```json
{
  "ok": true,
  "data": {
    "keyword": "football",
    "rising": [
      { "query": "football today", "value": 1550, "formattedValue": "+1,550%", "link": "https://trends.google.com/..." }
    ],
    "source": "google-trends-api"
  }
}
```

**If Google blocks the serverless IP (graceful)**
```json
{
  "ok": false,
  "error": "Google Trends appears to be blocking this serverless request.",
  "detail": "Unexpected token '<' ...",
  "suggestion": "Use a third-party provider (RapidAPI/SerpApi) or proxy google-trends-api through a trusted IP."
}
```

---

## 🧰 Local development (optional)

```bash
npm i -g vercel
vercel dev
```

Then visit:
- `http://localhost:3000/api/health`
- `http://localhost:3000/api/version`
- `http://localhost:3000/api/youtube/top_shorts?q=football&max_results=5` (send `x-api-key`)
- `http://localhost:3000/api/reddit/search?subreddits=soccer&sort=hot&limit=5` (send `x-api-key`)
- `http://localhost:3000/api/trends/rising?keyword=football` (send `x-api-key`)

Set env vars for **Development** in Vercel or create a local `.env` and load it in `vercel dev` prompts.

---

## 🛡️ Security & Limits

- All protected routes require `x-api-key: <PRIVATE_API_KEY>`.
- Naive **per-IP rate limiting** (best effort) is baked into the hardened endpoints (and Reddit/Trends). Adjust as needed.
- Responses use **CDN caching** (`s-maxage=60, stale-while-revalidate=60`) where safe.

---

## ⚠️ Troubleshooting

- **401 Unauthorized**  
  Missing/incorrect `x-api-key` or wrong `PRIVATE_API_KEY` in Vercel.

- **Reddit 403 / HTML**  
  Use the **OAuth** version included here and ensure `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are set. Check function logs in Vercel → Deployments → **Functions**.

- **Trends “Unexpected token '<' …”**  
  That’s Google HTML/captcha. The route now returns a **503** with a helpful message instead of crashing. Add a fallback provider or proxy if you need total reliability.

- **YouTube hardened endpoint 503**  
  Set `YOUTUBE_API_KEY` or keep using `/api/youtube/top_shorts` until you’re ready.

---

## 🧩 GPT Actions (OpenAPI)

Import `openapi.yaml` (or `.json`) under **GPT → Configure → Actions → Add API → Import**.  
Point your GPT to your Vercel domain and include `x-api-key` in the Action headers.

---

## 📝 License

MIT — use freely, PRs welcome.
