// /api/health.js
export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, node: process.version });
}
