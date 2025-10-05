export function guard(req, res) {
  const API_KEY = process.env.PRIVATE_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: "Server misconfig: PRIVATE_API_KEY missing" });
    return false;
  }
  if (req.headers["x-api-key"] !== API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
