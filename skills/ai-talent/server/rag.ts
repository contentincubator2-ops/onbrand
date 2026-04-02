/**
 * Azure AI Search RAG (Retrieval-Augmented Generation) Module
 *
 * Architecture:
 * 1. User uploads brand files → storagePut() → S3/Blob Storage
 * 2. Indexer triggered → Azure AI Search indexes the document
 * 3. On chat query → searchBrandKnowledge() retrieves relevant chunks
 * 4. Retrieved chunks injected into LLM system prompt
 * 5. LLM generates personalized response based on brand context
 *
 * Required Environment Variables:
 * - AZURE_SEARCH_ENDPOINT: https://<service>.search.windows.net
 * - AZURE_SEARCH_API_KEY: Admin or Query API key
 * - AZURE_SEARCH_INDEX_NAME: e.g., "brand-knowledge"
 */

import { invokeLLM } from "./_core/llm";
import { SearchIndexClient, AzureKeyCredential } from "@azure/search-documents";

const AZURE_SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT ?? "";
const AZURE_SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY ?? "";
const AZURE_SEARCH_INDEX_NAME = process.env.AZURE_SEARCH_INDEX_NAME ?? "brand-knowledge";

// ─── 懶初始化索引建立 ─────────────────────────────────────────────────────────
let _indexInitialized = false;

async function ensureIndexExists(): Promise<void> {
  if (_indexInitialized) return;
  const endpoint = AZURE_SEARCH_ENDPOINT;
  const apiKey = AZURE_SEARCH_API_KEY;
  const indexName = AZURE_SEARCH_INDEX_NAME;
  if (!endpoint || !apiKey) return;

  try {
    const client = new SearchIndexClient(endpoint, new AzureKeyCredential(apiKey));
    await client.createOrUpdateIndex({
      name: indexName,
      fields: [
        { name: "id", type: "Edm.String", key: true, searchable: false, filterable: true, hidden: false },
        { name: "content", type: "Edm.String", searchable: true, filterable: false, hidden: false, analyzerName: "zh-Hant.microsoft" as const },
        { name: "userId", type: "Edm.Int32", searchable: false, filterable: true, hidden: false },
        { name: "agentId", type: "Edm.Int32", searchable: false, filterable: true, hidden: false },
        { name: "brandId", type: "Edm.Int32", searchable: false, filterable: true, hidden: false },
        { name: "fileKey", type: "Edm.String", searchable: false, filterable: true, hidden: false },
        { name: "filename", type: "Edm.String", searchable: true, filterable: true, hidden: false },
        { name: "mimeType", type: "Edm.String", searchable: false, filterable: true, hidden: false },
        { name: "indexedAt", type: "Edm.DateTimeOffset", searchable: false, filterable: true, hidden: false, sortable: true },
      ],
    });
    _indexInitialized = true;
    console.log(`[RAG] Index '${indexName}' ensured successfully`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.warn(`[RAG] Index initialization deferred: ${e?.message}`);
  }
}

// 非阻塞式初始化
void ensureIndexExists();

const isAzureSearchConfigured = () =>
  Boolean(AZURE_SEARCH_ENDPOINT && AZURE_SEARCH_API_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandKnowledgeChunk {
  id: string;
  userId: number;
  agentId?: number;
  filename: string;
  content: string;
  score: number;
}

export interface IndexDocumentInput {
  userId: number;
  agentId?: number;
  brandId?: number;  // Which brand this document belongs to
  fileKey: string;
  filename: string;
  content: string;
  mimeType?: string;
}

// ─── Azure AI Search Client ───────────────────────────────────────────────────

/**
 * Search brand knowledge for a specific user (and optionally agent)
 * Returns top-k relevant chunks to inject into LLM context
 */
export async function searchBrandKnowledge(
  query: string,
  userId: number,
  agentId?: number,
  topK = 5,
  brandId?: number
): Promise<BrandKnowledgeChunk[]> {
  if (!isAzureSearchConfigured()) {
    console.warn("[RAG] Azure AI Search not configured, skipping retrieval");
    return [];
  }

  try {
    // Build filter: always filter by userId, optionally by brandId and/or agentId
    let filter = `userId eq ${userId}`;
    if (brandId != null) {
      filter += ` and brandId eq ${brandId}`;
    } else if (agentId) {
      filter += ` and agentId eq ${agentId}`;
    }

    const searchBody = {
      search: query,
      filter,
      top: topK,
      select: "id,userId,agentId,filename,content",
      // Use 'simple' queryType to avoid semanticConfiguration requirement
      // Semantic search requires explicit semantic configuration in Azure portal
      queryType: "simple",
    };

    const response = await fetch(
      `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX_NAME}/docs/search?api-version=2023-11-01`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_SEARCH_API_KEY,
        },
        body: JSON.stringify(searchBody),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[RAG] Azure Search error:", err);
      return [];
    }

    const data = await response.json() as { value: Array<{ id: string; userId: number; agentId?: number; filename: string; content: string; "@search.score": number }> };
    return (data.value ?? []).map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      agentId: doc.agentId,
      filename: doc.filename,
      content: doc.content,
      score: doc["@search.score"] ?? 0,
    }));
  } catch (err) {
    console.error("[RAG] Search failed:", err);
    return [];
  }
}

