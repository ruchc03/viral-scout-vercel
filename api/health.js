export const config = { runtime: 'nodejs18.x' };

export default function handler(req, res) {
  return res.status(200).json({ ok: true, node: process.version });
}
