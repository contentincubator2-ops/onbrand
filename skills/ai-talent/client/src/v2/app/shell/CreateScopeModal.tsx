/**
 * CreateScopeModal — multi-step create flow:
 *   1. Input — name (required) + website / facebook / description (optional)
 *   2. Disambiguate — calls scope.disambiguate (OpenClaw gateway with
 *      web_search) to surface up to 3 candidates so the user can confirm
 *      it's not a same-name different brand (e.g., sowork.tw vs sowork.com).
 *   3. Confirm — user picks a candidate (auto-fills metadata) or 「都不是
 *      新建品牌」 to skip with the entered data.
 *   4. Create — calls brand.create / product.upsert / event.upsert and
 *      stashes the metadata into positioning JSON.
 */
import React from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Textarea, Button, Chip, Card, CardBody, Progress, Spinner,
  CheckboxGroup, Checkbox, Select, SelectItem,
} from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrademark, faBox, faCalendarDay, faGlobe, faCheck, faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";

export type CreateScopeKind = "brand" | "product" | "event";

interface CreateScopeModalProps {
  kind: CreateScopeKind | null;
  brandId: number | null;
  onClose: () => void;
  onCreated: (kind: CreateScopeKind, id: number) => void;
}

const KIND_META = {
  brand:   { icon: faTrademark,  label: "品牌",    eyebrow: "BRAND" },
  product: { icon: faBox,        label: "產品",    eyebrow: "PRODUCT" },
  event:   { icon: faCalendarDay,label: "活動",    eyebrow: "EVENT" },
} as const;

interface Candidate {
  name: string;
  url: string;
  description: string;
  confidence: number;
}

type Step = "input" | "checking" | "confirm";

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\w一-鿿-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `untitled-${Date.now()}`;
}

