import { relatedQueries } from "google-trends-api";
import { guard } from "../_lib/guard.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { keyword, geo = "US", timeframe = "now 7-d" } = req.query;
    if (!keyword) return res.status(400).json({ error: "Missing keyword" });

    const json = await relatedQueries({ keyword, geo, timeframe });
    const data = JSON.parse(json);
    const rising = data?.default?.rankedList?.find(x => x?.rankedKeyword)?.rankedKeyword || [];

    const related_queries = rising.map(item => ({
      query: item?.query || "",
      value: item?.value || 0
    }));

    res.json({ related_queries });
  } catch (e) {
    res.status(500).json({ error: "Trends upstream error", detail: e?.message || "unknown error" });
  }
}
