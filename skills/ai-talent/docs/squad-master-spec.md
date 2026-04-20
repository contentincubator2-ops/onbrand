# Squad Master Spec v1.0

> **100 個策略顧問 Squad，6 個行銷決策層**。此文件是 agency service 產品的規格基準，所有 squad 實作、seed、QA 都依據此版本。

**當前狀態（2026-04-20）**：
- 本機 DB: 155 active squads / 17,095 agents
- Golden reference: `brand-archetype-positioning` (id=11) — Mary Allen (180797) lead
- L3 audience & L6 validation: 現有 squad 數 = 0（全部需要新建）

**架構原則**：
1. **每位 member 的 `primarySkill` 必須跟該 step 的主題字面對齊**（黃金標準來自 id=11）
2. **Lead agent 的 `primarySkill` 必須跟 squad `methodology` 字面對齊**（例如 `brand-archetype` lead 要叫 `brand-archetype-positioning`）
3. **workflow steps 統一用新格式**：`{order, name, description, tool, outputType, requiredSkills[], assignedAgentId, assignedAgentSlug, assignedAgentName}`
4. **L1 lead 預計會新建專屬 agent**（因為現有 agent 池的 primarySkill 過於 generic 如 `brand-dna` / `mbb-strategist`）—— 本週 spec 標註「**NEEDS_LEAD_AGENT**」，Week 2 建立

---

## 六層策略決策架構

```
L1 品牌策略    Brand Brain            每年 1–2 次
L2 產品線策略   Product Brain          每條產品線 1 次
L3 受眾策略     Audience Brain         每半年校準
L4 通路策略     Channel Brain          每季校準（分 FB / IG / LI / YT / PR 五個子類）
L5 活動策略     Campaign Brain         每次 campaign
L6 驗證校準     Validation Brain       持續
```

---

## L1 — 品牌策略（10 個）

### L1 #1: `brand-archetype-positioning` ✅ GOLDEN

**方法論**：Carol Pearson / Margaret Mark — _The Hero and the Outlaw: Building Extraordinary Brands Through the Power of Archetypes_ (2001)
**Lead primarySkill**：`brand-archetype-positioning` (Mary Allen id=180797)
**狀態**：**已達標，本週不動**。所有其他 L1 squad 以此為模仿對象。

**5 個 workflow steps（供參考）**：
1. 現有品牌人格診斷（`brand-personality-audit`, tool: octolens）
2. 原型選擇與組合（`archetype-selection`, tool: marketing-strategy-pmm）
3. 品牌聲音指南（`brand-voice-guide`, tool: osp_marketing_tools）
4. 視覺與體驗方向（`visual-experience-direction`, tool: internal）
5. 全通路原型一致性稽核（`archetype-consistency-audit`, tool: marketing-strategy-pmm）

---

### L1 #2: `mind-positioning`

**方法論**：Al Ries & Jack Trout — _Positioning: The Battle for Your Mind_ (1981)
**Lead primarySkill**：`mind-positioning-strategist` **NEEDS_LEAD_AGENT**（Week 2 建立；本週 fallback: `mbb-strategist`）
**token budget**: 70,000

**description**（300 字內）:
> 以 Ries & Trout 「進入消費者心智空間」為核心，找出品牌在目標受眾心中能獨佔的一個字、一個格子。透過競爭心智地圖分析，定義心智階梯位置（Leader/Alternative/Niche），打造一句話的品牌心智坐標。適用於競爭紅海中尋找認知差異化的成熟品牌。

**6 workflow steps**:
| # | name | requiredSkills | outputType | tool |
|---|---|---|---|---|
| 1 | 心智市場掃描 | `competitive-analysis`, `brand-perception`, `consumer-insights`, `market-research` | `mental-market-landscape` | octolens |
| 2 | 心智階梯分析 | `competitive-positioning`, `brand-strategy`, `market-research`, `perceptual-map` | `mental-ladder-diagnosis` | marketing-strategy-pmm |
| 3 | 心智空位發現 | `positioning`, `competitive-intelligence`, `brand-strategy`, `creative-direction` | `mind-space-gap-analysis` | internal |
| 4 | 一字定位宣言 | `brand-voice`, `brand-narrative`, `copywriting`, `brand-strategy` | `one-word-positioning-statement` | osp_marketing_tools |
| 5 | 心智階梯佔領劇本 | `marketing-strategy`, `omnichannel`, `brand-campaign`, `media-strategy` | `mind-conquest-playbook` | marketing-strategy-pmm |
| 6 | 心智一致性稽核 | `brand-consistency`, `omnichannel`, `brand-voice`, `content-strategy` | `mental-consistency-audit` | marketing-strategy-pmm |

