# Market Intelligence Skill

**Version:** 2.0.0 (Sprint 2)

## Overview

The Market Intelligence skill queries `sowork_db.market_data` (93,000+ entries, updated daily) to surface real-time competitor news, trending topics, and social trends relevant to any brand task. It also provides access to `creative_cases` for campaign inspiration.

## Architecture

```
skills/market-intel/
├── SKILL.md                  ← this file
└── server/
    └── marketIntel.ts        ← core service (3 exported functions)
```

The service reuses the `getSoworkDb()` connection from `skills/ai-talent/server/db.ts` — no additional DB config needed.

## Exported Functions

### `fetchMarketIntel(opts)`

Queries `sowork_db.market_data` for entries matching keywords.

**Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `keywords` | `string[]` | required | Search terms (capped at 5 for perf) |
| `types` | `('competitor_news' \| 'trending_topic' \| 'social_trend')[]` | `['competitor_news','trending_topic']` | Data types to include |
| `days` | `number` | `7` | Look-back window |
| `limit` | `number` | `10` | Max results |

**Returns:** `MarketIntelResult[]`

```typescript
interface MarketIntelResult {
  type: 'competitor_news' | 'trending_topic' | 'social_trend';
  title: string;
  content: string;       // truncated to 500 chars
  source: string;
  publishedAt: string;   // ISO 8601
  relevanceScore: number;
}
```

### `formatMarketIntelForPrompt(results)`

Formats `MarketIntelResult[]` into a structured Markdown block ready for LLM injection. Groups results by type with Chinese section headers.

**Returns:** `string` — empty string if no results.

### `getCreativeCases(opts)`

Fetches random creative campaign cases from `sowork_db.creative_cases`.

**Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `industry` | `string` | optional | Filter by industry |
| `limit` | `number` | `5` | Max cases to return |

## Usage in executeTask.ts (Sprint 2+)

Market intel is automatically injected into every task execution via `executeTask.ts`:

```typescript
// 2g. Market Intelligence: Inject real-time data from sowork_db.market_data
let marketIntelContext = "";
try {
  const { fetchMarketIntel, formatMarketIntelForPrompt } = await import("../../../market-intel/server/marketIntel");
  const keywords = [task.title, ...(task.description?.split(' ').slice(0, 3) ?? [])].filter(Boolean);
  const intel = await fetchMarketIntel({ keywords, limit: 5 });
  marketIntelContext = formatMarketIntelForPrompt(intel);
} catch {
  // market intel is optional — never blocks task execution
}
```

## Data Sources

`sowork_db.market_data` schema (key columns):

| Column | Description |
|---|---|
| `dataType` | `competitor_news` / `trending_topic` / `social_trend` |
| `title` | Headline / topic title |
| `content` | Full content body |
| `source` | Source name |
| `sourceUrl` | Original URL |
| `publishedAt` | Publication timestamp |
| `expiresAt` | Auto-expiry (NULL = never expires) |
| `relevanceScore` | 0-100 editorial relevance score |

## Error Handling

All DB calls are wrapped in try/catch. Failures are silently swallowed — market intel is **optional context** and must never block task execution.

## Performance Notes

- Keywords are capped at 5 per query
- Content is truncated to 500 chars before LLM injection
- Connection is shared via `getSoworkDb()` singleton (pool size: 5)
