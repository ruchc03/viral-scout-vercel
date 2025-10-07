// /api/version.js
export const config = { runtime: 'nodejs' };

/**
 * Returns deployment info useful for debugging: Node version, commit (if available),
 * and a server timestamp. Safe to expose.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Vercel exposes commit via env in Git integrations. If missing, fall back to short SHA envs or 'unknown'.
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.COMMIT_SHA ||
    'unknown';

  const payload = {
    ok: true,
    node: process.version,
    commit,
    serverTime: new Date().toISOString(),
  };

  return res.status(200).json(payload);
}
