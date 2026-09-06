/**
 * ConnectorEditor — the 連結 tile.
 *
 * Lets user enter the brand's external public URLs (官網 + 社群).
 * These are the source data feeding brandRealContent — every time
 * 自動填寫 / 測試 fires, it fetches summaries of these URLs to ground
 * the AI in real content (no more 五感十築 → 美妝 hallucination).
 *
 * CJ direction (2026-05-07):
 *   "我不知道我要去哪裡輸入官網和各種社群平台的連結，應該也是在
 *    品牌區嗎? 有一個連結器的 tile?"
 */
import { useEffect, useState } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { useSafeMutation } from "../../../lib/assertMutation";
import { Card, CardBody, Input, Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faYoutube, faLine, faThreads, faTiktok, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import { faGlobe, faSave, faCheck } from "@fortawesome/free-solid-svg-icons";

function getSocialFields(en: boolean): Array<{ key: string; label: string; icon: any; placeholder: string; tone: string }> {
  return [
    { key: "facebook",  label: en ? "Facebook Page" : "Facebook 粉專",  icon: faFacebook,  tone: "#1877F2", placeholder: "https://www.facebook.com/yourpage" },
    { key: "instagram", label: "Instagram",      icon: faInstagram, tone: "#E1306C", placeholder: "https://www.instagram.com/yourhandle" },
    { key: "youtube",   label: "YouTube",         icon: faYoutube,   tone: "#FF0000", placeholder: "https://www.youtube.com/@yourchannel" },
    { key: "threads",   label: "Threads",         icon: faThreads,   tone: "#000000", placeholder: "https://www.threads.net/@yourhandle" },
    { key: "tiktok",    label: "TikTok",          icon: faTiktok,    tone: "#000000", placeholder: "https://www.tiktok.com/@yourhandle" },
    { key: "linkedin",  label: "LinkedIn",        icon: faLinkedin,  tone: "#0A66C2", placeholder: "https://www.linkedin.com/company/yours" },
    { key: "line",      label: en ? "LINE Official"  : "LINE 官方帳號",   icon: faLine,      tone: "#06C755", placeholder: en ? "https://lin.ee/xxxxx or @yourLineId" : "https://lin.ee/xxxxx 或 @yourLineId" },
  ];
}

export default function ConnectorEditor({ brandId }: { brandId: number | null }) {
  const { t, lang } = useLang();
  const en = lang === "en";
  const SOCIAL_FIELDS = getSocialFields(en);
  if (!brandId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  const utils = trpc.useUtils();
  const q = (trpc as any).brand?.getConnections?.useQuery?.(
    { brandId },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const data = q?.data as { website: string; socialLinks: Record<string, string> } | null | undefined;

  const [website, setWebsite] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setWebsite(data.website ?? "");
    setLinks(data.socialLinks ?? {});
  }, [data]);

  const updateMutRaw = (trpc as any).brand?.updateConnections?.useMutation?.({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      utils.brand?.getConnections?.invalidate?.({ brandId });
    },
    onError: (e: any) => setErr(String(e?.message ?? e)),
  });
  // 2026-05-08: useSafeMutation surfaces a toast if the endpoint isn't
  // deployed (was a silent-fail vector — user clicked save, nothing
  // happened, no error shown).
  const updateMut = useSafeMutation(updateMutRaw, "brand.updateConnections");

  const handleSave = async () => {
    setErr(null);
    try {
      await updateMut.mutateAsync({ brandId, website: website.trim() || null, socialLinks: links });
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const updateLink = (key: string, val: string) => setLinks((cur) => ({ ...cur, [key]: val }));

  const filledCount =
    (website.trim() ? 1 : 0) +
    Object.values(links).filter((v) => typeof v === "string" && v.trim()).length;

  return (
    <div className="max-w-[900px] mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#64748B" }}>
              <FontAwesomeIcon icon={faGlobe} style={{ color: "#fff", fontSize: 14 }} />
            </div>
            <h1 className="text-2xl font-semibold text-default-900">{en ? "External links" : "外部連結"}</h1>
          </div>
          <p className="text-sm text-default-500">
            {en
              ? "Add this brand's website + social links. Auto-fill / Test / every task all pull real content from these URLs — **so output is grounded in reality, not guessed**."
              : "填上品牌的官網 + 社群連結。AI 自動填寫 / 測試 / 所有任務都會去抓這些連結的內容，**讓產出基於真實資料而不是亂猜**。"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-default-500">{filledCount} / {1 + SOCIAL_FIELDS.length} {en ? "filled" : "已填"}</span>
          <Button
            color="primary"
            onPress={handleSave}
            isLoading={updateMut?.isPending}
            startContent={!updateMut?.isPending && <FontAwesomeIcon icon={saved ? faCheck : faSave} className="text-tiny" />}
          >
            {saved ? (en ? "Saved" : "已儲存") : t("save")}
          </Button>
        </div>
      </div>

      {err && <div className="text-sm text-danger mb-3 px-1">{err}</div>}

      {/* Website */}
      <Card className="mb-3">
        <CardBody className="p-4">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={faGlobe} className="text-default-500 shrink-0" style={{ fontSize: 18 }} />
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-default-700 mb-1 block">{en ? "Website" : "官網"}</label>
              <Input
                size="sm"
                variant="flat"
                value={website}
                onValueChange={setWebsite}
                placeholder="https://example.com"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Social platforms */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SOCIAL_FIELDS.map((f) => (
          <Card key={f.key}>
            <CardBody className="p-4">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={f.icon} style={{ color: f.tone, fontSize: 18 }} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-medium text-default-700 mb-1 block">{f.label}</label>
                  <Input
                    size="sm"
                    variant="flat"
                    value={links[f.key] ?? ""}
                    onValueChange={(v) => updateLink(f.key, v)}
                    placeholder={f.placeholder}
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-6 text-xs text-default-500 bg-default-50 rounded-lg p-3 leading-relaxed">
        <div className="font-medium text-default-700 mb-1">{en ? "Why fill these in?" : "為什麼要填？"}</div>
        {en
          ? "Before \"auto-fill\", \"test 6 scenarios\", or any task, the AI pulls real content from these URLs (OG tags, page summaries, hero text) and injects your actual voice / audience / industry into the prompt — so output matches your brand instead of guessing from the name."
          : "AI 在跑「自動填寫」、「測試 6 情境」或任何任務之前，會先抓這些連結的真實內容（OG 標籤、頁面摘要、首屏文字），把品牌實際在用的語氣 / 受眾 / 產業塞進指令，這樣產出才會貼合品牌而不是用品牌名瞎猜產業。"}
      </div>
    </div>
  );
}
