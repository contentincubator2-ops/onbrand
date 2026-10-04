import type { TaskEnMap, VariantLabelEnMap } from "./types";

export const TASK_EN: TaskEnMap = {
  "fb-99-30day-calendar": {
    "question": "This month's focus / theme? (Multiple products and target audiences OK)",
    "placeholder": "e.g. Mother's Day campaign | Push Product A (busy moms) + Product B (budget-minded women) | Brand belief: everyone can make good content easily",
    "inputs": {
      "monthly_focus": {
        "label": "Monthly theme + products + target audience"
      }
    }
  },
  "fb-99-monthly-calendar-promo": {
    "question": "Promo theme + which products to push (each for whom, one selling point)?",
    "placeholder": "e.g. Anniversary sale | Product A (busy moms / saves time) + Product B (budget-minded women / value) + Product C (e-commerce owners / multi-platform) | Runs 5/20-5/31",
    "inputs": {
      "monthly_focus": {
        "label": "Promo theme + products + audience + dates"
      }
    }
  },
  "fb-99-carousel-5": {
    "question": "What is the carousel about?",
    "placeholder": "Theme the 5 carousel cards should convey",
    "inputs": {
      "topic": {
        "label": "Carousel theme"
      }
    }
  },
  "fb-99-serial-3": {
    "question": "What story do you want to serialize?",
    "placeholder": "e.g. Customer transformation / team growth / product development journey",
    "inputs": {
      "story_topic": {
        "label": "Series theme"
      }
    }
  },
  "fb-99-viral-rewrite": {
    "question": "Paste the viral original (or link). We'll analyze its structure and rewrite it your way",
    "placeholder": "Paste the original viral post / link / topic",
    "inputs": {
      "viral_source": {
        "label": "Viral original / link / topic"
      },
      "brand_angle": {
        "label": "Your brand angle (optional)"
      }
    },
    "source": {
      "metric": "7M+ views within 48 hours, nearly 10M at 75 hours after posting",
      "takeaway": "Timing matters more than writing for viral rewrites: jump in while the event is still hot, and side with the one being mocked rather than joining the mockery."
    }
  },
  "fb-99-testimonial-rewrite": {
    "question": "Paste the original customer testimonial / interview / review",
    "placeholder": "Customer's own words, interview transcript, review screenshot text",
    "inputs": {
      "testimonial_source": {
        "label": "Original customer testimonial"
      },
      "consent_status": {
        "label": "Publishing consent obtained?",
        "placeholder": "yes / anonymized / pending"
      }
    }
  },
  "fb-99-trend-rewrite": {
    "question": "Which current event do you want to ride?",
    "placeholder": "e.g. Olympics / AI news / seasonal holiday",
    "inputs": {
      "trend_topic": {
        "label": "Current event topic"
      },
      "brand_angle": {
        "label": "Brand angle (optional)"
      }
    }
  },
  "fb-99-14day-countdown": {
    "question": "Campaign name + main hook/offer + countdown days (7 or 14) + campaign end date?",
    "placeholder": "e.g. onBrand Studio mid-year upgrade campaign | Main hook: lock in your brand DNA | 7-day countdown | Ends 7/1",
    "inputs": {
      "event_name": {
        "label": "Campaign name + hook/offer + countdown days + end date"
      }
    }
  },
  "fb-99-launch-toolkit": {
    "question": "Campaign name + date + key points?",
    "placeholder": "e.g. 5/20 online launch event",
    "inputs": {
      "event_name": {
        "label": "Campaign name"
      },
      "event_when": {
        "label": "Date / time"
      },
      "event_why": {
        "label": "Why attend / key points"
      }
    }
  },
  "fb-99-livestream-9seg": {
    "question": "Livestream topic + key points?",
    "placeholder": "Q&A / new product try-out / live tasting",
    "inputs": {
      "live_topic": {
        "label": "Livestream topic"
      },
      "key_points": {
        "label": "3-5 planned key points"
      }
    }
  },
  "fb-99-crisis-playbook": {
    "question": "What is the incident / crisis?",
    "placeholder": "Describe the incident fully + known facts",
    "inputs": {
      "incident": {
        "label": "Incident details"
      },
      "facts": {
        "label": "Known facts / actions already taken"
      },
      "commitment": {
        "label": "Actions you can commit to"
      }
    }
  },
  "ig-99-30day-calendar": {
    "question": "This month's theme?",
    "placeholder": "This month's main push",
    "inputs": {
      "monthly_focus": {
        "label": "Monthly theme"
      }
    }
  },
  "ig-99-reel-series-6": {
    "question": "6-episode series theme?",
    "placeholder": "Tutorial series / story series",
    "inputs": {
      "series_topic": {
        "label": "Series theme"
      }
    }
  },
  "ig-99-account-reposition": {
    "question": "Which direction do you want to reposition toward?",
    "placeholder": "What direction / audience to shift to",
    "inputs": {
      "new_direction": {
        "label": "New direction"
      }
    }
  },
  "yt-99-series-6ep": {
    "question": "6-episode series theme?",
    "placeholder": "Series theme: tutorial / story / review",
    "inputs": {
      "series_topic": {
        "label": "Series theme"
      }
    }
  },
  "yt-99-quarterly-strategy": {
    "question": "Channel theme + target audience job title + brand promise + competitors (fill all four)",
    "placeholder": "e.g. onBrand Studio YouTube channel | Target audience: brand marketing managers / SME content strategists | Brand promise: brand voice with traceable provenance, AI-assisted output that keeps the brand's soul | Competitors: Jasper AI / Writer / Copy.ai",
    "inputs": {
      "channel_focus": {
        "label": "Channel theme + audience + brand promise + competitors"
      }
    }
  },
  "yt-99-premiere-kit": {
    "question": "Premiere topic?",
    "placeholder": "Premiere topic",
    "inputs": {
      "premiere_topic": {
        "label": "Premiere topic"
      }
    }
  },
  "tt-99-30day-foryou": {
    "question": "What direction do you want to push this month?",
    "placeholder": "Mainly tutorial / contrast / unboxing",
    "inputs": {
      "monthly_theme": {
        "label": "Monthly direction"
      }
    },
    "source": {
      "metric": "250K submissions and 430M plays in 6 days",
      "takeaway": "The challenge was tied to an action that already existed (the Dr. Jean children's song), so viewers didn't have to learn anything new to join: the barrier sets the submission volume."
    }
  },
  "tt-99-trend-week": {
    "question": "Which kind of trend do you want to ride?",
    "placeholder": "Holiday / meme / news",
    "inputs": {
      "trend_focus": {
        "label": "Trend type"
      }
    }
  },
  "li-99-30day-thought-leadership": {
    "question": "What professional image do you want to build this month? (Month + core theme + target audience job title + your brand promise, fill all four)",
    "placeholder": "e.g. May | AI brand consistency | Target audience: brand marketing managers / content strategists | Brand promise: brand voice doesn't distort with speed; every AI output has traceable provenance",
    "inputs": {
      "expertise_area": {
        "label": "Month + theme + audience job title + brand promise"
      }
    }
  },
  "li-99-newsletter-quarterly": {
    "question": "Quarterly main theme + sub-topic per issue + target reader action + brand promise (fill all four)",
    "placeholder": "e.g. Q2 brand consistency | Issue 1 Why AI-written copy reads like someone else / Issue 2 Three provenance questions: where does the tone come from / Issue 3 How a three-person team keeps the brand consistent / Issue 4 Upgrade to Pro to unlock advanced analytics | Target action: after each issue, readers take away 1 insight they can act on right away | Brand promise: brand voice you can trace, not distorted by speed",
    "inputs": {
      "quarter_topic": {
        "label": "Quarterly theme + issue sub-topics + target action + brand promise"
      }
    }
  },
  "em-99-4week-nurture": {
    "question": "Brand/product name + target audience job title + weekly themes for 4 weeks + core feature names (fill all four)",
    "placeholder": "e.g. onBrand Studio: keep brand voice from distorting with speed | Audience: brand marketing managers / content strategists | Week 1 Why brand consistency matters to you / Week 2 Brand persona setup so AI truly understands you / Week 3 Make your first piece with the provenance annotation feature / Week 4 Unlock advanced analytics, upgrade to Pro | Features: provenance annotation, brand dictionary lookup, brand persona setup",
    "inputs": {
      "value_prop": {
        "label": "Brand name + audience + 4 weekly themes + feature names"
      }
    }
  },
  "em-99-launch-sequence": {
    "question": "Product name + selling point + target audience + launch date + early-bird/limited-time offer + send interval?",
    "placeholder": "e.g. Brand Consistency Provenance Certificate | Every AI output automatically comes with a brand dictionary lookup | Audience: brand marketing managers / content strategists | Launch 7/1 | First 100 early birds free | One email every 2 days",
    "inputs": {
      "product": {
        "label": "Product + selling point + audience + launch date + early bird + send interval"
      }
    }
  },
  "pr-99-launch-toolkit": {
    "question": "Launch topic + target media types + spokesperson name and title + release timing (fill all four)",
    "placeholder": "e.g. Launching the new \"Brand Consistency Provenance Certificate\" feature; Targets: 數位時代 (Business Next), TechOrange (tech media); Spokesperson: CJ Wang (王俊人), Founder & CEO; Embargo: 2026-06-01 10:00 AM",
    "inputs": {
      "launch_topic": {
        "label": "Launch topic + target media + spokesperson + timing"
      }
    },
    "source": {
      "takeaway": "One news hook runs through the whole kit."
    }
  },
  "pr-99-newsjack": {
    "question": "What do you want the brand to be seen for / which expertise or product can connect? (Add any current event you want to ride)",
    "placeholder": "Brand expertise / product / viewpoint + facts or numbers you have. The system auto-pulls what's trending now; if you already have a specific event in mind, write it in (it's used when nothing is found)",
    "inputs": {
      "context": {
        "label": "Brand hook + material on hand (add any current event to ride)"
      }
    },
    "source": {
      "takeaway": "Timing wins, not copy."
    }
  },
  "br-99-reposition-toolkit": {
    "question": "Which direction do you want to move toward? (Current positioning is loaded as the starting point)",
    "placeholder": "New positioning direction / old baggage to drop",
    "inputs": {
      "new_position": {
        "label": "New positioning direction"
      }
    }
  },
  "br-99-voice-playbook": {
    "question": "Which scenarios do you want to add or fine-tune? (Existing voice is loaded; leave blank to expand the 8-scenario playbook directly)",
    "placeholder": "Optional: specific scenarios to strengthen, e.g. customer service / crisis / cross-border",
    "inputs": {
      "voice_direction": {
        "label": "Scenario additions (optional)"
      }
    }
  },
  "rs-99-discovery-sprint": {
    "question": "What do you want to learn about users? (Existing audience positioning is loaded; leave blank to extend research hypotheses from the existing personas)",
    "placeholder": "Optional: new hypothesis to validate or angle to dig into",
    "inputs": {
      "research_goal": {
        "label": "Research goal (optional)"
      }
    }
  },
  "rs-99-competitor-mapping": {
    "question": "Anything to add? (The brand's competitor positioning is loaded; leave blank to run directly)",
    "placeholder": "Optional: extra angle, e.g. online competitors only, add overseas cases",
    "inputs": {
      "category": {
        "label": "Extra notes (optional)"
      }
    }
  },
  "rs-99-competitor-ads": {
    "question": "Which competitors to monitor? (Up to 5 brand names, comma-separated)",
    "placeholder": "e.g. 屈臣氏 (Watsons), 康是美 (Cosmed), 86 小舖 (86 Shop)",
    "inputs": {
      "competitor_brands": {
        "label": "Competitor brands",
        "placeholder": "Comma-separated, up to 5"
      },
      "focus": {
        "label": "What to look at? (optional)",
        "placeholder": "Ad pacing / messaging tone / visual style / ad type mix / all"
      }
    }
  },
  "kl-99-campaign-toolkit": {
    "question": "Campaign theme + partnership scale + collaboration format + main platforms?",
    "placeholder": "e.g. onBrand Studio mid-year campaign | Find 3-5 brand marketing / content strategy KOLs | Total budget NT$200K | Format: trial experience + sponsored post | Platforms: IG + LinkedIn | Done by July",
    "inputs": {
      "campaign_brief": {
        "label": "Campaign needs (theme / scale / format / platforms / timeline)"
      },
      "kol_tiers": {
        "label": "KOL tiers (optional)",
        "placeholder": "e.g. 1 at 100K+ + 2 at 30-100K + 5 at 1-10K"
      }
    }
  },
  "fb-99-account-reposition": {
    "question": "Why do you want to reposition? Which direction, or any brand you want to benchmark?",
    "placeholder": "e.g. Currently too serious, want a lighter tone / want XXX's positioning style / audience shifting from B2B to B2C",
    "source": {
      "short": "Trout & Ries, 《定位》 (Positioning)",
      "takeaway": "Decide which spot to own in the mind first, then decide what to say."
    }
  },
  "fb-99-quarterly-strategy": {
    "question": "What is this quarter's main goal? Any key milestones, new products, or directions to push?",
    "placeholder": "e.g. Q3 pushes new summer skincare, launch in July, sales push in August, warm-up for Double 11 in September",
    "source": {
      "short": "Joe Pulizzi quarterly rhythm",
      "takeaway": "Use pillars to set the quarter's rhythm, not month-by-month themes."
    }
  },
  "fb-99-monthly-analytics": {
    "question": "How did this month's numbers look? Paste the key metrics and the agents will find problems and suggest fixes",
    "placeholder": "e.g. Reach 12,000, engagement rate 2.3%, saves 45, best post was XX, reels feel much weaker than feed",
    "source": {
      "takeaway": "Metrics should answer a decision, not just list numbers."
    }
  },
  "fb-99-carousel-cvo": {
    "question": "Which product or service do you want to take from stranger to order? Who is the target customer, and what is their biggest purchase concern?",
    "placeholder": "e.g. Online course for office workers who want a side hustle; concern: \"not sure it will be useful after finishing\"",
    "source": {
      "short": "Ryan Deiss CVO funnel",
      "takeaway": "One piece of content walks from awareness to order, not just one stage."
    }
  },
  "fb-99-offer-first": {
    "question": "What is this offer? Include discount, gifts, deadline, or other tempting conditions",
    "placeholder": "e.g. Buy the course, get a 1-on-1 consultation (worth NT$3,000), until Sunday 23:59, no extension",
    "source": {
      "takeaway": "The offer itself should be so good that refusing is hard."
    }
  },
  "fb-99-magnetic-marketing": {
    "question": "Who do you most want to attract? What is their biggest pain point or desire right now?",
    "placeholder": "e.g. Want to attract SME owners who have a brand but don't know how to make content; biggest pain: \"nobody sees what I post\"",
    "source": {
      "takeaway": "Message, market, and media must be aligned first."
    }
  },
  "fb-99-mass-control": {
    "question": "What are you launching? Expected launch date, and what's the goal (sign-ups / sales / awareness)?",
    "placeholder": "e.g. Annual flagship course, goes on sale 6/15, goal: sell 200 seats in 3 days",
    "source": {
      "takeaway": "Give so much first that people feel bad not buying, then open sales."
    }
  },
  "fb-99-reels-script": {
    "question": "What is this Reel about? Topic, key point, or a video you want to imitate all work",
    "placeholder": "e.g. 30-second new product unboxing / behind-the-scenes of daily store life / 3 common skincare mistakes"
  },
  "ig-99-monthly-calendar": {
    "question": "What is this month's main theme or focus? Any product, campaign, or holiday you want to push?",
    "placeholder": "e.g. June is Father's Day month, push new men's skincare, want more reels for reach",
    "source": {
      "short": "Joe Pulizzi content calendar",
      "takeaway": "Build the month around pillar themes, not post-by-post topics."
    }
  },
  "ig-99-youtility": {
    "question": "What do your followers most need to learn or solve? What hassle or time can you save them?",
    "placeholder": "e.g. Help restaurant owners learn menu photography, help gym beginners avoid pitfalls, help freelancers manage time",
    "source": {
      "takeaway": "Useful enough to save beats funny enough to laugh."
    }
  },
  "ig-99-visual-story": {
    "question": "How does your current visual style feel? What direction do you want, or any account to reference?",
    "placeholder": "e.g. Currently too cluttered, want minimalist Japanese cream tones, referencing @xxx's composition",
    "source": {
      "takeaway": "Visual consistency is itself identity: set the rules first, then produce content."
    }
  },
  "ig-99-live-first": {
    "question": "What will you stream about? How many sessions, how often, and is the goal followers, engagement, or sales?",
    "placeholder": "e.g. Every Thursday 8 PM for 45 minutes, sharing brand-building lessons, goal: build trust",
    "source": {
      "short": "Brian Fanzo live-first",
      "takeaway": "The imperfection of real-time interaction is more credible than edited perfection."
    }
  },
  "ig-99-document": {
    "question": "Which scenes from your daily work or brand process do you want followers to see?",
    "placeholder": "e.g. A designer's freelance day, a product's journey from sampling to shipping, client meetings / studio environment",
    "source": {
      "short": "Gary Vaynerchuk document method",
      "takeaway": "Document the process instead of creating content: it solves volume and authenticity together."
    }
  },
  "ig-99-radical-transparency": {
    "question": "Which behind-the-scenes stories, challenges, or failures are you willing to share publicly?",
    "placeholder": "e.g. Nearly shut down after a loss-making first year, a failed recipe change, a time a customer cancelled an order",
    "source": {
      "short": "Rachel Hollis radical transparency",
      "takeaway": "Tell the failures and costs first so trust comes before sales."
    }
  },
  "ig-99-save-worthy": {
    "question": "What do you want to teach followers? What knowledge or checklist in your field do people most want to save?",
    "placeholder": "e.g. IG algorithm pitfalls checklist, 5 format tricks for more readable copy, a must-read comparison table before choosing materials",
    "source": {
      "short": "Alex Hormozi save-worthy",
      "takeaway": "Make value so dense people can't scroll past; saves matter more than likes."
    }
  },
  "br-60-tagline-suite": {
    "question": "Brand spirit / core differentiator?",
    "placeholder": "Brand spirit, beliefs, what you do",
    "inputs": {
      "spirit": {
        "label": "Brand spirit"
      }
    }
  },
  "br-60-value-prop": {
    "question": "What does the brand / product do?",
    "placeholder": "Product / service description",
    "inputs": {
      "product": {
        "label": "Product / service"
      }
    }
  },
  "br-60-brand-voice": {
    "question": "What brand voice do you want to shape?",
    "placeholder": "e.g. Professional but approachable, youthful but not flashy",
    "inputs": {
      "voice_direction": {
        "label": "Voice direction"
      }
    }
  },
  "cw-60-crosspost-4platform": {
    "question": "What are you sharing today?",
    "placeholder": "Topic / message / source URL",
    "inputs": {
      "topic": {
        "label": "Topic / message"
      },
      "platforms": {
        "label": "Which platforms? (optional, all by default)",
        "placeholder": "FB, IG, Threads, LinkedIn (comma-separated; blank = all)"
      }
    }
  },
  "cw-60-ab-variants": {
    "question": "What topic do you want to test?",
    "placeholder": "Topic / source text / URL",
    "inputs": {
      "topic": {
        "label": "Topic / message"
      },
      "test_axis": {
        "label": "What dimension to test? (optional)",
        "placeholder": "Emotional vs rational / short vs long / story vs data / direct vs implied"
      }
    }
  },
  "em-60-newsletter-full": {
    "question": "What is this issue's newsletter topic?",
    "placeholder": "What you want to tell subscribers this issue",
    "inputs": {
      "topic": {
        "label": "Newsletter topic"
      }
    }
  },
  "em-60-promo-sequence": {
    "question": "Which promotion?",
    "placeholder": "Campaign name + offer",
    "inputs": {
      "campaign": {
        "label": "Campaign"
      }
    }
  },
  "em-60-onboarding-3": {
    "question": "What value does your service / product give new subscribers?",
    "placeholder": "What new subscribers most need to know",
    "inputs": {
      "value_prop": {
        "label": "Core value"
      }
    }
  },
  "kl-60-pitch-pack": {
    "question": "What type of KOL do you want? What's the collaboration theme?",
    "placeholder": "e.g. Find parenting KOLs with 10-50K followers to talk about a Mother's Day campaign",
    "inputs": {
      "kol_profile": {
        "label": "KOL type + collaboration theme"
      },
      "deal_terms": {
        "label": "Deal terms (optional)",
        "placeholder": "Budget range / product trial / reciprocal / desired content format"
      }
    }
  },
  "li-60-thought-leader": {
    "question": "Which B2B viewpoint do you want to share?",
    "placeholder": "e.g. 3 lessons from 6 months of using AI tools",
    "inputs": {
      "topic": {
        "label": "Viewpoint topic"
      }
    }
  },
  "li-60-newsletter": {
    "question": "What is this issue about?",
    "placeholder": "What this newsletter issue should cover",
    "inputs": {
      "topic": {
        "label": "Newsletter topic"
      }
    }
  },
  "li-60-case-study": {
    "question": "Paste the customer case / interview",
    "placeholder": "Original case / interview content",
    "inputs": {
      "testimonial_source": {
        "label": "Customer case"
      },
      "consent_status": {
        "label": "Consent status"
      }
    }
  },
  "tt-60-foryou-full": {
    "question": "What is this TikTok about?",
    "placeholder": "Tutorial / contrast / reveal / unboxing",
    "inputs": {
      "topic": {
        "label": "Video topic"
      }
    }
  },
  "tt-60-series-3": {
    "question": "What do you want the 3-episode series to cover?",
    "placeholder": "Tutorial series / story series",
    "inputs": {
      "story_topic": {
        "label": "Series theme"
      }
    }
  },
  "tt-60-viral-rewrite": {
    "question": "Paste the viral video link / topic",
    "placeholder": "Original viral TikTok video / topic",
    "inputs": {
      "viral_source": {
        "label": "Viral original / link"
      },
      "brand_angle": {
        "label": "Brand angle"
      }
    }
  },
  "pr-60-news-release-full": {
    "question": "What is the news topic?",
    "placeholder": "Product launch / funding secured / major partnership",
    "inputs": {
      "topic": {
        "label": "News topic"
      }
    }
  },
  "rs-60-interview-guide": {
    "question": "What do you want to learn about users?",
    "placeholder": "Research goal / hypothesis to validate",
    "inputs": {
      "research_goal": {
        "label": "Research goal"
      }
    }
  },
  "rs-60-persona-suite": {
    "question": "What is your product / service?",
    "placeholder": "Product / service description",
    "inputs": {
      "product": {
        "label": "Product / service"
      }
    }
  },
  "rs-60-jtbd-suite": {
    "question": "In what situation do users use you?",
    "placeholder": "User situation description",
    "inputs": {
      "context": {
        "label": "User situation"
      }
    }
  }
};