**6 required members**:
| role | is_lead | primarySkill (preferred) | fallback |
|---|---|---|---|
| `mind_strategist` | ✅ | `mind-positioning-strategist` | `mbb-strategist` |
| `competitive_analyst` | | `competitive-intelligence-market-research` | `brand-dna` |
| `market_researcher` | | `marketing-analytics` | `consumer-insights` |
| `brand_voice_writer` | | `brand-voice` | `marketing-strategy-pmm` |
| `media_strategist` | | `media-strategy-planner` | `cmo` |
| `consistency_auditor` | | `brand-audit` | `omnichannel-consistency-audit` |

---

### L1 #3: `category-design-positioning`

**方法論**：Al Ramadan, Dave Peterson, Christopher Lochhead, Kevin Maney — _Play Bigger: How Pirates, Dreamers, and Innovators Create and Dominate Markets_ (2016)
**Lead primarySkill**：`category-design-strategist` **NEEDS_LEAD_AGENT**（fallback: `mbb-strategist`）
**token budget**: 75,000

**description**:
> 不爭奪現有品類市佔率，而是設計新品類、定義新問題、成為新品類的代名詞。適用於技術驅動新創、顛覆者、產業變革期的品牌。方法論核心：Problem → Category → Company 三位一體設計，透過「Lightning Strike」快速教育市場。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | 問題重新定義 | `consumer-insights`, `jobs-to-be-done`, `market-research`, `behavioral-analysis` | `problem-reframe` |
| 2 | 新品類命名 | `brand-strategy`, `naming`, `category-design`, `thought-leadership` | `category-naming-rationale` |
| 3 | POV（Point of View）宣言 | `thought-leadership`, `brand-narrative`, `content-strategy`, `executive-communication` | `category-pov-manifesto` |
| 4 | 教育市場計畫 | `content-marketing`, `pr-strategy`, `thought-leadership`, `brand-campaign` | `market-education-roadmap` |
| 5 | Lightning Strike 活動設計 | `brand-campaign`, `pr-strategy`, `marketing-strategy`, `event-design` | `lightning-strike-plan` |

**6 required members**:
| role | is_lead | primarySkill (preferred) | fallback |
|---|---|---|---|
| `category_designer` | ✅ | `category-design-strategist` | `mbb-strategist` |
| `jtbd_researcher` | | `market-research-agent` | `consumer-insights` |
| `naming_specialist` | | `brand-identity` | `brand-voice` |
| `thought_leadership_strategist` | | `content-marketing` | `marketing-strategy-pmm` |
| `pr_strategist` | | `pr-strategy` | `marketing-director` |
| `campaign_architect` | | `running-marketing-campaigns` | `marketing-brand-playbook` |

---

### L1 #4: `differentiation-positioning`

**方法論**：Jack Trout, Steve Rivkin — _Differentiate or Die: Survival in Our Era of Killer Competition_ (2000)
**Lead primarySkill**：`differentiation-strategist` **NEEDS_LEAD_AGENT**（fallback: `brand-dna`）
**token budget**: 65,000

