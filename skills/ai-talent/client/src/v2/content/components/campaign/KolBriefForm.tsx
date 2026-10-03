/**
 * KolBriefForm — 網紅任務說明單。
 *
 * 2026-10-01（CJ「按下網紅以後，應該要叫用戶選填網紅的名單或類型，後續寫文章安排時程的
 * 時候，才能根據不同網紅設計不同角度…我想改成這個名字，而 brief 單裡面的內容，就要按照
 * brief 一個網紅經紀公司時，所需要填的內容說明」）。
 *
 *   · 上面是名單或類型（每一位：名字或帳號、類型、層級、平台、想請他講的角度），全部選填。
 *   · 下面四組是經紀公司收需求時要的：目標與成效／要說什麼／產出與時程／合作條款。
 *     （2026-10-01 CJ：預算拿掉——不放任何估算的價格。）
 *   · 存了之後，企劃裡網紅那條線照名單重排（每一位各一封邀約、一份 brief；已寫的不動），
 *     寫網紅那幾件時寫手讀得到整張說明單。欄位意義見 server/content/core/campaign/campaignKolBrief.ts。
 */
import React from "react";
import { Button, Input, Textarea, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import type { CampaignPlan } from "../../../strategy/lib/campaign/campaignSchema";
import { KOL_BRIEF_GROUPS, KOL_TIERS, prefillKolBrief, type KolBrief, type KolInfluencer } from "../../../strategy/lib/campaign/campaignKolBrief";

export default function KolBriefForm({ eventId, initial, prefill, locked, en, onSaved }: {
  eventId: number;
  initial: KolBrief | null | undefined;
  prefill: { smp?: string | null; goal?: string | null; audience?: string | null; startAt?: string | null; endAt?: string | null };
  locked: boolean;
  en: boolean;
  /** 存好了；企劃有重排就帶新的企劃。 */
  onSaved: (r: { plan: CampaignPlan | null; replanned: boolean }) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [b, setB] = React.useState<KolBrief>(() => prefillKolBrief({ brief: initial, ...prefill }));
  const [err, setErr] = React.useState("");
  const saveMut = (trpc as any).campaign.saveKolBrief.useMutation({
    onSuccess: (r: any) => onSaved({ plan: r?.plan ?? null, replanned: !!r?.replanned }),
    onError: (e: any) => setErr(String(e?.message ?? "").slice(0, 200)),
  });
  const people: KolInfluencer[] = b.influencers?.length ? b.influencers : [{}];
  const setPerson = (i: number, patch: Partial<KolInfluencer>) =>
    setB((prev) => {
      const list = [...(prev.influencers?.length ? prev.influencers : [{}])];
      list[i] = { ...list[i], ...patch };
      return { ...prev, influencers: list };
    });
  const removePerson = (i: number) =>
    setB((prev) => ({ ...prev, influencers: (prev.influencers ?? []).filter((_, k) => k !== i) }));

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div>
          <p className="text-small font-bold">{L("網紅名單或類型", "Influencers or types")}<span className="text-tiny font-normal text-default-500 ml-2">{L("選填", "Optional")}</span></p>
          <p className="text-tiny text-default-500">{L(
            "有指定人選就寫名字或帳號；還沒有就寫類型＋層級，經紀公司會照這個提名單。每一位在企劃裡都會有自己的邀約與 brief，角度照你寫的。",
            "Name specific creators or describe the type and tier. Each one gets their own invite and brief in the plan.")}</p>
        </div>
        {people.map((p, i) => (
          <div key={i} className="grid gap-2 items-end grid-cols-2 sm:grid-cols-[1.1fr_1fr_1fr_0.8fr_1.6fr_auto]">
            <Input size="sm" variant="bordered" radius="md" label={L("名字或帳號", "Name / handle")} labelPlacement="outside"
              placeholder={L("例：@xiaomei", "e.g. @handle")} value={p.name ?? ""} onValueChange={(v) => setPerson(i, { name: v })} />
            <Input size="sm" variant="bordered" radius="md" label={L("類型／領域", "Niche")} labelPlacement="outside"
              placeholder={L("例：美妝、親子", "e.g. beauty")} value={p.type ?? ""} onValueChange={(v) => setPerson(i, { type: v })} />
            <Select size="sm" variant="bordered" radius="md" label={L("層級", "Tier")} labelPlacement="outside" placeholder={L("不限", "Any")}
              selectedKeys={p.tier ? [p.tier] : []}
              onSelectionChange={(keys) => setPerson(i, { tier: (Array.from(keys as Set<string>)[0] ?? "") as any })}>
              {KOL_TIERS.map((t) => <SelectItem key={t.id}>{en ? t.en : t.zh}</SelectItem>)}
            </Select>
            <Input size="sm" variant="bordered" radius="md" label={L("平台", "Platform")} labelPlacement="outside"
              placeholder="IG／YT／TikTok" value={p.platform ?? ""} onValueChange={(v) => setPerson(i, { platform: v })} />
            <Input size="sm" variant="bordered" radius="md" label={L("想請他講的角度", "Angle for them")} labelPlacement="outside"
              placeholder={L("例：上班族一週的品牌貼文怎麼排", "e.g. a week of posts for a busy founder")}
              value={p.angle ?? ""} onValueChange={(v) => setPerson(i, { angle: v })} />
            <Button size="sm" isIconOnly variant="light" radius="md" aria-label={L("移除這一位", "Remove")} onPress={() => removePerson(i)}
              isDisabled={people.length === 1 && !p.name && !p.type}>
              <FontAwesomeIcon icon={faXmark} />
            </Button>
          </div>
        ))}
        {people.length < 8 && (
          <Button size="sm" variant="light" radius="md" className="self-start" startContent={<FontAwesomeIcon icon={faPlus} />}
            onPress={() => setB((prev) => ({ ...prev, influencers: [...(prev.influencers?.length ? prev.influencers : [{}]), {}] }))}>
            {L("再加一位", "Add another")}
          </Button>
        )}
      </section>

      {KOL_BRIEF_GROUPS.map((g) => (
        <section key={g.zh} className="flex flex-col gap-2">
          <p className="text-small font-bold">{en ? g.en : g.zh}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.fields.map((f) => {
              const props = {
                size: "sm" as const, variant: "bordered" as const, radius: "md" as const,
                label: en ? f.en : f.zh, labelPlacement: "outside" as const, placeholder: f.ph,
                value: b[f.key] ?? "", onValueChange: (v: string) => setB((prev) => ({ ...prev, [f.key]: v })),
              };
              return f.long
                ? <Textarea key={f.key} {...props} minRows={2} className="sm:col-span-2" />
                : <Input key={f.key} {...props} />;
            })}
          </div>
        </section>
      ))}

      {err && <p className="text-tiny text-danger">{err}</p>}
      <div className="flex items-center gap-3 justify-end">
        <p className="text-tiny text-default-500 mr-auto">{L("存了之後，企劃裡網紅那條線會照名單重排（已經寫好的不動）。", "Saving re-plans the influencer lane (written items stay).")}</p>
        <Button size="sm" color="primary" radius="md" isLoading={saveMut.isPending} isDisabled={locked}
          onPress={() => { setErr(""); saveMut.mutate({ eventId, brief: b }); }}>
          {L("儲存說明單", "Save brief")}
        </Button>
      </div>
    </div>
  );
}