/**
 * Index a brand document into Azure AI Search
 * Called after file upload to make it searchable
 */
export async function indexBrandDocument(input: IndexDocumentInput): Promise<boolean> {
  if (!isAzureSearchConfigured()) {
    console.warn("[RAG] Azure AI Search not configured, skipping indexing");
    return false;
  }

  try {
    const docId = `${input.userId}-${input.fileKey.replace(/[^a-zA-Z0-9-_]/g, "-")}`;

    const indexBody = {
      value: [
        {
          "@search.action": "mergeOrUpload",
          id: docId,
          userId: input.userId,
          agentId: input.agentId ?? null,
          brandId: input.brandId ?? null,
          fileKey: input.fileKey,
          filename: input.filename,
          content: input.content,
          mimeType: input.mimeType ?? "text/plain",
          indexedAt: new Date().toISOString(),
        },
      ],
    };

    const response = await fetch(
      `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX_NAME}/docs/index?api-version=2023-11-01`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_SEARCH_API_KEY,
        },
        body: JSON.stringify(indexBody),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("[RAG] Index error:", err);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[RAG] Indexing failed:", err);
    return false;
  }
}

/**
 * Delete a brand document from the index
 * Called when user deletes a file
 */
export async function deleteBrandDocument(userId: number, fileKey: string): Promise<boolean> {
  if (!isAzureSearchConfigured()) return false;

  try {
    const docId = `${userId}-${fileKey.replace(/[^a-zA-Z0-9-_]/g, "-")}`;

    const deleteBody = {
      value: [{ "@search.action": "delete", id: docId }],
    };

    const response = await fetch(
      `${AZURE_SEARCH_ENDPOINT}/indexes/${AZURE_SEARCH_INDEX_NAME}/docs/index?api-version=2023-11-01`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_SEARCH_API_KEY,
        },
        body: JSON.stringify(deleteBody),
      }
    );

    return response.ok;
  } catch (err) {
    console.error("[RAG] Delete failed:", err);
    return false;
  }
}

// ─── RAG-Enhanced Chat ────────────────────────────────────────────────────────

/**
 * Build an enriched system prompt by injecting relevant brand knowledge
 * This is the core of the "越用越懂你" (learns more about you over time) feature
 */
export async function buildRAGSystemPrompt(
  baseSystemPrompt: string,
  userQuery: string,
  userId: number,
  agentId?: number
): Promise<string> {
  const chunks = await searchBrandKnowledge(userQuery, userId, agentId, 5);

  if (chunks.length === 0) {
    return baseSystemPrompt;
  }

  const brandContext = chunks
    .map((chunk, i) => `[品牌資料 ${i + 1}：${chunk.filename}]\n${chunk.content}`)
    .join("\n\n");

  return `${baseSystemPrompt}

---
## 用戶品牌知識庫（請根據以下資料提供個人化建議）

${brandContext}

---
請在回答時充分參考以上品牌資料，提供符合該品牌調性、目標受眾與業務需求的具體建議。`;
}

// ─── Strategy Agent Delegation ────────────────────────────────────────────────

export interface DelegationTask {
  targetAgentSlug: string;
  taskTitle: string;
  taskDescription: string;
  priority: "low" | "normal" | "high" | "urgent";
  estimatedDelivery: string;
}

/**
 * Strategy Agent (吳策略) analyzes a user request and delegates to execution agents
 * This implements the "策略層向執行層自動派工" feature
 */
export async function strategyAgentDelegate(
  userRequest: string,
  availableAgents: Array<{ slug: string; name: string; specialty: string; layer: string }>
): Promise<DelegationTask[]> {
  const executionAgents = availableAgents.filter((a) => a.layer === "execution");

  if (executionAgents.length === 0) return [];

  const agentList = executionAgents
    .map((a) => `- ${a.name} (${a.slug}): ${a.specialty}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `你是吳策略，一位資深行銷策略顧問。你的工作是分析用戶的行銷需求，並將任務分配給最適合的執行層 AI 員工。

可用的執行層 AI 員工：
${agentList}

請分析用戶需求，決定需要哪些 AI 員工協作，並為每個員工分配具體任務。`,
      },
      {
        role: "user",
        content: `用戶需求：${userRequest}\n\n請分析並決定如何派工。以 JSON 格式回傳派工計畫。`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "delegation_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  targetAgentSlug: { type: "string" },
                  taskTitle: { type: "string" },
                  taskDescription: { type: "string" },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                  estimatedDelivery: { type: "string" },
                },
                required: ["targetAgentSlug", "taskTitle", "taskDescription", "priority", "estimatedDelivery"],
                additionalProperties: false,
              },
            },
          },
          required: ["tasks"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}") as { tasks: DelegationTask[] };
    return parsed.tasks ?? [];
  } catch {
    return [];
  }
}