**description**:
> 在 overchoice 市場中，找出並強化真正可防守的差異化點。Trout 提出 9 種差異化路徑：First、Specialty、Preference、How Made、Ingredient、Hot Product、Heritage、Leadership、Market Speciality。方法論幫助成熟品牌或挑戰者識別最有競爭力的單一差異化敘事。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | 差異化框架掃描 | `competitive-analysis`, `brand-strategy`, `market-research`, `brand-audit` | `differentiation-landscape` |
| 2 | 9 路徑可行性評估 | `brand-strategy`, `competitive-intelligence-market-research`, `brand-positioning`, `consumer-insights` | `9-paths-feasibility-matrix` |
| 3 | 差異化 claim 設計 | `brand-voice`, `copywriting`, `brand-narrative`, `messaging-strategy` | `differentiation-claim` |
| 4 | 證據金字塔建構 | `brand-strategy`, `content-strategy`, `pr-strategy`, `data-storytelling` | `evidence-pyramid` |
| 5 | 防守戰略 | `competitive-strategy`, `brand-strategy`, `marketing-strategy`, `crisis-management` | `differentiation-defense-plan` |

---

### L1 #5: `competitive-perceptual-mapping`

**方法論**：Philip Kotler 衍生的感知地圖方法論 — _Marketing Management_ (multiple editions)
**Lead primarySkill**：`perceptual-mapping-strategist` **NEEDS_LEAD_AGENT**（fallback: `marketing-analytics`）
**token budget**: 60,000

**description**:
> 透過消費者對品牌在關鍵屬性上的感知數據，繪製 2D / 3D 感知地圖，視覺化呈現品牌相對位置與空白市場。適用於需要用數據向董事會說服定位決策的場景。產出：6 個維度感知地圖 + 空白機會矩陣 + 季度追蹤計畫。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | 屬性維度篩選 | `market-research`, `consumer-insights`, `brand-perception`, `data-analysis` | `perceptual-dimensions` |
| 2 | 消費者感知調研 | `market-research-agent`, `survey-design`, `focus-group`, `data-collection` | `perception-data-dataset` |
| 3 | 感知地圖繪製 | `data-visualization`, `marketing-analytics`, `brand-strategy`, `perceptual-map` | `perceptual-map-deck` |
| 4 | 空白機會分析 | `brand-strategy`, `competitive-analysis`, `market-research`, `creative-direction` | `white-space-opportunity` |
| 5 | 季度追蹤計畫 | `marketing-analytics`, `brand-audit`, `omnichannel-consistency-audit`, `brand-strategy` | `perception-tracking-plan` |

---

### L1 #6: `purpose-driven-positioning`

**方法論**：Simon Sinek — _Start With Why_ (2009) + Golden Circle framework
**Lead primarySkill**：`purpose-strategist` **NEEDS_LEAD_AGENT**（fallback: `cmo`）
**token budget**: 65,000

**description**:
> 從 Why → How → What 三層挖掘品牌存在意義，將組織使命感轉化為市場定位。適用於 ESG-conscious 品牌、面臨年輕世代消費者的傳統品牌、創辦人品牌。方法論核心：Purpose 不是 CSR slogan，而是內部員工願意相信、外部消費者願意追隨的信念。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | Why 深掘訪談 | `executive-interviewing`, `brand-strategy`, `organizational-culture`, `storytelling` | `founders-why-document` |
| 2 | How 組織獨特做法 | `organizational-culture`, `brand-strategy`, `internal-branding`, `case-study-analysis` | `how-differentiator-list` |
| 3 | What 產品實證連結 | `product-marketing`, `brand-strategy`, `storytelling`, `content-strategy` | `what-proof-points` |
| 4 | Golden Circle Manifesto | `brand-voice`, `brand-narrative`, `copywriting`, `thought-leadership` | `golden-circle-manifesto` |
| 5 | Purpose 內部啟動計畫 | `internal-branding`, `change-management`, `organizational-culture`, `leadership-communication` | `purpose-activation-roadmap` |

---

### L1 #7: `blue-ocean-positioning`

**方法論**：W. Chan Kim & Renée Mauborgne — _Blue Ocean Strategy_ (2005)
**Lead primarySkill**：`blue-ocean-strategist` **NEEDS_LEAD_AGENT**（fallback: `mbb-strategist`）
**token budget**: 70,000

