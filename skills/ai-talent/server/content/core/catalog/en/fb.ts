import type { TaskEnMap, VariantLabelEnMap } from "./types";

export const TASK_EN: TaskEnMap = {
  // ─── quickTaskFB.ts (30s) ───
  "fb-30-caption-short": {
    question: "What is today's post about? You can paste a URL (auto-read), the original text, or a topic.",
    placeholder: "e.g. https://your-blog.com/article / spring launch / Mother's Day campaign",
    inputs: {
      topic: { label: "What is it about today?", placeholder: "e.g. spring launch / Mother's Day campaign / customer thank-you" },
    },
  },
  "fb-30-pure-text-hook": {
    question: "Paste the post or article you plan to publish. I'll write 5 openings in different tones to put in front.",
    placeholder: "Paste the full post text (the hook goes at the very start)",
    inputs: {
      article_body: { label: "Your original post" },
    },
  },
  "fb-30-link-caption": {
    question: "Paste the link you want to share",
    inputs: {
      url: { label: "Link URL" },
      topic: { label: "Why share this?" },
    },
  },
  "fb-30-comment-reply": {
    question: "Paste the original user comment, or the link to the post it's on",
    placeholder: "What did the user say? Paste the whole comment",
    inputs: {
      user_comment: { label: "User comment" },
      tone: { label: "Reply tone (warm / professional / playful)" },
    },
  },
  "fb-30-ad-headline": {
    question: "What does this ad promote? Product / selling point / audience in brief",
    placeholder: "e.g. Mother's Day high-protein meal line, for working moms with no time to cook",
    inputs: {
      product_focus: { label: "Product / selling point / audience" },
    },
  },
  "fb-30-ad-primary": {
    question: "What are this ad's topic, product and audience?",
    placeholder: "e.g. Mother's Day meal bundle, working moms aged 35-50",
    inputs: {
      topic: { label: "Topic / product / audience" },
    },
  },
  "fb-30-ad-cta": {
    question: "What product or service are you promoting, and what action should users take?",
    placeholder: "e.g. SoWork AI booking system, get prospects to “book a demo”",
    inputs: {
      context: { label: "Product / service + desired action" },
    },
  },
  "fb-30-ad-description": {
    question: "Where does the link go? Product page / campaign page / article / app download?",
    placeholder: "e.g. Link to the 14-pack meal bundle product page",
    inputs: {
      link_purpose: { label: "Link purpose / landing page topic" },
    },
  },
  "fb-30-pinned-short": {
    question: "What should a first-time Page visitor understand about you within 3 seconds?",
    placeholder: "Who we are, what we do, why follow us",
    inputs: {
      brand_focus: { label: "What should new visitors know?" },
    },
  },
  "fb-30-story-text": {
    question: "What do you want to say in today's Story?",
    placeholder: "e.g. behind the scenes / limited-time offer / question sticker",
    inputs: {
      topic: { label: "What should the Story convey?" },
    },
  },
  "fb-30-live-title": {
    question: "Livestream topic + time?",
    placeholder: "e.g. New product unboxing test | tonight 8:00 live (leave the time out if undecided; the teaser will keep a placeholder)",
    inputs: {
      live_topic: { label: "Livestream topic + time" },
    },
  },
  "fb-30-hashtag-set": {
    question: "What is the post topic or brand industry?",
    placeholder: "e.g. pour-over coffee / B2B SaaS / baby products",
    inputs: {
      topic: { label: "Post topic / industry" },
    },
  },
  "fb-30-countdown-1day": {
    question: "Campaign name + days left? (write them together)",
    placeholder: "e.g. Anniversary sale, 3 days left / product launch countdown, 7 days",
    inputs: {
      event_context: { label: "Campaign + days left" },
    },
  },
  "fb-30-ad-viral-monologue": {
    source: {
      short: "Dollar Shave Club",
      metric: "12,000 orders in 48 hours; website overwhelmed in the first hour",
      takeaway: "Open with your biggest weakness and viewers have no reason to leave; self-mockery buys trust, not laughs.",
    },
    question: "What is this ad selling? What do people complain about most?",
    placeholder: "e.g. subscription razors / often told “cheap means bad”",
    inputs: {
      topic: { label: "Product + most common complaint" },
    },
  },
  "fb-30-reel-self-roast": {
    source: {
      short: "Ryanair self-mockery shorts",
      metric: "16 videos drew nearly 30 million views in one month",
      takeaway: "Read customer complaints verbatim as lines; the brand stands with the audience and complaints become content.",
    },
    question: "What complaint do you hear most? (paste it word for word, don't polish)",
    placeholder: "e.g. “Your seats are really tight” / “The queue takes forever”",
    inputs: {
      topic: { label: "Most common complaint, verbatim" },
    },
  },
  "fb-30-carousel-data-recap": {
    source: {
      short: "Spotify Wrapped",
      metric: "200M people took part in 24 hours; over 630M shares",
      takeaway: "Put one number on each card, and make it about them; people share themselves, not your brand.",
    },
    question: "What numbers do you have about this individual customer?",
    placeholder: "e.g. 7 repurchases this year / total usage hours / day count as a member",
    inputs: {
      topic: { label: "Numbers you can tell a single customer" },
    },
  },
  "fb-30-album-period-recap": {
    source: {
      short: "Spotify Wrapped",
      metric: "200M people took part in 24 hours; over 630M shares",
      takeaway: "Each photo stands alone and the set is the evidence of a period; the power of a recap is “look how much we built up.”",
    },
    question: "Which period are you recapping? What happened in it?",
    placeholder: "e.g. first year of the shop / this season's new products / what the team did this year",
    inputs: {
      topic: { label: "Period + events in it" },
    },
  },
  "fb-30-story-serial-event": {
    source: {
      short: "Duolingo “Death of Duo”",
      metric: "1.7 billion organic impressions in two weeks; mascot mentions up 25,560% in a day",
      takeaway: "Leave one question unanswered overnight so viewers have a reason to return for the next Story.",
    },
    question: "Which event are you splitting up? How does it end?",
    placeholder: "e.g. new store from renovation to opening / a new product from sampling to launch",
    inputs: {
      topic: { label: "Event + known ending" },
    },
  },
  "fb-30-pinned-stance": {
    source: {
      short: "Nike × Colin Kaepernick",
      metric: "Daily social buzz +1,400%; 2.7 million brand mentions",
      takeaway: "A stance counts only if some people disagree; pin the line you are willing to pay a price for.",
    },
    question: "What stance do you hold that some customers will disagree with?",
    placeholder: "e.g. we never discount / we only use Taiwan-grown ingredients / we turn down this kind of job",
    inputs: {
      topic: { label: "A stance some people will disagree with" },
    },
  },
  "fb-30-comment-signal-boost": {
    source: {
      short: "Wendy's × Carter Wilkerson",
      metric: "3.4 million retweets, the most ever at the time",
      takeaway: "Give the commenter a challenge they can complete so others have a reason to join; the reply turns the conversation into everyone's business.",
    },
    question: "What did this comment say? What are you willing to give?",
    placeholder: "e.g. someone asked “how many orders for free shipping?” / we can give a year's supply",
    inputs: {
      topic: { label: "Comment + what you'll give" },
    },
  },
  "fb-30-event-challenge": {
    source: {
      short: "ALS Ice Bucket Challenge",
      metric: "17 million videos; over 28 million people engaged",
      takeaway: "A challenge needs three things at once: an action learnable in 10 seconds, something people look good filming, and a required nomination of the next person.",
    },
    question: "What action do you want people to take in this campaign? For what purpose?",
    placeholder: "e.g. bring your own cup to the store and take a photo / show off your three-year-old old model",
    inputs: {
      topic: { label: "Action for everyone + campaign purpose" },
    },
  },
  "fb-30-reel-character-series": {
    source: {
      short: "億家水電 (Yijia Plumbing & Electric) AI plumber 江澈 (Jiang Che)",
      metric: "First skit on 9/8 passed 1M views; one clip nearly 10M views",
      caveat: "FB and IG combined, not split by platform; the release date of the 10M-view clip is unknown.",
      takeaway: "Professional posts got only two-digit views; handing them to a recurring character with a contrasting persona as short skits made fans follow the character, and the core business became the moment the problem gets solved in the plot.",
    },
    question: "What is your core business? What is the most common problem customers run into?",
    placeholder: "e.g. plumbing repair / customers' biggest fear is a midnight leak with no one to call",
    inputs: {
      topic: { label: "Core business + customers' most common problem" },
    },
  },
  "fb-30-event-tiered-challenge": {
    source: {
      short: "運動部 (Ministry of Sports) “揮汗有禮” (Sweat for Prizes)",
      metric: "Hit the 3 million workout-record cap within two weeks of launch",
      caveat: "Government agency; the campaign ran on the Ministry's own system, with FB used only for announcements.",
      takeaway: "Split one-time sign-up into weekly tasks, award bronze/silver/gold by weeks completed, add a limited physical prize at the top tier, and announce a renewal once slots fill; one campaign gets two waves of buzz.",
    },
    question: "What do you want people to do repeatedly? What reward can you offer?",
    placeholder: "e.g. bring your own cup to the store weekly for 4 weeks / reward: gold tier gets a yearly dining voucher, 100 slots",
    inputs: {
      topic: { label: "Repeated action + rewards and slots" },
    },
  },
  "fb-30-ad-audience-split-test": {
    source: {
      short: "NAR × Havas (2026 Meta Agency Awards)",
      metric: "432K landing page views; cost per view -29%, total spend -25%",
      caveat: "US case; figures are Meta-wide, and the point is the ad setup, not the copy.",
      takeaway: "Run the same core-message creative with one manual-audience group and one Advantage+ automatic-audience group, compare a single metric (cost per landing page view), then move budget to the winner.",
    },
    question: "Who should this ad get to do what? How are you setting the audience now?",
    placeholder: "e.g. first-time buyers booking a home viewing / currently targeting ages 25-40, interest: real estate",
    inputs: {
      topic: { label: "Ad goal + current audience setup" },
    },
  },
  "fb-30-feed-big-move-local": {
    source: {
      short: "啟德機械 (Chi-De Machinery) 104-meter fire ladder truck arrives in Taiwan",
      metric: "Over 10,000 likes",
      caveat: "B2B company Page with a strong owner personality; figure is approximate.",
      takeaway: "A B2B company framed buying one machine as: second in Taiwan, used for firefighting and rescue, first driven to a temple for blessings, another one to be bought next year; number, public good, local ritual and a teaser together made local pride.",
    },
    question: "What recent big move with a number did you make? How does it connect to the community or everyone?",
    placeholder: "e.g. 100th store opens beside my hometown market / first new machine in Taiwan, will be used for...",
    inputs: {
      topic: { label: "Big move (with number) + connection to the community" },
    },
  },
  "fb-30-pinned-ritual-break": {
    source: {
      short: "蔣萬安 (Chiang Wan-an) typhoon day-off announcement",
      metric: "55,000 likes overnight; over 4,600 comments",
      caveat: "Politician's Page; typhoon-day-off news itself also drives traffic.",
      takeaway: "A practical announcement everyone waits for, long carrying a fixed signature element (a handsome photo every time) that fans turned into an urban legend; once it was deliberately removed, the announcement itself became the topic.",
    },
    question: "What are you announcing? Do your announcements usually carry a fixed signature element?",
    placeholder: "e.g. Mid-Autumn holiday hours change / every announcement includes a photo of the shop cat",
    inputs: {
      topic: { label: "Announcement + usual signature element (write “none” if none)" },
    },
  },
  "fb-30-comment-callback": {
    source: {
      short: "蔣萬安 (Chiang Wan-an) replies to the comment “Where's the handsome photo?”",
      metric: "Next day's post: nearly 3,600 likes and 300+ comments in 15 minutes",
      caveat: "Politician's Page; “replying to a comment” is the media's interpretation.",
      takeaway: "The previous post's comments kept asking “where's the handsome photo?”, so the next post put the photo back; no explanation needed, fans got it was a reply to them, and engagement spiked right away.",
    },
    question: "In your last post's comments, what did most people say or ask for? (paste a few word for word)",
    placeholder: "e.g. “Where's the shop cat?” “When is the last one restocked?” “Why didn't the owner show up?”",
    inputs: {
      topic: { label: "What most people said in the last post's comments, verbatim" },
    },
  },
  "fb-30-album-closeup-riff": {
    source: {
      short: "故宮南院 (National Palace Museum Southern Branch) 《龍藏經》 (Dragon Tripitaka) close-up set",
      metric: "5 close-ups passed 10,000 likes",
      caveat: "Posted on FB, IG and Threads at once; figures not split by platform.",
      takeaway: "When a similar topic elsewhere was hot, they shot their own collection's version as 5 close-ups, one detail each, with a shareable joke (accumulate blessings online); no need to chase the trend itself to get the traffic.",
    },
    question: "What topic is hot right now? What do you have that is similar but only yours?",
    placeholder: "e.g. everyone's queuing for a mooncake / we have a 30-year-old mold",
    inputs: {
      topic: { label: "Hot topic + your own similar item" },
    },
  },
  "fb-30-feed-curiosity-explainer": {
    source: {
      short: "Dr. 李政穎 (Lee Cheng-ying) “Why are surgical gowns green”",
      metric: "Over 10,000 likes",
      caveat: "Doctor's personal professional Page, not a brand; figure is approximate.",
      takeaway: "Open with an everyday observation (“ever notice...”), then give 2 numbered expert reasons; readers feel they finally understood something that puzzled them, so they save, like and share.",
    },
    question: "What does everyone in your field see every day without knowing why?",
    placeholder: "e.g. why bakery bread sits on wooden racks / why you run the AC in fan mode first",
    inputs: {
      topic: { label: "Something common that people don't know the reason for" },
    },
  },
  "fb-30-feed-rare-reunion": {
    source: {
      short: "黃舒駿 (Huang Shu-jun) photo with four other singers",
      metric: "10,000 likes",
      caveat: "Personal account; figure is approximate.",
      takeaway: "A photo of people who normally never appear together, with a question that recounts a number from a new angle (not their combined age but their combined years since debut); nostalgic fans fill in memories in the comments.",
    },
    question: "What people or things do you have that are rarely together?",
    placeholder: "e.g. three master craftsmen with 30 years each on the same shift / four generations of packaging lined up",
    inputs: {
      topic: { label: "Rare people or items together + numbers you can count differently" },
    },
  },
  "fb-30-album-evidence-chain": {
    source: {
      short: "登嘉樓漁業局 (Terengganu Fisheries Department) leatherback turtle returns after 9 years",
      metric: "Over 10,000 likes; 2,700+ shares",
      caveat: "Malaysian government agency Page.",
      takeaway: "Order the photos as an evidence chain: traces first for suspense, then reveal the subject and numbers, finally the follow-up care and timeline; the scarcity of “first in 9 years” drove shares.",
    },
    question: "What good news do you have about something “finally back after a long time”?",
    placeholder: "e.g. a flavor discontinued 5 years ago is back / the old shop sign is fixed and relit",
    inputs: {
      topic: { label: "How long it's been + what's back + next steps" },
    },
  },
  "fb-30-pinned-correction": {
    source: {
      short: "奧萬大情報站 (Aowanda Info Station) AI photo correction apology",
      metric: "Original post had 19,000 likes",
      caveat: "The figure is for the original post, not the correction.",
      takeaway: "When a viral post backfires, write the correction with admission, restored facts, the original kept as a warning, real material added and a systemic commitment, turning a trust crisis into a show of transparency.",
    },
    question: "What needs correcting? What part is true and what part is wrong?",
    placeholder: "e.g. promo photo found over-edited / campaign date announced wrongly",
    inputs: {
      topic: { label: "What went wrong + the true part + the wrong part" },
    },
  },

  // ─── quickTaskFB60.ts (60s) ───
  "fb-60-single-full": {
    question: "What is today's post about?",
    placeholder: "e.g. spring launch / customer thank-you / product lifestyle",
    inputs: {
      topic: { label: "Post topic" },
      feeling: { label: "How should viewers feel?" },
    },
  },
  "fb-60-link-full": {
    question: "Paste the link to share",
    inputs: {
      url: { label: "Link URL" },
      context: { label: "Why share / content summary" },
    },
  },
  "fb-60-album-4": {
    question: "What occasion or topic?",
    placeholder: "e.g. company event, product lifestyle, behind the scenes",
    inputs: {
      occasion: { label: "Occasion / topic" },
    },
  },
  "fb-60-countdown-5day": {
    question: "What is the campaign name?",
    placeholder: "e.g. anniversary sale / product launch / limited-time offer",
    inputs: {
      event_name: { label: "Campaign name" },
      event_date: { label: "Campaign date", placeholder: "e.g. 5/15" },
      key_offer: { label: "Main offer / hook" },
    },
  },
  "fb-60-launch-kit": {
    question: "Campaign name + date?",
    placeholder: "e.g. 5/20 online launch event",
    inputs: {
      event_name: { label: "Campaign name" },
      event_when: { label: "Date / time" },
      event_why: { label: "Why attend / key points" },
    },
  },
  "fb-60-live-suite": {
    question: "What is this livestream about?",
    placeholder: "e.g. product trial / new launch / Q&A",
    inputs: {
      live_topic: { label: "Livestream topic" },
      key_points: { label: "Planned key points (3-5)" },
      live_time: { label: "Livestream time" },
    },
  },
  "fb-60-pinned-suite": {
    question: "What should a new visitor understand about you within 3 seconds?",
    placeholder: "Who we are, what we do, why follow us",
    inputs: {
      brand_focus: { label: "Brand focus" },
    },
  },
  "fb-60-ad-pack-3": {
    question: "What are this campaign's featured product, audience and selling point?",
    placeholder: "e.g. Mother's Day high-protein meal bundle, working moms aged 35-50",
    inputs: {
      campaign: { label: "Campaign topic" },
    },
  },
};

