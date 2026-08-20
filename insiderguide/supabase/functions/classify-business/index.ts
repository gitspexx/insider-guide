import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import centroids from "./centroids.json" with { type: "json" };

/**
 * Embedding-based business category classifier for Insider Guide.
 *
 * Replaces the "misc" fallback of the hand-maintained regex + 200-entry override
 * map (src/lib/classifier.js). Embeds name+category+description+location with
 * bge-small (HF Inference API) and picks the nearest of 8 precomputed category
 * centroids by cosine. Generalizes to new / multilingual (ES/PT/EN) names the
 * keyword rules miss. The regex/manual classifier stays authoritative; this is
 * the smart fallback + suggestion source for the admin Classifier screen.
 *
 * Request:  { name, category?, description?, location?, city? }  — or { businesses: [...] } for a batch
 * Response: { ok, result | results }  where each = { category|null, confidence, scores }
 * Env: HF_TOKEN.
 */

const HF_URL =
  "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5/pipeline/feature-extraction";
const CATS = Object.keys(centroids as Record<string, number[]>);
const MIN_CONFIDENCE = 0.62;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function l2norm(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}
function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function buildText(b: Record<string, unknown>): string {
  return [b.name, b.category, b.description, b.location, b.city]
    .filter(Boolean)
    .map(String)
    .join(" | ")
    .slice(0, 240);
}

async function embed(text: string): Promise<number[] | null> {
  const token = Deno.env.get("HF_TOKEN") || "";
  if (!token || !text) return null;
  try {
    const res = await fetch(HF_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
    return Array.isArray(vec) && vec.length === 384 ? (vec as number[]) : null;
  } catch {
    return null;
  }
}

function classifyVec(raw: number[]) {
  const v = l2norm(raw);
  const scored = CATS.map((c) => ({
    category: c,
    score: cosine(v, (centroids as Record<string, number[]>)[c]),
  })).sort((a, z) => z.score - a.score);
  const top = scored[0];
  return {
    category: top.score >= MIN_CONFIDENCE ? top.category : null,
    confidence: Math.round(top.score * 1000) / 1000,
    scores: Object.fromEntries(scored.map((s) => [s.category, Math.round(s.score * 1000) / 1000])),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const headers = { ...CORS, "Content-Type": "application/json" };
  try {
    const body = await req.json();
    const batch = Array.isArray(body.businesses);
    const items = (batch ? body.businesses : [body]) as Record<string, unknown>[];
    const results = [];
    for (const b of items) {
      const raw = await embed(buildText(b));
      results.push(raw ? classifyVec(raw) : { category: null, confidence: 0, scores: {} });
    }
    return new Response(
      JSON.stringify({ ok: true, ...(batch ? { results } : { result: results[0] }) }),
      { headers },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers });
  }
});