**description**:
> 透過四行動框架（Eliminate-Reduce-Raise-Create）與策略草圖，找出現有產業 boundaries 之外的「未爭之地」。適用於面臨同質化競爭、毛利被壓縮的成熟產業品牌。方法論產出：ERRC grid + Value Innovation Canvas + Non-customer 三層分析。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | 產業 value curve 繪製 | `competitive-analysis`, `strategic-planning`, `industry-analysis`, `benchmarking` | `industry-value-curve` |
| 2 | ERRC 四行動分析 | `strategic-planning`, `innovation-strategy`, `brand-strategy`, `cost-structure-analysis` | `errc-grid` |
| 3 | Non-customer 三層分析 | `consumer-insights`, `market-research`, `segmentation-analysis`, `brand-strategy` | `non-customer-three-tiers` |
| 4 | 藍海定位宣言 | `brand-positioning`, `brand-voice`, `strategic-communication`, `brand-narrative` | `blue-ocean-positioning-statement` |
| 5 | Value Innovation Roadmap | `strategic-planning`, `go-to-market`, `brand-strategy`, `marketing-strategy-pmm` | `value-innovation-roadmap` |

---

### L1 #8: `brand-equity-cbbe`

**方法論**：Kevin Lane Keller — _Strategic Brand Management_ (2019 5th ed.), CBBE Pyramid
**Lead primarySkill**：`brand-equity-strategist` **NEEDS_LEAD_AGENT**（fallback: `brand-dna`）
**token budget**: 65,000

**description**:
> 以 Keller 客戶品牌權益金字塔（Salience → Performance/Imagery → Judgments/Feelings → Resonance）系統性診斷品牌權益弱點與強化路徑。適用於需要量化品牌健康度、向投資人/董事會說明品牌投資 ROI 的企業。產出：4 層診斷評分 + 提升路線圖。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | Salience 品牌認知度診斷 | `brand-audit`, `market-research`, `brand-tracking`, `survey-design` | `salience-diagnostic` |
| 2 | Performance/Imagery 評估 | `brand-audit`, `consumer-insights`, `brand-perception`, `competitive-analysis` | `performance-imagery-scorecard` |
| 3 | Judgments/Feelings 分析 | `consumer-insights`, `brand-audit`, `emotional-branding`, `qualitative-research` | `judgment-feeling-report` |
| 4 | Resonance 忠誠度地圖 | `customer-loyalty`, `community-building`, `brand-audit`, `behavioral-analysis` | `resonance-loyalty-map` |
| 5 | CBBE 提升路線圖 | `brand-strategy`, `marketing-strategy-pmm`, `marketing-investment-planning`, `brand-audit` | `cbbe-uplift-roadmap` |

---

### L1 #9: `brand-story-positioning`

**方法論**：Donald Miller — _Building a StoryBrand_ (2017), SB7 Framework
**Lead primarySkill**：`brand-story-strategist` **NEEDS_LEAD_AGENT**（fallback: `brand-storytelling`）
**token budget**: 60,000

**description**:
> 將品牌重新定位為「消費者故事的嚮導」而非主角。透過 SB7 七步框架（Character → Problem → Guide → Plan → Call to Action → Success → Failure），建構清晰的 customer-centric 敘事。適用於 messaging 混亂、官網訊息模糊的中小品牌。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | Character 消費者英雄定義 | `customer-persona`, `consumer-insights`, `empathy-mapping`, `storytelling` | `customer-as-hero-profile` |
| 2 | Problem 三層問題架構 | `consumer-insights`, `jobs-to-be-done`, `behavioral-analysis`, `customer-journey` | `three-layer-problem-map` |
| 3 | Guide 品牌嚮導定位 | `brand-voice`, `brand-narrative`, `positioning`, `storytelling` | `guide-authority-positioning` |
| 4 | Plan 三步路徑設計 | `customer-journey`, `content-strategy`, `copywriting`, `ux-writing` | `three-step-plan-framework` |
| 5 | One-Liner + Website BrandScript | `copywriting`, `brand-voice`, `web-content-strategy`, `conversion-copy` | `storybrand-brandscript` |

---

### L1 #10: `cultural-branding`

