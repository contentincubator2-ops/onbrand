/**
 * ChannelBriefForm — 網紅以外每個通路的任務說明單（FB／IG／Threads／LINE／TikTok／電子報／官網／異業合作）。
 *
 * 2026-10-02（CJ：照網紅說明單的設計做其他平台；LINE 要收每月可發則數；異業合作不跟網紅共用，
 * 「會因為異業合作對象的不同，而有不同的方案」）。
 *
 *   · 長相跟網紅那張一樣：上面一份清單（每一列＝企劃裡一個對象），下面幾組選填欄位。
 *   · 規格（欄位、提示、選項、平台規則）只寫在 server/strategy/core/campaignChannelBrief.ts，
 *     這裡讀 campaign.briefSpecs 照著長，不另抄一份。
 *   · 自有通路：核心訊息、受眾、期間「沿用活動」，只顯示不重填；平台規則系統帶入。
 *   · 異業合作：每一位先選對象類型，方案選項跟著類型變；下面多出名單上有的類型那一組。
 *     活動已有的訊息、目標、受眾、期間先填一版（跟網紅那張一樣，因為要交給對方）。
 */
import React from "react";
import { Button, Input, Textarea, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark, faSliders } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import type { CampaignPlan } from "../../lib/campaignSchema";

type Opt = { id: string; zh: string; en: string };
type Field = { key: string; zh: string; en: string; ph: string; long?: boolean; options?: Opt[]; optionsBy?: { field: string; map: Record<string, Opt[]> } };
type Rule = { zh: string; en: string };
type Group = { zh: string; en: string; fields: Field[]; whenType?: string; rules?: Rule[] };
export type ChannelBriefSpec = {
  channel: string; zh: string; en: string; introZh: string; introEn: string; audience: "internal" | "external";
  rows: { zh: string; en: string; hintZh: string; hintEn: string; fields: Field[]; max: number; addZh: string; addEn: string };
  groups: Group[]; rules: Rule[];
};
export type ChannelBrief = { rows?: Array<Record<string, string>>; values?: Record<string, string> };

/** 異業合作的說明單還是空的：用活動已經有的東西先填一版（要交給對方，跟網紅那張一樣）。 */
function prefillCobrand(b: ChannelBrief, p: Inherited): ChannelBrief {
  if (b.rows?.length || Object.keys(b.values ?? {}).length) return b;
  const md = (s: string) => s.slice(5).replace("-", "/");
  const values: Record<string, string> = {};
  if (p.smp) values.keyMessage = p.smp;
  if (p.goal) values.objective = p.goal;
  if (p.audience) values.audience = p.audience.slice(0, 300);
  if (p.startAt) values.timeline = `上線期間：${md(p.startAt)}${p.endAt ? ` – ${md(p.endAt)}` : ""}`;
  return { ...b, values };
}

type Inherited = { smp?: string | null; goal?: string | null; audience?: string | null; startAt?: string | null; endAt?: string | null };

