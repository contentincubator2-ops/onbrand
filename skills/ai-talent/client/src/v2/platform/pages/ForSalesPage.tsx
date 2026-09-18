/**
 * /for-sales — OnBrand 業務版的分眾頁（給總部、行銷部與業務主管看）。
 *
 * 版型沿用 PricingPage：max-w-5xl、封面四格、黑底表頭表格、H2 底線、斜體註解。
 *
 * 數字是合約不是文案：平台費 NT$9,000（專業方案）、建置 NT$80,000 起、
 * 業務席次 NT$700／席／月（CJ 2026-09-17 定案）。LINE 建置與維運、合規模組、
 * 專屬市場數據庫的價格尚未定案，頁面一律寫「另報價」，不要寫數字。
 * 合規段落引用的法源都附官方連結；Facebook 個人帳號沒有公開 API 這件事要
 * 誠實寫出來，成效段落才站得住。
 */
import React from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../../lib/i18n";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-neutral-900 mt-16 mb-4 pb-2 border-b border-neutral-900">{children}</h2>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-neutral-500 italic mt-2 leading-relaxed">{children}</p>;
}

function Tbl({ head, rows, labelCol }: { head: string[]; rows: React.ReactNode[][]; labelCol?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-neutral-200">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="text-left font-semibold text-[12px] tracking-[0.06em] bg-neutral-900 text-white px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-neutral-200 align-top">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 whitespace-pre-line leading-relaxed ${
                    labelCol && ci === 0 ? "bg-neutral-50 font-medium text-neutral-900 w-[26%]" : "text-neutral-700"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ForSalesPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const T = (zh: string, eng: string) => (en ? eng : zh);

  const facts: Array<[string, string]> = [
    [T("產出單位", "Unit of work"), T("一次一篇貼文", "One post at a time")],
    [T("業務介面", "What reps use"), T("LINE 六格選單", "A 6-button LINE menu")],
    [T("每篇必過", "Every post passes"), T("6 項公司政策檢查", "6 company policy checks")],
    [T("歸因方式", "Attribution"), T("每位業務專屬追蹤連結", "A tracked link per rep")],
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 pt-14 pb-16">
        {/* 封面 */}
        <div className="text-center mb-10">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
            {T("OnBrand 業務版", "ONBRAND FOR SALES")}
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight mb-3 text-neutral-900"
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)" }}
          >
            {T("幫每一位業務，配一支行銷團隊", "Give every sales rep a marketing team")}
          </h1>
          <p
            className="mx-auto text-neutral-700"
            style={{ fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif', fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 660 }}
          >
            {T(
              "業務發的每一篇貼文，都用公司的說法、核准的價格，附上一條算得出成效的連結。",
              "Every post a rep shares uses the company's wording and approved prices, and carries a link that can be measured.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200 mb-12">
          {facts.map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-3">
              <div className="text-[12px] text-neutral-500">{k}</div>
              <div className="text-sm font-medium text-neutral-900 mt-0.5">{v}</div>
            </div>
          ))}
        </div>

        {/* 一 · 痛點 */}
        <H2>{T("一 · 為什麼業務的社群發文做不起來", "1 · Why rep posting stalls")}</H2>
        <Tbl
          head={[T("現況", "What happens today"), T("業務版怎麼解", "What this changes")]}
          rows={[
            [
              T("業務想發文，但不知道寫什麼，最後轉貼官方貼文。", "Reps want to post but don't know what to say, so they reshare the official post."),
              T("在 LINE 上選方案與平台，10 秒內拿到一篇用品牌語氣寫好的貼文。", "In LINE they pick a product and a channel, and get a post in the brand voice in seconds."),
            ],
            [
              T("行銷部不敢放行：亂寫價格、誇大保證、抄競品比較，出事是公司扛。", "Marketing can't let go: invented prices, guarantees and competitor claims all land on the company."),
              T("每篇都先過政策檢查——價格只能用目錄上的，誇大用語會被擋下並改寫。", "Every post passes the policy checks first: only approved prices, and hype is blocked and rewritten."),
            ],
            [
              T("發完沒人知道成效，業務也沒有動力繼續。", "Nobody knows what it earned, so reps stop."),
              T("每位業務一條追蹤連結，總部看得到誰發文、帶來多少點擊與名單。", "Each rep gets a tracked link; HQ sees who posted and what it brought in."),
            ],
          ]}
        />

        {/* 二 · 三層 */}
        <H2>{T("二 · 三層，行銷部維護一次，全公司共用", "2 · Three layers, maintained once")}</H2>
        <Tbl
          labelCol
          head={[T("層", "Layer"), T("行銷部維護什麼", "What marketing maintains"), T("業務得到什麼", "What reps get")]}
          rows={[
            [
              T("策略層", "Strategy"),
              T("品牌定位、產品與核准價格、正面用詞、禁用詞、法規更新、有出處的市場數據", "Positioning, products and approved prices, preferred wording, banned words, regulation updates, cited market facts"),
              T("寫出來的內容跟官方說法一致，不會自己發明價格或數字", "Content that matches the official story, with no invented prices or numbers"),
            ],
            [
              T("內容層", "Content"),
              T("公司核准的寫作技能（每一種貼文形式一張卡）、各市場政策包", "Approved writing skills — one card per post format — and the market policy packs"),
              T("選一張卡就能產出單篇貼文，Facebook、Instagram、LinkedIn、LINE 都可以", "Pick a card and get one post, for Facebook, Instagram, LinkedIn or LINE"),
            ],
            [
              T("成效層", "Performance"),
              T("追蹤連結、資料等級、每位業務的成效", "Tracked links, data grades and per-rep results"),
              T("自己的發文數、點擊、觸及與排名，看得到就有動力", "Their own posts, clicks, reach and ranking"),
            ],
          ]}
        />
        <Note>
          {T(
            "同一個品牌大腦，行銷版與業務版共用。已經在用行銷版的客戶，加業務版只是加席次。",
            "Both editions share one brand brain. If marketing already uses OnBrand, adding sales is just adding seats.",
          )}
        </Note>

        {/* 三 · 合規 */}
        <H2>{T("三 · 合規不是口號，是六道程式擋著", "3 · Compliance is six checks in code")}</H2>
        <Tbl
          head={[T("檢查", "Check"), T("擋掉什麼", "What it blocks"), T("法源", "Basis")]}
          rows={[
            [T("揭露員工身分", "Employee disclosure"), T("沒說自己在公司任職就發文", "Posting without saying you work there"), T("公平會薦證廣告規範、美國 FTC 16 CFR 255", "TW FTC endorsement rules; US FTC 16 CFR 255")],
            [T("核准價格", "Approved prices"), T("寫出目錄上沒有的價格或折扣", "Prices or discounts that aren't on the list"), T("消保法 §22、公平法 §21", "TW Consumer Protection Act §22; Fair Trade Act §21")],
            [T("禁止絕對用語", "No absolute claims"), T("保證、第一、最便宜、零風險", "Guaranteed, #1, cheapest, risk-free"), T("公平法 §21、FTC Act §5", "TW Fair Trade Act §21; FTC Act §5")],
            [T("數據要有出處", "Sourced statistics"), T("憑印象寫的百分比", "Percentages pulled from thin air"), T("公平法 §21、FTC 實證原則", "TW Fair Trade Act §21; FTC substantiation")],
            [T("不比較競品", "No competitor comparisons"), T("點名競爭對手做比較", "Naming a competitor to compare"), T("公平法 §21、§24", "TW Fair Trade Act §21, §24")],
            [T("追蹤連結", "Tracked link"), T("貼文沒有可歸因的連結", "A post with no attributable link"), T("公司政策", "Company policy")],
          ]}
        />
        <Note>
          {T("檢查不只是擋下來，還會自動改寫成可以發的版本，並保留原始草稿供總部對照。", "The checks don't just block — they rewrite the post into something publishable and keep the original draft for HQ to compare.")}
          {" "}
          <a href="https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking" target="_blank" rel="noopener noreferrer" className="underline">FTC</a>
          {" · "}
          <a href="https://www.ftc.gov.tw/internet/main/doc/docDetail.aspx?uid=165&docid=13021" target="_blank" rel="noopener noreferrer" className="underline">{T("公平會", "TW FTC")}</a>
        </Note>

        {/* 四 · LINE */}
        <H2>{T("四 · 業務只要會用 LINE", "4 · Reps only need LINE")}</H2>
        <Tbl
          labelCol
          head={[T("選單", "Menu"), T("做什麼", "What it does")]}
          rows={[
            [T("寫一篇", "Write a post"), T("選方案與平台，產出一篇已通過政策檢查的貼文", "Pick a product and channel, get a policy-checked post")],
            [T("本週主推", "This week's focus"), T("行銷部推的主題與素材", "What marketing is pushing this week")],
            [T("產品快查", "Product lookup"), T("只回答核准的賣點與價格", "Only approved features and prices")],
            [T("發布回報", "Share & report"), T("複製文案、分享到 LINE、回貼發文網址", "Copy, share to LINE, report the post URL")],
            [T("我的成效", "My results"), T("自己的發文、點擊、觸及與排名", "Your posts, clicks, reach and ranking")],
            [T("問 AI 助理", "Ask AI"), T("開場白、客戶疑慮、補助怎麼說", "Hooks, objections, how to explain a subsidy")],
          ]}
        />
        <Note>{T("LINE 官方帳號掛在客戶自己的名下，業務看到的是自家品牌，不是我們的。", "The LINE account is the client's own, so reps see their company's brand, not ours.")}</Note>

        {/* 五 · 成效 */}
        <H2>{T("五 · 成效分四個等級，不混在一起算", "5 · Four data grades, never blended")}</H2>
        <Tbl
          labelCol
          head={[T("等級", "Grade"), T("來源", "Source"), T("適用", "Where")]}
          rows={[
            [T("已驗證", "Verified"), T("平台官方 API 提供的曝光與互動", "Impressions and engagement from the platform API"), "LinkedIn, Instagram"],
            [T("可追蹤", "Tracked"), T("我們自己的短網址轉址", "Our own short-link redirect"), T("所有通路", "Every channel")],
            [T("自行回報", "Self-reported"), T("業務回貼發文網址或截圖", "The rep pastes the post URL or numbers"), "Facebook"],
            [T("估算", "Estimated"), T("人脈規模乘以一般比例", "Network size × a typical rate"), T("沒有 API 的情況", "Where no API exists")],
          ]}
        />
        <Note>
          {T(
            "Facebook 個人帳號沒有開放給第三方的貼文 API，任何人說能自動抓個人頁的曝光都不成立。我們的做法是把它標成自行回報，並用追蹤連結補上真正算得出來的數字。",
            "Facebook personal profiles have no third-party posting or insights API. Anyone claiming automatic reach from a personal profile is overstating it. We label those numbers self-reported and measure what's real with tracked links.",
          )}
        </Note>

        {/* 六 · 價格 */}
        <H2>{T("六 · 方案與價格", "6 · Plans and pricing")}</H2>
        <Tbl
          labelCol
          head={[T("項目", "Item"), T("價格", "Price"), T("說明", "Notes")]}
          rows={[
            [T("平台費", "Platform"), T("NT$9,000／月", "NT$9,000/month"), T("專業方案，含 5 個總部／行銷席次、策略層、內容層、審核工作流", "Professional plan: 5 HQ/marketing seats, strategy and content layers, review workflow")],
            [T("品牌大腦建置", "Brand brain setup"), T("NT$80,000 起（一次性）", "From NT$80,000 (one-time)"), T("定位、產品目錄與價格、用詞清單、8 個寫作技能", "Positioning, product catalog and prices, wording lists, 8 writing skills")],
            [T("業務席次", "Rep seats"), T("NT$700／席／月", "NT$700/seat/month"), T("只計算當月實際綁定 LINE 的業務", "Only reps who actually linked LINE that month")],
            [T("LINE 建置與維運", "LINE setup & operations"), T("另報價", "Quoted separately"), T("官方帳號串接、六格選單、名冊綁定、教育訓練", "Account integration, the 6-button menu, roster binding, training")],
            [T("合規模組、專屬市場數據庫", "Compliance module, market database"), T("另報價", "Quoted separately"), T("各市場法規數據庫與每月更新；市場數據、競品、補助", "Per-market regulation database with monthly updates; market facts, competitors, subsidies")],
          ]}
        />
        <Note>
          {T(
            "同時使用行銷版與業務版，平台費只收一份。金額未含營業稅，實際範圍以正式報價為準。",
            "Using both editions costs one platform fee. Prices exclude tax; the formal quote defines the scope.",
          )}
        </Note>

        {/* 七 · 常見問題 */}
        <H2>{T("七 · 常見問題", "7 · Questions we get")}</H2>
        <Tbl
          labelCol
          head={[T("問題", "Question"), T("回答", "Answer")]}
          rows={[
            [
              T("一定要用業務的私人帳號嗎？", "Do reps have to use their personal accounts?"),
              T("參加與否由業務自己決定，隨時可以退出；沒綁定的人不計費。也不建議把發文列入考核。", "Participation is voluntary and reps can opt out at any time; unlinked reps aren't billed. We don't recommend tying posting to performance reviews."),
            ],
            [
              T("公司看得到業務的私人內容嗎？", "Can the company see reps' private content?"),
              T("看不到。系統只保存透過平台產出的貼文、業務自行回報的網址，以及追蹤連結的點擊。", "No. The system only holds posts created through the platform, URLs the rep reports, and clicks on tracked links."),
            ],
            [
              T("可以自動幫業務發到 Facebook 嗎？", "Can it post to Facebook automatically?"),
              T("不行，Facebook 沒有開放個人帳號代發。系統提供一鍵複製與開啟 App，LinkedIn 則可以代發。", "No — Facebook doesn't allow third-party posting to personal profiles. We provide one-tap copy and open; LinkedIn does allow posting on the rep's behalf."),
            ],
            [
              T("多久可以上線？", "How long does it take?"),
              T("品牌大腦建置約 2–3 週；加 LINE 版再約 1–2 週，視官方帳號與名冊準備狀況。", "About 2–3 weeks for the brand brain, plus 1–2 weeks for LINE, depending on the official account and roster."),
            ],
          ]}
        />

        {/* CTA */}
        <div className="mt-16 border border-neutral-900 p-8 text-center">
          <p className="text-lg font-semibold text-neutral-900">
            {T("想看業務端的實際操作？", "Want to see what reps actually get?")}
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            {T("我們用你的一個產品建一份示範，含貼文、合規檢查與 LINE 流程。", "We'll build a demo from one of your products — the post, the checks and the LINE flow.")}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href="mailto:sowork@sowork.ai?subject=OnBrand%20for%20Sales"
              className="inline-flex items-center rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
            >
              {T("預約導入諮詢", "Book a walkthrough")}
            </a>
            <Link
              to="/pricing"
              className="inline-flex items-center rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              {T("看行銷版方案", "See the marketing edition")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