**方法論**：Douglas Holt — _How Brands Become Icons: The Principles of Cultural Branding_ (2004)
**Lead primarySkill**：`cultural-strategist` **NEEDS_LEAD_AGENT**（fallback: `brand-dna`）
**token budget**: 75,000

**description**:
> 解讀當代文化張力（ideological contradictions），將品牌定位為回應社會焦慮的文化符號。Holt 方法論歷經 Coca-Cola、Nike、Harley 等 icon 品牌驗證。適用於希望從「產品品牌」升級為「文化 icon」的長青品牌。產出：文化張力地圖 + 品牌神話 + icon myth strategy。

**5 workflow steps**:
| # | name | requiredSkills | outputType |
|---|---|---|---|
| 1 | 文化張力掃描 | `cultural-research`, `sociological-analysis`, `trend-analysis`, `consumer-insights` | `cultural-tension-map` |
| 2 | 族群身份連結 | `consumer-insights`, `brand-community`, `cultural-research`, `segmentation-analysis` | `identity-group-linkage` |
| 3 | 品牌神話 narrative 設計 | `brand-storytelling`, `brand-narrative`, `cultural-research`, `mythic-framework` | `brand-myth-narrative` |
| 4 | Icon myth 3-year strategy | `brand-strategy`, `long-term-planning`, `brand-narrative`, `content-strategy` | `icon-myth-strategy` |
| 5 | 文化活動矩陣 | `brand-activation`, `pr-strategy`, `content-marketing`, `cultural-engagement` | `cultural-activation-matrix` |

---

## L2 — 產品線策略（10 個）

| # | slug | 方法論 (author/book/year) | Lead primarySkill | Week 2 實作優先度 |
|---|---|---|---|---|
| 1 | `value-proposition-canvas` | Alexander Osterwalder — _Value Proposition Design_ (2014) | `value-proposition-strategist` | **HIGH** |
| 2 | `benefit-ladder-positioning` | Benefit Ladder / Means-End Chain | `benefit-ladder-strategist` | HIGH |
| 3 | `jtbd-positioning` | Clayton Christensen — _Competing Against Luck_ (2016) | `jtbd-strategist` | **HIGH** |
| 4 | `fab-product-positioning` | Features-Advantages-Benefits 傳統模型 | `product-marketing-manager` | MED |
| 5 | `kano-model-positioning` | Noriaki Kano (1984) Must-be / Performance / Excitement | `kano-strategist` | MED |
| 6 | `product-golden-circle` | Sinek Why/How/What applied to products | `product-purpose-strategist` | LOW |
| 7 | `crossing-the-chasm` | Geoffrey Moore — _Crossing the Chasm_ (1991 / 2014 3rd ed.) | `gtm-strategist` | **HIGH**（B2B SaaS 必備） |
| 8 | `4p-marketing-mix` | McCarthy 4Ps (Product/Price/Place/Promotion) | `product-marketing-manager` | MED |
| 9 | `product-market-fit` | Marc Andreessen / Rahul Vohra PMF Score | `pmf-strategist` | **HIGH** |
| 10 | `anti-market-positioning` | Rory Sutherland — _Alchemy: The Dark Art and Curious Science of Creating Magic in Brands_ (2019) | `behavioral-strategist` | LOW |

**每個 squad 需要填**：description、5 workflow steps（name, requiredSkills, outputType, tool）、6 members。Week 2 填完。

---

## L3 — 受眾策略（10 個，全部新建）

| # | slug | 方法論 | Lead primarySkill | Week 2 優先度 |
|---|---|---|---|---|
| 1 | `stp-segmentation` | Kotler STP (1960s–present) | `segmentation-strategist` | **HIGH** |
| 2 | `persona-canvas-positioning` | Alan Cooper — _The Inmates Are Running the Asylum_ (1999) | `persona-strategist` | **HIGH** |
| 3 | `icp-positioning-b2b` | HubSpot / Winning by Design ICP methodology | `icp-strategist` | **HIGH** |
| 4 | `tribes-audience-strategy` | Seth Godin — _Tribes_ (2008) | `community-strategist` | MED |
| 5 | `vals-framework` | SRI International VALS (1978 / 2020 update) | `psychographic-strategist` | MED |
| 6 | `behavioral-segmentation-rfm` | RFM + Behavioral Economics (Ariely) | `behavioral-segmentation-strategist` | **HIGH** |
| 7 | `psychographic-segmentation` | Lifestyle/Values/Opinions frameworks | `psychographic-strategist` | MED |
| 8 | `ethnographic-research` | Clifford Geertz 人類學方法應用 | `ethnographer` | LOW |
| 9 | `audience-first-strategy` | Rand Fishkin — _Lost and Founder_ (2018) / SparkToro | `audience-first-strategist` | MED |
| 10 | `generational-marketing` | McCrindle 跨世代行銷框架 | `generational-strategist` | MED |

