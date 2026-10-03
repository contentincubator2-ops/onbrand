// ── Shared embedding utilities ────────────────────────────────────────────────
// Used by: chatRoute.ts (semantic search) and missionResourceComputer.ts

export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? "";
    const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
    const deployment = process.env.AZURE_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small";
    const resp = await fetch(
      `${endpoint}/openai/deployments/${deployment}/embeddings?api-version=2024-02-01`,
      {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ input: text.slice(0, 2000) }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return data?.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}