export default function ChannelBriefForm({ eventId, spec, initial, inherited, inPlan, locked, en, onSaved, onOpenSetup }: {
  eventId: number;
  spec: ChannelBriefSpec;
  initial: ChannelBrief | null | undefined;
  inherited: Inherited;
  /** 這個通路已經在活動設定／企劃裡了嗎。 */
  inPlan: boolean;
  locked: boolean;
  en: boolean;
  onSaved: (r: { plan: CampaignPlan | null; replanned: boolean }) => void;
  onOpenSetup: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const external = spec.audience === "external";
  const [b, setB] = React.useState<ChannelBrief>(() => (external ? prefillCobrand(initial ?? {}, inherited) : (initial ?? {})));
  const [err, setErr] = React.useState("");
  const saveMut = (trpc as any).campaign.saveChannelBrief.useMutation({
    onSuccess: (r: any) => onSaved({ plan: r?.plan ?? null, replanned: !!r?.replanned }),
    onError: (e: any) => setErr(String(e?.message ?? "").slice(0, 200)),
  });

  const rows = b.rows?.length ? b.rows : [{}];
  const setCell = (i: number, f: Field, v: string) =>
    setB((prev) => {
      const list = [...(prev.rows?.length ? prev.rows : [{}])];
      const next = { ...list[i], [f.key]: v };
      // 換了對象類型，原本選的方案就不一定還在選項裡——清掉。
      for (const other of spec.rows.fields) if (other.optionsBy?.field === f.key) delete next[other.key];
      list[i] = next;
      return { ...prev, rows: list };
    });
  const removeRow = (i: number) => setB((prev) => ({ ...prev, rows: (prev.rows ?? []).filter((_, k) => k !== i) }));
  const setValue = (k: string, v: string) => setB((prev) => ({ ...prev, values: { ...(prev.values ?? {}), [k]: v } }));

  const types = new Set((b.rows ?? []).map((r) => r.partnerType).filter(Boolean));
  const groups = spec.groups.filter((g) => !g.whenType || types.has(g.whenType));
  const hasTypedGroups = spec.groups.some((g) => g.whenType);
  const rules = [...spec.rules, ...groups.flatMap((g) => g.rules ?? [])];
  const md = (s: string) => s.slice(5).replace("-", "/");
  const inheritedRows = external ? [] : ([
    [L("核心訊息", "Key message"), inherited.smp],
    [L("想達成", "Goal"), inherited.goal],
    [L("對象", "Audience"), inherited.audience?.slice(0, 80)],
    [L("期間", "Dates"), inherited.startAt ? `${md(inherited.startAt)}${inherited.endAt ? ` – ${md(inherited.endAt)}` : ""}` : ""],
  ] as Array<[string, string | null | undefined]>).filter(([, v]) => !!v);

  const renderField = (f: Field, value: string, onChange: (v: string) => void, row?: Record<string, string>) => {
    const label = en ? f.en : f.zh;
    const opts = f.options ?? (f.optionsBy && row ? f.optionsBy.map[row[f.optionsBy.field] ?? ""] : undefined);
    if (f.options || f.optionsBy) {
      return (
        <Select key={f.key} size="sm" variant="bordered" radius="md" label={label} labelPlacement="outside"
          placeholder={f.optionsBy && !opts ? L("先選類型", "Pick a type first") : L("請選擇", "Choose")}
          isDisabled={!opts?.length} selectedKeys={value ? [value] : []}
          onSelectionChange={(keys) => onChange(String(Array.from(keys as Set<string>)[0] ?? ""))}>
          {(opts ?? []).map((o) => <SelectItem key={o.id}>{en ? o.en : o.zh}</SelectItem>)}
        </Select>
      );
    }
    const props = { size: "sm" as const, variant: "bordered" as const, radius: "md" as const, label, labelPlacement: "outside" as const, placeholder: f.ph, value, onValueChange: onChange };
    return f.long ? <Textarea key={f.key} {...props} minRows={2} className="sm:col-span-2" /> : <Input key={f.key} {...props} />;
  };

  return (
    <div className="flex flex-col gap-5">
      {!inPlan && (
        <div className="flex items-center gap-3 rounded-lg border border-default-200 px-3 py-2">
          <p className="text-tiny text-default-600 mr-auto">{L(
            "這個通路還沒排進企劃。說明單先存著，到「調整設定」勾選它並重排，就會照這張排。",
            "This channel isn't in the plan yet. Save the brief, then add it in Settings and re-plan.")}</p>
          <Button size="sm" variant="bordered" radius="md" startContent={<FontAwesomeIcon icon={faSliders} />} onPress={onOpenSetup} isDisabled={locked}>
            {L("調整設定", "Settings")}
          </Button>
        </div>
      )}

      {inheritedRows.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="text-small font-bold">{L("沿用活動", "From the campaign")}<span className="text-tiny font-normal text-default-500 ml-2">{L("在活動裡改，這裡跟著變", "Edit on the campaign")}</span></p>
          <dl className="grid gap-x-4 gap-y-1 grid-cols-[auto_1fr] text-tiny">
            {inheritedRows.map(([k, v]) => (
              <React.Fragment key={k}><dt className="text-default-500">{k}</dt><dd className="text-default-700">{v}</dd></React.Fragment>
            ))}
          </dl>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div>
          <p className="text-small font-bold">{en ? spec.rows.en : spec.rows.zh}<span className="text-tiny font-normal text-default-500 ml-2">{L("選填", "Optional")}</span></p>
          <p className="text-tiny text-default-500">{en ? spec.rows.hintEn : spec.rows.hintZh}</p>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            {spec.rows.fields.map((f) => (
              <div key={f.key} className={f.key === "angle" ? "flex-[1.6] min-w-[200px]" : "flex-1 min-w-[130px]"}>
                {renderField(f, r[f.key] ?? "", (v) => setCell(i, f, v), r)}
              </div>
            ))}
            <Button size="sm" isIconOnly variant="light" radius="md" aria-label={L("移除這一列", "Remove")} onPress={() => removeRow(i)}
              isDisabled={rows.length === 1 && !Object.values(r).some(Boolean)}>
              <FontAwesomeIcon icon={faXmark} />
            </Button>
          </div>
        ))}
        {rows.length < spec.rows.max && (
          <Button size="sm" variant="light" radius="md" className="self-start" startContent={<FontAwesomeIcon icon={faPlus} />}
            onPress={() => setB((prev) => ({ ...prev, rows: [...(prev.rows?.length ? prev.rows : [{}]), {}] }))}>
            {en ? spec.rows.addEn : spec.rows.addZh}
          </Button>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.zh} className="flex flex-col gap-2">
          <p className="text-small font-bold">{en ? g.en : g.zh}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.fields.map((f) => renderField(f, b.values?.[f.key] ?? "", (v) => setValue(f.key, v)))}
          </div>
        </section>
      ))}
      {hasTypedGroups && types.size === 0 && (
        <p className="text-tiny text-default-500">{L("選了對象類型，這裡會多出那一類要談的事（例：通路店家談陳列與供貨、媒體談版位與審稿權）。", "Pick a partner type to see what to agree on for that type.")}</p>
      )}

      {rules.length > 0 && (
        <section className="flex flex-col gap-1">
          <p className="text-small font-bold">{L("平台規則", "Platform rules")}<span className="text-tiny font-normal text-default-500 ml-2">{L("系統帶入，寫手一定會照做", "Always applied")}</span></p>
          <ul className="list-disc pl-5 text-tiny text-default-600 flex flex-col gap-0.5">
            {rules.map((r) => <li key={r.zh}>{en ? r.en : r.zh}</li>)}
          </ul>
        </section>
      )}

      {err && <p className="text-tiny text-danger">{err}</p>}
      <div className="flex items-center gap-3 justify-end">
        <p className="text-tiny text-default-500 mr-auto">{external
          ? L("存了之後，企劃裡這條線會照名單重排（已經寫好的不動）。", "Saving re-plans this lane (written items stay).")
          : L("寫這個通路的每一篇都會讀這張；下次重排企劃時照清單排。", "Writers read this for every post; the next re-plan follows the list.")}</p>
        <Button size="sm" color="primary" radius="md" isLoading={saveMut.isPending} isDisabled={locked}
          onPress={() => { setErr(""); saveMut.mutate({ eventId, channel: spec.channel, brief: b }); }}>
          {L("儲存說明單", "Save brief")}
        </Button>
      </div>
    </div>
  );
}