---

## L4 — 通路策略（50 個，分 5 通路）

### L4.FB — Facebook 通路策略（10 個）
| # | 現有 id | slug | 方法論作者 |
|---|---|---|---|
| 1 | 13 | `fb-schwartz-awareness` | Eugene Schwartz — 5 Levels of Awareness |
| 2 | 14 | `fb-deiss-cvo` | Ryan Deiss — Customer Value Optimization |
| 3 | 15 | `fb-marshall-8020` | Perry Marshall — 80/20 Sales and Marketing |
| 4 | 16 | `fb-kennedy-magnetic` | Dan Kennedy — Magnetic Marketing |
| 5 | 17 | `fb-hormozi-offer-first` | Alex Hormozi — $100M Offers |
| 6 | 18 | `fb-ogilvy-long-copy` | David Ogilvy — Confessions of an Advertising Man |
| 7 | 19 | `fb-loomer-custom-audience` | Jon Loomer — Advanced Facebook Ads |
| 8 | 20 | `fb-garyvee-jab-hook` | Gary Vaynerchuk — Jab, Jab, Jab, Right Hook |
| 9 | 21 | `fb-kern-mass-control` | Frank Kern — Mass Control |
| 10 | — | `fb-brunson-dotcom-ads` (新增) | Russell Brunson — Traffic Secrets |

### L4.IG — Instagram 通路策略（10 個）
| # | 現有 id | slug | 作者 |
|---|---|---|---|
| 1 | 22 | `ig-garyvee-document` | GaryVee — Document Don't Create |
| 2 | 23 | `ig-hormozi-save-worthy` | Hormozi — Save-Worthy Content |
| 3 | 24 | `ig-baer-youtility` | Jay Baer — Youtility |
| 4 | 25 | `ig-jasmine-star-community` | Jasmine Star |
| 5 | 27 | `ig-vanessalau-viral` | Vanessa Lau — Viral Reels |
| 6 | 28 | `ig-chrisdo-visual-story` | Chris Do — Visual Storytelling |
| 7 | 29 | `ig-patel-repurpose` | Neil Patel — Repurpose Content |
| 8 | 30 | `ig-hollis-radical` | Rachel Hollis — Radical Transparency |
| 9 | 31 | `ig-later-timing` | Later — Optimal Posting Timing |
| 10 | — | `ig-fanzo-live-first` (新增) | Brian Fanzo — Live-First Strategy |

### L4.LI — LinkedIn 通路策略（10 個）
| # | 現有 id | slug | 作者 |
|---|---|---|---|
| 1 | 42 | `li-welsh-content-os` | Justin Welsh — The Content Operating System |
| 2 | 43 | `li-vanderblom-algorithm` | Richard van der Blom — Algorithm Insights |
| 3 | 44 | `li-disney-social-selling` | Daniel Disney — The Ultimate LinkedIn Sales Guide |
| 4 | 45 | `li-garyvee-daytrading` | GaryVee — Day Trading Attention |
| 5 | 46 | `li-hormozi-lead-magnet` | Hormozi — Lead Magnet |
| 6 | 47 | `li-vonrosen-optimization` | Viveka von Rosen — LinkedIn Marketing |
| 7 | 48 | `li-hughes-social-selling` | Tim Hughes — Social Selling |
| 8 | 49 | `li-nemo-riches` | John Nemo — LinkedIn Riches |
| 9 | 50 | `li-walker-dark-social` | Gary Walker — Dark Social |
| 10 | 51 | `li-simmonds-distribution` | Josh Simmonds — Distribution First |