export default function CreateScopeModal({ kind, brandId, onClose, onCreated }: CreateScopeModalProps) {
  const open = kind !== null;
  const meta = kind ? KIND_META[kind] : null;

  const [step, setStep] = React.useState<Step>("input");
  const [name, setName] = React.useState("");
  const [website, setWebsite]   = React.useState("");
  const [facebook, setFacebook] = React.useState("");
  const [description, setDescription] = React.useState("");
  // Per CJ direction 2026-04-29: in-modal brand selector for product/event
  // (defaults to ScopeBar's current brand) + event date pickers + event-side
  // optional product multi-select.
  const [pickedBrandId, setPickedBrandId] = React.useState<number | null>(brandId);
  const [eventStartAt, setEventStartAt] = React.useState<string>("");
  const [eventEndAt,   setEventEndAt]   = React.useState<string>("");
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [summary, setSummary] = React.useState<string>("");
  const [picked, setPicked] = React.useState<number | null>(null); // -1 = "都不是 / 新建"
  const [busy, setBusy] = React.useState(false);
  const [err, setErr]   = React.useState<string | null>(null);
  // Event-only: m:n product links. Defaults to empty (event scopes brand-wide).
  const [eventProductIds, setEventProductIds] = React.useState<number[]>([]);

  // Brand list for the in-modal brand selector (product / event creation).
  const brandsQuery = (trpc as any).brand?.listByMember?.useQuery
    ? (trpc as any).brand.listByMember.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const brandsList: any[] = (brandsQuery.data as any[]) ?? [];

  // Pull candidate products for the picked brand. CheckboxGroup displays
  // them so user can optionally link 1+ products to this event.
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: pickedBrandId ?? undefined },
        { enabled: kind === "event" && !!pickedBrandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const candidateProducts: any[] = (productsQuery.data as any[]) ?? [];

  React.useEffect(() => {
    if (open) {
      setStep("input");
      setName(""); setWebsite(""); setFacebook(""); setDescription("");
      setCandidates([]); setSummary(""); setPicked(null);
      setEventProductIds([]);
      setPickedBrandId(brandId);
      setEventStartAt(""); setEventEndAt("");
      setErr(null); setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const utils = (trpc as any).useUtils?.() ?? null;
  const disambiguate  = (trpc as any).scope?.disambiguate?.useMutation?.() ?? null;
  const brandCreate   = (trpc as any).brand?.create?.useMutation?.()       ?? null;
  const productUpsert = (trpc as any).product?.upsert?.useMutation?.()     ?? null;
  const eventUpsert   = (trpc as any).event?.upsert?.useMutation?.()       ?? null;
  const savePos       = (trpc as any).scope?.savePositioning?.useMutation?.() ?? null;

  const onCheck = async () => {
    if (!kind || !name.trim()) { setErr("請輸入名稱"); return; }
    if (!website.trim() && !facebook.trim() && !description.trim()) {
      setErr("請至少提供官網、Facebook 或描述其中一項，系統才能驗證");
      return;
    }
    setErr(null);
    setStep("checking");
    if (!disambiguate) {
      setErr("系統暫時無法驗證（gateway 未連接）");
      setStep("input");
      return;
    }
    try {
      const res: any = await disambiguate.mutateAsync({
        kind,
        name: name.trim(),
        website:  website.trim()  || undefined,
        facebook: facebook.trim() || undefined,
        description: description.trim() || undefined,
      });
      const cands = (res?.candidates as Candidate[]) ?? [];
      setCandidates(cands);
      setSummary(String(res?.summary ?? ""));
      // Auto-pick top candidate if confident; else null so 建立 button stays disabled
      // until user explicitly confirms — we don't want silent acceptance of unverified data.
      if (cands.length > 0 && (cands[0]?.confidence ?? 0) >= 80) {
        setPicked(0);
      } else {
        setPicked(null);
      }
      setStep("confirm");
    } catch (e: any) {
      setErr(`驗證失敗：${e?.message ?? String(e)}`);
      setStep("input");
    }
  };

  const onSubmit = async () => {
    if (!kind || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      // If user picked a candidate, fold its info into our payload.
      // picked === -1 → "都不是" / picked === null → defaults to "以輸入資料建立"
      const chosen = picked != null && picked >= 0 ? candidates[picked] : null;
      // For self-candidates (matching the user's own input), we don't
      // override the user's typed values with chosen.description/url.
      const isSelf = chosen?.confidence === 100 && chosen?.name === name.trim();
      const finalDescription = description.trim() || (isSelf ? "" : chosen?.description) || "";
      const finalWebsite     = website.trim()     || (isSelf ? "" : chosen?.url)         || "";

      let newId = 0;
      if (kind === "brand") {
        if (!brandCreate) throw new Error("brand.create not available");
        const r: any = await brandCreate.mutateAsync({
          name: chosen?.name?.trim() || name.trim(),
          website: finalWebsite || undefined,
        });
        newId = Number(r?.id ?? r?.brandId ?? r?.[0]?.insertId ?? 0);
      } else if (kind === "product") {
        if (!productUpsert) throw new Error("product.upsert not available");
        if (!pickedBrandId) throw new Error("產品需要綁定品牌，請先選擇");
        const r: any = await productUpsert.mutateAsync({
          brandId: pickedBrandId, slug: slugify(name),
          name: chosen?.name?.trim() || name.trim(),
        });
        newId = Number(r?.id ?? 0);
      } else {
        if (!eventUpsert) throw new Error("event.upsert not available");
        if (!pickedBrandId) throw new Error("活動需要綁定品牌，請先選擇");
        const r: any = await eventUpsert.mutateAsync({
          brandId: pickedBrandId, slug: slugify(name),
          name: chosen?.name?.trim() || name.trim(),
          productIds: eventProductIds.length > 0 ? eventProductIds : undefined,
          startAt: eventStartAt || undefined,
          endAt: eventEndAt || undefined,
        });
        newId = Number(r?.id ?? 0);
      }
      if (!newId) throw new Error("Failed to read new record id from response");

      // Persist metadata into positioning JSON so the wizard / forms have
      // initial context (saves an extra round trip later).
      if (savePos && (finalWebsite || facebook.trim() || finalDescription)) {
        try {
          await savePos.mutateAsync({
            kind, id: newId,
            positioning: {
              _meta: {
                website:     finalWebsite || undefined,
                facebook:    facebook.trim() || undefined,
                description: finalDescription || undefined,
                candidate:   chosen ?? undefined,
                verified:    !!chosen,             // false when user picked 都不是
                createdVia:  chosen ? "disambiguated" : "forced-unverified",
                createdAt:   new Date().toISOString(),
              },
            },
          });
        } catch { /* tolerate save failure — record exists */ }
      }

      utils?.scope?.options?.invalidate?.();
      utils?.brand?.listByMember?.invalidate?.();
      onCreated(kind, newId);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalContent>
        {meta && (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider self-start"
                startContent={<FontAwesomeIcon icon={meta.icon} className="text-tiny ml-1" />}>
                {meta.eyebrow}
              </Chip>
              <h2 className="text-medium font-semibold">新增{meta.label}</h2>
              <StepIndicator step={step} />
            </ModalHeader>
            <ModalBody className="gap-3">
              {step === "input" && (
                <InputStep
                  kind={kind!}
                  name={name} setName={setName}
                  website={website} setWebsite={setWebsite}
                  facebook={facebook} setFacebook={setFacebook}
                  description={description} setDescription={setDescription}
                  brandsList={brandsList}
                  pickedBrandId={pickedBrandId}
                  setPickedBrandId={setPickedBrandId}
                  candidateProducts={candidateProducts}
                  eventProductIds={eventProductIds}
                  setEventProductIds={setEventProductIds}
                  eventStartAt={eventStartAt} setEventStartAt={setEventStartAt}
                  eventEndAt={eventEndAt} setEventEndAt={setEventEndAt}
                />
              )}
              {step === "checking" && (
                <div className="flex flex-col items-center py-12 gap-3">
                  <Spinner size="lg" />
                  <p className="text-medium font-medium">正在驗證…</p>
                  <p className="text-small text-default-500 text-center max-w-[400px]">
                    系統正在使用 web_search 找出 「{name}」 的可能候選，
                    確認你選的是對的{meta.label}。
                  </p>
                </div>
              )}
              {step === "confirm" && (
                <ConfirmStep
                  kind={kind!}
                  name={name}
                  candidates={candidates}
                  summary={summary}
                  picked={picked}
                  onPick={setPicked}
                />
              )}
              {err && <p className="text-tiny text-danger">{err}</p>}
            </ModalBody>
            <ModalFooter>
              {step === "input" && (
                <>
                  <Button variant="light" onPress={onClose}>取消</Button>
                  <Button
                    color="primary"
                    isDisabled={
                      !name.trim()
                      || ((kind === "product" || kind === "event") && !pickedBrandId)
                    }
                    onPress={onCheck}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                  >
                    搜尋並驗證
                  </Button>
                </>
              )}
              {step === "checking" && (
                <Button variant="light" onPress={() => setStep("input")} isDisabled={busy}>
                  取消
                </Button>
              )}
              {step === "confirm" && (
                <>
                  <Button variant="light" onPress={() => setStep("input")}>← 上一步</Button>
                  <Button
                    color="primary"
                    isLoading={busy}
                    isDisabled={picked === null}
                    onPress={onSubmit}
                  >
                    建立{meta.label}
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const pct = step === "input" ? 33 : step === "checking" ? 66 : 100;
  return (
    <Progress
      size="sm"
      value={pct}
      color={step === "confirm" ? "success" : "primary"}
      className="mt-1"
      aria-label="進度"
    />
  );
}

function InputStep({
  kind, name, setName, website, setWebsite, facebook, setFacebook,
  description, setDescription,
  brandsList, pickedBrandId, setPickedBrandId,
  candidateProducts, eventProductIds, setEventProductIds,
  eventStartAt, setEventStartAt, eventEndAt, setEventEndAt,
}: any) {
  return (
    <>
      {/* In-modal brand selector for product / event creation. Defaults
          to ScopeBar's current brand but user can change here without
          backing out. Required for both product and event. */}
      {(kind === "product" || kind === "event") && (
        <Select
          size="sm" radius="md" variant="bordered"
          label="所屬品牌（必選）"
          labelPlacement="outside"
          placeholder={`選擇此${kind === "product" ? "產品" : "活動"}隸屬的品牌`}
          selectedKeys={pickedBrandId ? new Set([String(pickedBrandId)]) : new Set()}
          onSelectionChange={(keys) => {
            const k = Array.from(keys as Set<string>)[0];
            setPickedBrandId(k ? Number(k) : null);
          }}
          isRequired
        >
          {brandsList.map((b: any) => (
            <SelectItem key={String(b.id)}>{b.name}</SelectItem>
          ))}
        </Select>
      )}
      <Input
        size="sm" radius="md" variant="bordered"
        label="名稱（必填）"
        labelPlacement="outside"
        placeholder={kind === "event" ? "例：618 大檔活動" : kind === "product" ? "例：00991A 復華未來50 ETF" : "例：成吉思汗健身俱樂部"}
        value={name}
        onValueChange={setName}
        autoFocus
      />
      {kind === "event" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            size="sm" radius="md" variant="bordered" type="date"
            label="活動開始日期（選填）"
            labelPlacement="outside"
            value={eventStartAt}
            onValueChange={setEventStartAt}
          />
          <Input
            size="sm" radius="md" variant="bordered" type="date"
            label="活動結束日期（選填）"
            labelPlacement="outside"
            value={eventEndAt}
            onValueChange={setEventEndAt}
          />
        </div>
      )}
      {kind === "brand" && (
        <>
          <Input
            size="sm" radius="md" variant="bordered"
            label="官網"
            labelPlacement="outside"
            placeholder="https://example.com"
            startContent={<FontAwesomeIcon icon={faGlobe} className="text-tiny text-default-400" />}
            value={website}
            onValueChange={setWebsite}
          />
          <Input
            size="sm" radius="md" variant="bordered"
            label="Facebook 粉專"
            labelPlacement="outside"
            placeholder="https://facebook.com/yourbrand"
            startContent={<FontAwesomeIcon icon={faFacebook} className="text-tiny text-default-400" />}
            value={facebook}
            onValueChange={setFacebook}
          />
        </>
      )}
      <Textarea
        size="sm" radius="md" variant="bordered"
        label="補充描述"
        labelPlacement="outside"
        placeholder="任何能幫系統辨識這個品牌的資訊（產業、所在地、產品線…）"
        minRows={2}
        value={description}
        onValueChange={setDescription}
      />
      {kind === "event" && (
        <>
          {pickedBrandId && candidateProducts.length > 0 && (
            <Card shadow="none" className="border border-divider">
              <CardBody className="px-3 py-3 gap-2">
                <p className="text-tiny text-default-500 uppercase tracking-wider">關聯產品（可多選）</p>
                <p className="text-tiny text-default-500 leading-relaxed">
                  此活動是針對哪些產品？選 0 個 = 品牌層級活動；選 1 個 = 產品檔；選 2+ 個 = 跨產品活動（如 Pokemon Go 五月活動同打 GO Battle League + GO Fest）。
                </p>
                <CheckboxGroup
                  value={eventProductIds.map(String)}
                  onValueChange={(vals) => setEventProductIds(vals.map((v: string) => Number(v)))}
                  classNames={{ wrapper: "gap-1.5" }}
                >
                  {candidateProducts.map((p: any) => (
                    <Checkbox key={p.id} value={String(p.id)} size="sm">
                      <span className="text-small">{p.name}</span>
                    </Checkbox>
                  ))}
                </CheckboxGroup>
              </CardBody>
            </Card>
          )}
          {pickedBrandId && candidateProducts.length === 0 && (
            <p className="text-tiny text-default-500">此品牌尚無產品。活動會建立為「品牌層級」（不綁定特定產品）。</p>
          )}
        </>
      )}
      <p className="text-tiny text-default-500">
        提示：填寫官網 / FB 能幫系統更準確找對品牌，避免同名（如 sowork.tw vs sowork.com）。
      </p>
    </>
  );
}

function ConfirmStep({
  kind, name, candidates, summary, picked, onPick,
}: {
  kind: CreateScopeKind;
  name: string;
  candidates: Candidate[];
  summary: string;
  picked: number | null;
  onPick: (i: number | null) => void;
}) {
  return (
    <>
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-4 py-3">
          <p className="text-tiny text-default-500 uppercase tracking-wider">系統摘要</p>
          <p className="text-small text-default-700 leading-relaxed mt-1">{summary || "（無摘要）"}</p>
        </CardBody>
      </Card>

      {candidates.length > 0 ? (
        <>
          <p className="text-small text-default-500">請確認「{name}」是否為以下其中一個 — 或選擇下方「都不是」直接以你輸入的資料建立：</p>
          {candidates.map((c, i) => (
            <CandidateCard
              key={i} c={c} idx={i}
              selected={picked === i}
              onSelect={() => onPick(i)}
            />
          ))}
        </>
      ) : (
        <p className="text-small text-default-500">系統沒找到候選 — 可直接以你輸入的資料建立。</p>
      )}

      {candidates.length === 0 ? (
        <Card shadow="none" className="border-2 border-dashed border-warning-200 bg-warning-50">
          <CardBody className="px-4 py-4 gap-2">
            <p className="text-small font-medium text-warning-700">需要更多資訊才能驗證</p>
            <p className="text-tiny text-default-600 leading-relaxed">
              系統實際抓取你提供的 URL 後沒找到可信內容。請按「← 上一步」補上正確的官網 / Facebook / 描述，再驗證一次。
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card
          shadow="none"
          isPressable
          onPress={() => onPick(-1)}
          className={`border-2 border-dashed ${picked === -1 ? "border-warning bg-warning-50" : "border-divider hover:bg-default-50"} transition`}
        >
          <CardBody className="px-4 py-3 flex-row items-center gap-3">
            <span className={`flex items-center justify-center w-7 h-7 rounded-full border ${picked === -1 ? "border-warning text-warning" : "border-divider text-default-400"}`}>
              {picked === -1 && <FontAwesomeIcon icon={faCheck} className="text-tiny" />}
            </span>
            <div>
              <p className="text-small font-medium">都不是 — 強制以我輸入的名稱建立（未驗證）</p>
              <p className="text-tiny text-default-500">系統會在 _meta 標記 verified=false，未來資料品質可能受影響</p>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function CandidateCard({ c, idx, selected, onSelect }: { c: Candidate; idx: number; selected: boolean; onSelect: () => void }) {
  return (
    <Card
      shadow="none"
      isPressable
      onPress={onSelect}
      className={`border ${selected ? "border-primary bg-primary-50" : "border-divider hover:bg-default-50"} transition`}
    >
      <CardBody className="px-4 py-3 gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={`flex items-center justify-center w-7 h-7 rounded-full border ${selected ? "border-primary text-primary" : "border-divider text-default-400"}`}>
              {selected ? <FontAwesomeIcon icon={faCheck} className="text-tiny" /> : <span className="text-tiny font-medium">{idx + 1}</span>}
            </span>
            <p className="text-small font-medium">{c.name || "(無名稱)"}</p>
          </div>
          <Chip size="sm" variant="flat" color={c.confidence >= 70 ? "success" : c.confidence >= 40 ? "warning" : "default"}>
            匹配度 {c.confidence}%
          </Chip>
        </div>
        {c.url && (
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-tiny text-primary truncate" onClick={(e) => e.stopPropagation()}>
            {c.url}
          </a>
        )}
        {c.description && (
          <p className="text-tiny text-default-500 leading-relaxed">{c.description}</p>
        )}
      </CardBody>
    </Card>
  );
}
