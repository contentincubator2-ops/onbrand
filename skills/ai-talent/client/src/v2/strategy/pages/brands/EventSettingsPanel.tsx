/**
 * 活動設定分頁。
 */
import { useLang } from "../../../../lib/i18n";
import { trpc } from "../../../../lib/trpc";
import React from "react";
import { Card, CardBody, Input, Select, SelectItem, CheckboxGroup, Checkbox, Button } from "@heroui/react";

/* ─────────────────────── Event Settings Panel ───────────────────────
 * CJ direction 2026-04-29: post-creation event editing — brand picker,
 * name, period, linked productIds (m:n via event_products). All metadata
 * that previously could only be set at create time. Lives as the
 * "settings" sub-nav entry under event scope.
 */
export function EventSettingsPanel({
  eventId, brands,
}: { eventId: number; brands: any[] }) {
  const { t, lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery({ id: eventId }, { refetchOnWindowFocus: false, enabled: eventId > 0 })
    : { data: null, isLoading: false };
  const event = eventQuery.data as any;

  const [name, setName] = React.useState("");
  const [brandId, setBrandId] = React.useState<number | null>(null);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt]     = React.useState("");
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Hydrate from server data once it arrives.
  React.useEffect(() => {
    if (!event) return;
    setName(event.name ?? "");
    setBrandId(event.brandId ?? null);
    const fmt = (d: any): string => {
      if (!d) return "";
      try {
        const s = String(d);
        return s.split("T")[0] ?? s;
      } catch { return ""; }
    };
    setStartAt(fmt(event.startAt));
    setEndAt(fmt(event.endAt));
    setProductIds(Array.isArray(event.productIds) ? event.productIds : []);
  }, [event]);

  // Candidate products from the picked brand (so user can re-link if
  // brand changes). Same query the create-modal uses.
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const candidateProducts: any[] = (productsQuery.data as any[]) ?? [];

  const upsert = (trpc as any).event?.upsert?.useMutation?.() ?? null;

  const onSave = async () => {
    if (!upsert) { setErr("event.upsert not available"); return; }
    if (!name.trim()) { setErr(lang === "en" ? "Name can't be empty" : "名稱不能為空"); return; }
    if (!brandId) { setErr(lang === "en" ? "Pick a brand to link" : "必須綁定品牌"); return; }
    setErr(null);
    try {
      await upsert.mutateAsync({
        id: eventId,
        brandId,
        slug: event?.slug ?? "",
        name: name.trim(),
        startAt: startAt || undefined,
        endAt: endAt || undefined,
        productIds, // replace full set per upsert contract
      });
      setSavedAt(new Date().toLocaleTimeString());
      utils?.event?.get?.invalidate?.();
      utils?.scope?.options?.invalidate?.();
      utils?.scope?.active?.invalidate?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  if (eventQuery.isLoading) {
    return <p className="text-small text-default-700">{t("loading")}</p>;
  }
  if (!event) {
    return (
      <Card shadow="none" className="border border-divider">
        <CardBody className="py-16 items-center text-center">
          <p className="text-medium font-medium">{lang === "en" ? "Campaign not found" : "找不到此活動"}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1">
          <p className="text-tiny text-default-700 uppercase tracking-wider">{lang === "en" ? "EVENT · Settings" : "EVENT · 設定"}</p>
          <h2 className="text-xl font-semibold tracking-tight">{event.name}</h2>
          <p className="text-small text-default-700">
            slug: <code className="text-tiny">{event.slug}</code>
          </p>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-5 gap-4">
          <Input
            label={lang === "en" ? "Campaign name (required)" : "活動名稱（必填）"}
            labelPlacement="outside"
            variant="bordered" size="sm" radius="md"
            value={name}
            onValueChange={setName}
            isRequired
          />
          <Select
            label={lang === "en" ? "Owning brand (required)" : "所屬品牌（必選）"}
            labelPlacement="outside"
            variant="bordered" size="sm" radius="md"
            selectedKeys={brandId ? new Set([String(brandId)]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0];
              setBrandId(k ? Number(k) : null);
            }}
            isRequired
          >
            {brands.map((b: any) => (
              <SelectItem key={String(b.id)}>{b.name}</SelectItem>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={lang === "en" ? "Start date" : "開始日期"} labelPlacement="outside"
              variant="bordered" size="sm" radius="md" type="date"
              value={startAt} onValueChange={setStartAt}
            />
            <Input
              label={lang === "en" ? "End date" : "結束日期"} labelPlacement="outside"
              variant="bordered" size="sm" radius="md" type="date"
              value={endAt} onValueChange={setEndAt}
            />
          </div>
          <div>
            <p className="text-small font-medium mb-1">{lang === "en" ? "Linked products (multi-select)" : "關聯產品（可多選）"}</p>
            <p className="text-tiny text-default-700 mb-2">
              {lang === "en"
                ? "0 = brand-level campaign; 2+ = cross-product campaign. The product list updates when you switch the linked brand."
                : "選 0 個 = 品牌層級活動；2+ 個 = 跨產品活動。改變綁定的品牌後產品清單會更新。"}
            </p>
            {candidateProducts.length === 0 ? (
              <p className="text-tiny text-default-700">{lang === "en" ? "This brand has no products yet." : "此品牌尚無產品。"}</p>
            ) : (
              <CheckboxGroup
                value={productIds.map(String)}
                onValueChange={(vals) => setProductIds((vals as string[]).map((v) => Number(v)))}
                classNames={{ wrapper: "gap-1.5" }}
              >
                {candidateProducts.map((p: any) => (
                  <Checkbox key={p.id} value={String(p.id)} size="sm">
                    <span className="text-small">{p.name}</span>
                  </Checkbox>
                ))}
              </CheckboxGroup>
            )}
          </div>
          {err && <p className="text-tiny text-danger">{err}</p>}
          <div className="flex items-center gap-3">
            <Button
              color="primary" size="sm"
              isLoading={upsert?.isPending ?? false}
              onPress={onSave}
            >
              {t("save")}
            </Button>
            {savedAt && <span className="text-tiny text-success">{lang === "en" ? `Saved · ${savedAt}` : `已儲存 · ${savedAt}`}</span>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