### L4.YT — YouTube 通路策略（10 個）
| # | 現有 id | slug | 作者 |
|---|---|---|---|
| 1 | 32 | `sv-mrbeast-hook-payoff` | MrBeast — Hook + Payoff |
| 2 | 33 | `sv-hormozi-one-idea` | Hormozi — One Idea One Video |
| 3 | 34 | `sv-garyvee-micro-content` | GaryVee — Micro-Content Pyramid |
| 4 | 35 | `sv-kane-hook-testing` | Brendan Kane — Hook Testing |
| 5 | 36 | `sv-nasdaily-60sec` | NasDaily — 60-Second Stories |
| 6 | 37 | `sv-blake-binge-series` | Roberto Blake — Binge-Worthy Series |
| 7 | 38 | `sv-flynn-teach-know` | Pat Flynn — Teach What You Know |
| 8 | 39 | `sv-welsh-one-to-many` | Justin Welsh — One-to-Many |
| 9 | 40 | `sv-sahilbloom-edutainment` | Sahil Bloom — Edu-tainment |
| 10 | 41 | `sv-kagan-title-test` | Noah Kagan — Title Testing |

### L4.PR — 公關策略（10 個）
| # | 現有 id | slug | 作者 |
|---|---|---|---|
| 1 | 82 | `pr-berger-stepps` | Jonah Berger — STEPPS Contagious |
| 2 | 83 | `pr-holiday-media-manipulation` | Ryan Holiday — Trust Me I'm Lying |
| 3 | 84 | `pr-gladwell-tipping-point` | Gladwell — Tipping Point |
| 4 | 85 | `pr-solis-peso` | Brian Solis — PESO Integrated |
| 5 | 86 | `pr-dietrich-peso-execution` | Gini Dietrich — Spin Sucks PESO |
| 6 | 87 | `pr-ries-fall-rise-pr` | Al & Laura Ries — The Fall of Advertising & the Rise of PR |
| 7 | 88 | `pr-ogilvy-pr-principles` | Ogilvy PR Heritage |
| 8 | 89 | `pr-schaefer-known` | Mark Schaefer — KNOWN |
| 9 | 90 | `pr-edelman-trust-barometer` | Edelman Trust Barometer framework |
| 10 | 91 | `pr-fleishman-integrated` | Fleishman Hillard Integrated framework |

---

## L5 — 活動策略（10 個，既有 9+1）

| # | 現有 id | slug | 作者 | 本週 action |
|---|---|---|---|---|
| 1 | 65 | `plf-launch-formula` | Jeff Walker — Product Launch Formula | 品質升級 |
| 2 | 67 | `porterfield-course-launch` | Amy Porterfield — Course Launch | 品質升級 |
| 3 | 136 | `event-experience-design` | Pine & Gilmore 體驗經濟 | 品質升級 |
| 4 | 137 | `cem-campaign` | Bernd Schmitt SEM | 品質升級 |
| 5 | 138 | `brand-activation` | Smilansky | 品質升級 |
| 6 | 139 | `pre-suasion-campaign` | Cialdini Pre-Suasion | 品質升級 |
| 7 | 140 | `tribes-campaign` | Seth Godin Tribes | 品質升級 |
| 8 | 141 | `ted-talk-campaign` | Chris Anderson TED | 品質升級 |
| 9 | 142 | `strategic-networking-event` | Keith Ferrazzi | 品質升級 |
| 10 | 144 | `goldblatt-event-mgmt` | Joe Goldblatt CSEP | 品質升級 |

（id 145 Jim Collins 移去 L1 cultural branding 參考；真的 L5 要 10 個，挑上述這 10 個。）

---

## L6 — 驗證校準（10 個，全部新建）