export const VARIANT_LABEL_EN: VariantLabelEnMap = {
  // quickTaskFB.ts
  "情感版": "Emotional",
  "理性版": "Rational",
  "數據版": "Data-driven",
  "反問式": "Rhetorical question",
  "數字式": "Numbers",
  "反差式": "Contrast",
  "資訊式": "Informative",
  "故事式": "Story",
  "問題式": "Question",
  "溫暖式": "Warm",
  "專業式": "Professional",
  "痛點挑戰": "Pain-point challenge",
  "數據驚奇": "Surprising data",
  "反問引發": "Question-led",
  "情境共鳴": "Relatable scene",
  "結果承諾": "Result promise",
  "數據式": "Data",
  "見證式": "Testimonial",
  "簡短直球": "Short and direct",
  "急迫感": "Urgency",
  "利益強調": "Benefit focus",
  "軟性邀請": "Soft invite",
  "對話感": "Conversational",
  "直接動作": "Direct action",
  "數據": "Data",
  "信任強化": "Trust building",
  "簡短直白": "Short and plain",
  "功能訴求": "Feature appeal",
  "情感訴求": "Emotional appeal",
  "故事訴求": "Story appeal",
  "驚喜式": "Surprise",
  "親密式": "Intimate",
  "教學式": "How-to",
  "懸念式": "Suspense",
  "直球式": "Straightforward",
  "曝光導向 (20)": "Reach-focused (20)",
  "品牌導向 (8)": "Brand-focused (8)",
  "利基導向 (12)": "Niche-focused (12)",
  "焦慮式": "Anxiety",
  "FOMO式": "FOMO",
  "期待式": "Anticipation",
  "自嘲開場": "Self-mocking opener",
  "反話術開場": "Reverse-psychology opener",
  "老闆親上陣": "Boss steps in",
  "直接照念": "Read it straight",
  "誇張演出": "Exaggerated acting",
  "反問觀眾": "Ask the audience",
  "成就感版": "Achievement",
  "排名版": "Ranking",
  "時序版": "Chronological",
  "主題版": "By theme",
  "人物版": "By person",
  "懸念版": "Suspense",
  "倒數版": "Countdown",
  "共同決定版": "Decide together",
  "宣言版": "Manifesto",
  "拒絕版": "Refusal",
  "承諾版": "Promise",
  "開條件版": "Set the terms",
  "抬價版": "Raise the offer",
  "拉旁人版": "Pull others in",
  "指名接力版": "Nominate-and-pass",
  "曬成果版": "Show your results",
  "限時共創版": "Limited-time co-creation",
  "誤會開場": "Misunderstanding opener",
  "交換身分": "Role swap",
  "職場梗": "Workplace joke",
  "三級證書版": "Three-tier certificate",
  "限量獎版": "Limited prize",
  "續辦加碼版": "Renewal bonus",
  "處境開場": "Situation opener",
  "結果開場": "Result opener",
  "問句開場": "Question opener",
  "數字開場": "Number opener",
  "場景開場": "Scene opener",
  "預告開場": "Teaser opener",
  "照常帶招牌": "Keep the signature",
  "刻意拿掉招牌": "Drop the signature on purpose",
  "新立招牌": "New signature",
  "輕帶一句": "Light mention",
  "暗號版": "Inside joke",
  "邀下一個梗": "Invite the next joke",
  "細節開場": "Detail opener",
  "來歷開場": "Origin opener",
  "祝福梗開場": "Blessing-joke opener",
  "兩個原因版": "Two reasons",
  "三個原因版": "Three reasons",
  "延伸冷知識版": "Extra trivia",
  "年資算法": "By years of service",
  "次數算法": "By count",
  "距離算法": "By distance",
  "懸念開場": "Suspense opener",
  "睽違開場": "Long-absence opener",
  "直接認錯版": "Admit it directly",
  "還原經過版": "Retell what happened",
  "制度承諾版": "Process commitment",
  // quickTaskFB60.ts
  "預告 1": "Teaser 1",
  "預告 2": "Teaser 2",
  "當日": "Day of",
  "事後": "Afterward",
  "預告": "Teaser",
  "開場宣告": "Opening announcement",
  "爆點 1": "Highlight 1",
  "爆點 2": "Highlight 2",
  "爆點 3": "Highlight 3",
  "精華回顧": "Highlights recap",
  "釘選主文": "Pinned main post",
  "常見問答 FAQ": "FAQ",
  "關於我們 About": "About us",
  "代表案例（客戶成功故事）": "Featured case (customer success story)",
  "情感切角": "Emotional angle",
  "理性切角": "Rational angle",
  "反差切角": "Contrast angle",
  "相簿版": "Album",
};