export const VARIANT_LABEL_EN: VariantLabelEnMap = {
  "理念WHY": "Brand WHY",
  "產品": "Product",
  "節慶": "Seasonal",
  "UGC見證": "UGC testimonial",
  "權威觀點": "Authority view",
  "產品促銷": "Product promo",
  "急迫限時": "Urgent limited-time",
  "節慶檔期": "Seasonal campaign",
  "輪播版本": "Carousel version",
  "保結構式": "Structure-preserving",
  "情感放大式": "Emotion-amplified",
  "反差式": "Contrast",
  "數據式": "Data-driven",
  "故事式": "Story-driven",
  "對比式": "Comparison",
  "情感式": "Emotional",
  "簡短式": "Brief",
  "評論式": "Commentary",
  "幽默式": "Humorous",
  "資訊式": "Informative",
  "立場式": "Stance",
  "中立式": "Neutral",
  "第 1 集": "Episode 1",
  "第 2 集": "Episode 2",
  "第 3 集": "Episode 3",
  "倒數第 7 天": "7 days left",
  "倒數第 6 天": "6 days left",
  "倒數第 5 天": "5 days left",
  "倒數第 4 天": "4 days left",
  "倒數第 3 天": "3 days left",
  "倒數第 2 天": "2 days left",
  "最後 1 天": "Last day",
  "活動總覽": "Campaign overview",
  "預告 1": "Teaser 1",
  "預告 2": "Teaser 2",
  "預告 3": "Teaser 3",
  "當日": "Day of",
  "即時 1": "Live 1",
  "即時 2": "Live 2",
  "事後": "After",
  "IG 跨平台": "IG cross-post",
  "預告": "Teaser",
  "開場宣告": "Opening announcement",
  "爆點 1": "Highlight 1",
  "爆點 2": "Highlight 2",
  "爆點 3": "Highlight 3",
  "爆點 4": "Highlight 4",
  "爆點 5": "Highlight 5",
  "結尾": "Closing",
  "Reel 剪輯": "Reel cut",
  "偵測警示": "Detection alert",
  "第一份聲明": "First statement",
  "24h 更新": "24h update",
  "48h 更新": "48h update",
  "72h 更新": "72h update",
  "1 週 follow-up": "1-week follow-up",
  "媒體 talking points": "Media talking points",
  "第 1 週": "Week 1",
  "第 2 週": "Week 2",
  "第 3 週": "Week 3",
  "第 4 週": "Week 4",
  "第 4 集": "Episode 4",
  "第 5 集": "Episode 5",
  "第 6 集": "Episode 6",
  "新 Bio": "New bio",
  "Highlight 套組": "Highlights set",
  "主題研究": "Topic research",
  "指標追蹤": "Metrics tracking",
  "即時趨勢報告": "Live trend report",
  "內容支柱": "Content pillars",
  "12 影片 title": "12 video titles",
  "Community 月曆": "Community calendar",
  "Trailer 腳本": "Trailer script",
  "Community 倒數 ×5": "Community countdown ×5",
  "直播配套": "Livestream kit",
  "精華剪輯指南": "Highlight clip guide",
  "邀請開場": "Invitation opener",
  "brand brief 模板": "Brand brief template",
  "報價回應": "Quote reply",
  "brief 確認": "Brief confirmation",
  "拍攝期追蹤": "Shoot-phase check-in",
  "上稿確認": "Publish confirmation",
  "結案感謝": "Wrap-up thank-you",
  "結案數據要求": "Wrap-up data request",
  "第 1 期": "Issue 1",
  "第 2 期": "Issue 2",
  "第 3 期": "Issue 3",
  "第 4 期": "Issue 4",
  "上線": "Launch",
  "提醒 1": "Reminder 1",
  "提醒 2": "Reminder 2",
  "最後機會": "Last chance",
  "後續": "Follow-up",
  "新聞稿": "Press release",
  "採訪問答": "Interview Q&A",
  "媒體聯絡": "Media outreach",
  "後續追蹤": "Follow-up",
  "競品動態": "Competitor moves",
  "產業數據／報告": "Industry data / reports",
  "法規政策": "Regulation and policy",
  "社群熱話": "Social buzz",
  "媒體議題": "Media topics",
  "技術突破": "Tech breakthrough",
  "Tagline 5 套": "5 tagline sets",
  "5 應用範例": "5 usage examples",
  "8 應用情境": "8 usage scenarios",
  "5 範例": "5 examples",
  "跨平台適配": "Cross-platform adaptation",
  "Day 1 訪綱": "Day 1 interview guide",
  "行動建議": "Action recommendations",
  "市場 overview": "Market overview",
  "競品 deep dive ×5": "Competitor deep dive ×5",
  "定位 map": "Positioning map",
  "推薦策略": "Recommended strategy",
  "英雄式": "Hero",
  "智者式": "Sage",
  "創造者式": "Creator",
  "照顧者式": "Caregiver",
  "反叛者式": "Rebel",
  "問題導向": "Problem-led",
  "解法導向": "Solution-led",
  "結果導向": "Outcome-led",
  "對比導向": "Contrast-led",
  "情感導向": "Emotion-led",
  "專業版": "Professional",
  "親切版": "Friendly",
  "簡潔版": "Concise",
  "故事版": "Story",
  "幽默版": "Humorous",
  "FB 版": "FB version",
  "IG 版": "IG version",
  "Threads 版": "Threads version",
  "LinkedIn 版": "LinkedIn version",
  "A 版": "Version A",
  "B 版": "Version B",
  "教學版": "Tutorial",
  "數據版": "Data",
  "趨勢版": "Trend",
  "懸念版": "Suspense",
  "開賣": "On sale",
  "D0 歡迎": "D0 welcome",
  "D3 教學": "D3 tutorial",
  "D7 邀請": "D7 invitation",
  "邀約主信": "Main invitation email",
  "合作 Brief（附件）": "Collaboration brief (attachment)",
  "追蹤信": "Follow-up email",
  "發布後感謝信": "Post-publish thank-you",
  "反共識版": "Contrarian",
  "案例版": "Case study",
  "預測版": "Prediction",
  "觀點版": "Opinion",
  "反差版": "Contrast",
  "揭密版": "Reveal",
  "節奏版": "Rhythm",
  "標準版": "Standard",
  "成就版": "Achievement",
  "里程碑版": "Milestone",
  "事件版": "Event",
  "宣言版": "Manifesto",
  "探索式": "Exploratory",
  "驗證式": "Validation",
  "發散式": "Divergent",
  "主要使用者": "Primary user",
  "次要使用者": "Secondary user",
  "決策者": "Decision maker",
  "影響者": "Influencer",
  "邊緣使用者": "Edge user",
  "功能性 Job": "Functional job",
  "情感性 Job": "Emotional job",
  "社交性 Job": "Social job",
  "替代性 Job": "Substitute job",
  "意外性 Job": "Unexpected job"
};
