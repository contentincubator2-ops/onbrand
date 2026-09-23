/**
 * Strategy · 用詞 —— 使用詞、禁用詞、替換對照收在同一個 tray。
 *
 * 2026-09-23 (CJ「我想將可用詞和禁用詞，都集合在同一個 mission tray」)。
 *
 * 原本是兩個分頁（正面用詞 / 禁用詞），兩邊都有自己的市場切換、自己的試寫框，
 * 而它們讀的是同一張表、同一次查詢。分開的代價是：**要回答「這個字到底會不會
 * 出現在貼文裡」得在兩頁之間來回**，而那是這一區唯一真正的問題。
 *
 * 合併之後三張卡回答同一個問題的三個面向：請模型用什麼、不准出現什麼、
 * 一定會被換成什麼。
 *
 * 舊網址（/hub/strategy/preferred、/hub/strategy/banned）導過來，不留死連結。
 */
import React from "react";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import { useT } from "../../lang";
import WordingTester from "../../components/wording-tester";
import StratWordingCards from "../../components/strat-wording-cards";
import {
  ConflictPanel,
  LiveNote,
  MarketTabs,
  SectionLabel,
  useWording,
  useWordingMarket,
  type Market,
} from "../../components/wording-shared";

const PRESETS: Record<Market, string> = {
  TW: "我在華碩 ExpertHub 服務。秒殺價！業界最強的電子簽核，這套方案便宜又好上手，包你立即見效。",
  US: "I work at ASUS. This revolutionary game-changer is a no-brainer — cheap, easy to start, instant results!",
};

export default function StrategyWordingPage() {
  const t = useT();
  const [market, setMarket] = useWordingMarket();
  const { query, actions } = useWording();

  const counts = {
    TW: (query.data?.items ?? []).filter((w) => w.market === "TW").length,
    US: (query.data?.items ?? []).filter((w) => w.market === "US").length,
  };
  const marketConflicts = (query.data?.conflicts ?? []).filter((c) => c.market === market);

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Wording", "策略 · 用詞")}
        title={t("What a rep post may and may not say", "業務貼文能說什麼、不能說什麼")}
        subtitle={t(
          "Three kinds of rule with three different amounts of force: one is asked of the writer, one stops the post, one always rewrites it. Each word carries how often it actually did something.",
          "三種規則，三種不同的力道：一種是請模型照做，一種會把貼文攔下來，一種一定會改字。每個詞旁邊是它實際作用過幾次。",
        )}
        right={<MarketTabs market={market} onChange={setMarket} counts={counts} />}
      />

      <div className="mb-4">
        <LiveNote>
          {t(
            "Live: changes apply to the next post a rep writes. No redeploy, no approval step.",
            "即時生效：業務寫的下一篇就會套用，不需要重新部署，也沒有核准流程。",
          )}
        </LiveNote>
      </div>

      {query.isLoading ? <Loading /> : <ErrorNote error={query.error} />}

      {query.data ? (
        <>
          <StratWordingCards data={query.data} market={market} actions={actions} />

          <div className="mt-7">
            <SectionLabel
              label={t("Rules that fight each other", "互相牴觸的規則")}
              counter={marketConflicts.length ? `${marketConflicts.length}` : undefined}
              intro={t(
                "Order matters: the writer is checked, then repaired, then the swaps run, then it is checked once more. A swap that puts a banned word back in is caught by that last check — but there is no repair step after it, so the post is flagged rather than fixed.",
                "順序會咬人：先檢查、再修補、然後替換、最後再檢查一次。一組把禁用詞換回去的替換，最後那次檢查抓得到，但它後面已經沒有修補步驟了——那篇會被標記成不合格，而不是被修好。",
              )}
            />
            <ConflictPanel conflicts={marketConflicts} />
          </div>

          <WordingTester
            market={market}
            presets={PRESETS}
            highlight="claims"
            label={t("Try a draft", "試寫看看")}
            intro={t(
              "Paste a draft and see what a rep's post would actually come out as.",
              "貼上草稿，看看業務的貼文最後會變成什麼樣子。",
            )}
          />
        </>
      ) : null}
    </div>
  );
}
