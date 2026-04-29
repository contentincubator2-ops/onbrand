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
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [summary, setSummary] = React.useState<string>("");
  const [picked, setPicked] = React.useState<number | null>(null); // -1 = "都不是 / 新建"
  const [busy, setBusy] = React.useState(false);
  const [err, setErr]   = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep("input");
      setName(""); setWebsite(""); setFacebook(""); setDescription("");
      setCandidates([]); setSummary(""); setPicked(null);
      setErr(null); setBusy(false);
    }
  }, [open]);

  const utils = (trpc as any).useUtils?.() ?? null;
  const disambiguate  = (trpc as any).scope?.disambiguate?.useMutation?.() ?? null;
  const brandCreate   = (trpc as any).brand?.create?.useMutation?.()       ?? null;
  const productUpsert = (trpc as any).product?.upsert?.useMutation?.()     ?? null;
  const eventUpsert   = (trpc as any).event?.upsert?.useMutation?.()       ?? null;
  const savePos       = (trpc as any).scope?.savePositioning?.useMutation?.() ?? null;

  const onCheck = async () => {
    if (!kind || !name.trim()) { setErr("請輸入名稱"); return; }
    setErr(null);
    setStep("checking");

    const buildSelfCandidate = (): Candidate[] => {
      // If user gave us a website, synthesize a "self" candidate from
      // their input so they always have something concrete to confirm.
      const url = website.trim() || facebook.trim();
      if (!url && !description.trim()) return [];
      return [{
        name: name.trim(),
        url: url || "",
        description: description.trim() || "（你輸入的資料）",
        confidence: 100,
      }];
    };

    if (!disambiguate) {
      const self = buildSelfCandidate();
      setCandidates(self);
      setSummary(self.length
        ? "系統未連接 web_search — 以下是你輸入的資料。"
        : "系統未連接 web_search，將直接以你輸入的資料建立。");
      setPicked(self.length ? 0 : -1);
      setStep("confirm");
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
      // If gateway returned nothing but user provided URL/desc, fall
      // back to a self-candidate so 0-candidate UX has something to pick.
      const finalCands = cands.length > 0 ? cands : buildSelfCandidate();
      setCandidates(finalCands);
      setSummary(String(res?.summary ?? "") || (cands.length === 0
        ? "系統沒找到外部候選 — 你可以選下方「以你輸入的資料建立」直接進下一步。"
        : ""));
      // Auto-pick: top candidate if confident, else "都不是" so the
      // 建立 button is immediately enabled and user can proceed.
      if (finalCands.length > 0 && (finalCands[0]?.confidence ?? 0) >= 70) {
        setPicked(0);
      } else {
        setPicked(-1);
      }
      setStep("confirm");
    } catch (e: any) {
      // Gateway error — fall back to self-candidate so user isn't blocked
      const self = buildSelfCandidate();
      setCandidates(self);
      setSummary(`系統驗證失敗：${e?.message ?? String(e)}。可直接以你輸入的資料建立。`);
      setPicked(self.length ? 0 : -1);
      setStep("confirm");
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
        if (!brandId) throw new Error("產品需要綁定品牌，請先選一個品牌");
        const r: any = await productUpsert.mutateAsync({
          brandId, slug: slugify(name), name: chosen?.name?.trim() || name.trim(),
        });
        newId = Number(r?.id ?? 0);
      } else {
        if (!eventUpsert) throw new Error("event.upsert not available");
        const r: any = await eventUpsert.mutateAsync({
          brandId: brandId ?? null, slug: slugify(name),
          name: chosen?.name?.trim() || name.trim(),
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
                createdVia:  chosen ? "disambiguated" : "manual",
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
                  brandId={brandId}
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
                    isDisabled={!name.trim() || (kind === "product" && !brandId)}
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
  description, setDescription, brandId,
}: any) {
  return (
    <>
      <Input
        size="sm" radius="md" variant="bordered"
        label="名稱（必填）"
        labelPlacement="outside"
        placeholder={kind === "event" ? "例：618 大檔活動" : kind === "product" ? "例：00991A 復華未來50 ETF" : "例：成吉思汗健身俱樂部"}
        value={name}
        onValueChange={setName}
        autoFocus
      />
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
      {kind === "product" && !brandId && (
        <p className="text-tiny text-warning">提醒：建立產品需要綁定品牌，請先在 ScopeBar 選擇一個品牌。</p>
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

      <Card
        shadow="none"
        isPressable
        onPress={() => onPick(-1)}
        className={`border ${picked === -1 ? "border-primary bg-primary-50" : "border-divider hover:bg-default-50"} transition`}
      >
        <CardBody className="px-4 py-3 flex-row items-center gap-3">
          <span className={`flex items-center justify-center w-7 h-7 rounded-full border ${picked === -1 ? "border-primary text-primary" : "border-divider text-default-400"}`}>
            {picked === -1 && <FontAwesomeIcon icon={faCheck} className="text-tiny" />}
          </span>
          <div>
            <p className="text-small font-medium">都不是 — 直接建立新{kind === "brand" ? "品牌" : kind === "product" ? "產品" : "活動"}</p>
            <p className="text-tiny text-default-500">使用你剛才輸入的名稱、官網、描述為基礎</p>
          </div>
        </CardBody>
      </Card>
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