| # | slug | 方法論描述 |
|---|---|---|
| 1 | `brand-consistency-audit` | Cross-touchpoint scorecard — visual + verbal + experience |
| 2 | `perceptual-map-tracker` | 季度感知地圖更新（上接 L1 #5） |
| 3 | `brand-health-scorecard` | BrandZ + Interbrand + Kantar BrandZ 綜合框架 |
| 4 | `positioning-stress-test` | 5 挑戰框架：競品跟進 / 5 年後 / TA 記憶 / 內部執行 / 財務承受 |
| 5 | `competitive-watchtower` | 競品動態月報（messaging / pricing / activation） |
| 6 | `customer-journey-audit` | End-to-end journey mapping + 漏斗 friction 分析 |
| 7 | `messaging-matrix-audit` | Message consistency across personas × channels × stages |
| 8 | `funnel-integrity-check` | TOFU-MOFU-BOFU alignment + drop-off analysis |
| 9 | `brand-sentiment-monitor` | Social listening + sentiment + share of voice |
| 10 | `cross-channel-consistency-check` | 跨通路視覺/訊息/聲音一致性季度稽核 |

---

## Seed Framework 約定

### 必填欄位（agent_squads table）
```
slug              : kebab-case，全域唯一
name              : 中文名稱（含「小組」後綴）
description       : 300 字內，含方法論作者與應用情境
methodology       : slug 或 reference short form
missionType       : 同 slug（歷史遺留命名）
workspace         : JSON 陣列。L1 用 ["brand-positioning"]，L4 用對應通路
tags              : JSON 陣列，至少 5 個 tag
agents            : JSON 陣列 [{role, order, is_lead, agent_id}]
token             : 60_000 ~ 80_000 依複雜度
tier              : "core" (本清單全部)
strategy_layer    : L1_brand / L2_product / L3_audience / L4_channel / L5_campaign / L6_validation
is_active         : 1
```

### Workflow Steps（squad_workflow_templates table）
```
taskType          : 對應 squad slug
missionType       : 同上
name              : workflow 中文名稱
description       : 流程總綱
steps             : JSON 陣列，每 step:
  {
    order: 1-6,
    name: 步驟中文名,
    description: 150 字內步驟說明,
    tool: octolens | marketing-strategy-pmm | osp_marketing_tools | internal,
    outputType: snake-case,
    requiredSkills: [至少 4 個],
    assignedAgentId: int,
    assignedAgentSlug: string,
    assignedAgentName: string
  }
```

### 驗收規則（validateSquad.ts 本週實作）
1. `agent_squads.agents[].is_lead` 必須恰好一個為 true
2. Lead agent 的 `primarySkill` 必須跟 squad methodology 字面對齊（容許 fallback 清單）
3. 每個 step 必須有 `assignedAgentId`（不接受空字串或 owner 字串）
4. 每個 step 的 `assignedAgentId` 必須存在於該 squad 的 `agents[]` 內
5. `tier` + `strategy_layer` 欄位必填（Day 1 migration 保證存在）

---

## Week 2+ Backlog

**Week 2**：
- L2 (10) + L3 (10) seed 建立
- 需要建立 ~20 個 `NEEDS_LEAD_AGENT` 的專屬 lead agent
- 補齊 L2/L3 每個 squad 的 workflow steps spec（本週只填 slug + lead skill）

**Week 3**：
- L4 FB/IG/LI/YT/PR 50 個 seed
- L5 品質升級
- L6 10 個新建

**Week 4**：
- 原 Day 2–5 任務：前端 filter、Agent 清理、Mary Allen export、tenant isolation、case study

---

## 參考：黃金標準 Workflow 範例（L1 #1 brand-archetype-positioning）

```json
{
  "order": 1,
  "name": "現有品牌人格診斷",
  "description": "用 octolens 爬取品牌既有溝通素材（官網文案、社群貼文、廣告），Madison MarketMind 掃描消費者對品牌的感知描述詞，診斷品牌目前隱性展現的原型是什麼，以及與期望原型的落差。",
  "tool": "octolens",
  "outputType": "brand_personality_audit",
  "requiredSkills": ["brand-perception", "competitive-analysis", "consumer-insights", "audience-analysis"],
  "assignedAgentId": 30003,
  "assignedAgentSlug": "david-data",
  "assignedAgentName": "王志豪"
}
```
