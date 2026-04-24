export type DeckZone = "detect" | "decide" | "make" | "review";

export interface MethodologyDef {
  slug: string;
  name: string;
  nameEn: string;
  author: string;
  year?: number;
  layer: "L1" | "L2" | "L3";
  summary: string;
  summaryEn: string;
  situations: string[];
  stages: string[];
  fields: { key: string; label: string; labelEn: string; type: "text" | "textarea" | "list" }[];
}

export interface StrategyCardRow {
  id: number;
  brandId: number;
  methodologySlug: string;
  methodologyName: string;
  methodologyAuthor: string | null;
  layer: string | null;
  name: string;
  status: "draft" | "active" | "archived";
  summary: string | null;
  config: any;
  activatedAt: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
