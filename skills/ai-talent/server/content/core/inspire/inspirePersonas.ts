/**
 * 醫師自媒體示範頁的「說話風格」——四個平台 × 台灣／美國，每格兩種。
 *
 * 2026-10-07（CJ「跨 facebook、youtube、instagram、tiktok 的網紅，從台灣和美國的排行榜當中
 * 選各平台最有名的人，進行人設 agent 的模擬」→「真實網紅名字不要露出」）。
 *
 * 這個檔案刻意不寫任何真實人名：風格只描述看得到的手法（怎麼開場、怎麼安排、用什麼語氣），
 * 提示詞裡沒有名字，模型就寫不出名字。每個風格參考的是哪一位、出自哪一份排行榜、哪些特徵
 * 是查證過的、哪些是推論，記在 docs/inspire-doctor-demo-sources.md，由內部審查，不送到前端。
 *
 * 風格只管「怎麼說」。醫療內容、事實白名單、法規都由 doctorInspire.ts 的規則管，
 * 所以 style 裡不要寫任何醫療主張。
 */

export type InspirePlatform = "facebook" | "youtube" | "instagram" | "tiktok";
export type InspireMarket = "tw" | "us";

export interface InspirePersona {
  key: string;
  platform: InspirePlatform;
  market: InspireMarket;
  /** 卡片上的風格名（不含人名）。 */
  label: string;
  /** 一句話說這個風格怎麼說話（卡片副標）。 */
  pitch: string;
  /** 這個風格一定要先回答的問題——答案就是切角的錨，逼不同風格想出不同的東西。 */
  question: string;
  /** 給模型的手法描述。 */
  style: string;
}

export const INSPIRE_PERSONAS: InspirePersona[] = [
  // ── YouTube ──
  {
    key: "yt-us-challenge", platform: "youtube", market: "us",
    label: "大型挑戰實驗型", pitch: "把一件事變成有規則、有期限的挑戰",
    question: "這個議題可以變成哪一個有天數、有規則、看得到結果的挑戰？",
    style: "標題先想好，而且內容要完全兌現標題；標題用具體的數字與極端但真實的設定（幾天、幾次）。開場一分鐘內把前提與規則講完，之後一關比一關進一步，最後交代結果。句子短、用字簡單、語氣有能量，沒有冷場。醫師版的挑戰只能是安全、人人做得到的事（例如連續幾天照同一個方法量、記錄），不能拿健康冒險。",
  },
  {
    key: "yt-us-engineer", platform: "youtube", market: "us",
    label: "工程科普實驗敘事型", pitch: "先給你看結果，再帶你走一遍怎麼弄懂的",
    question: "這個議題裡，哪一個原理可以用一個生活裡的東西比喻清楚？",
    style: "開場先丟出一個讓人意外的說法或成品，接著說「我們一步一步看」。第一人稱、像親切的老師，專有名詞一定用生活裡的東西打比方。結構是：問題 → 常見的錯誤做法 → 修正 → 驗證 → 帶走一句話。幽默是自嘲式、闔家都能看。結尾收在好奇心與學到的事。",
  },
  {
    key: "yt-tw-local", platform: "youtube", market: "tw",
    label: "台味搞笑生活實測型", pitch: "用鄰居聊天的口氣，把迷思拿來實測",
    question: "關於這個議題，台灣人最常掛在嘴邊、其實沒驗證過的說法是哪一句？",
    style: "國語夾一點台語語感的口語，像巷口鄰居在聊天；自嘲、接地氣，把知識包在好笑的日常裡。常用「實測／破解迷思」的單元感：先講大家都這樣說，再親自對照一次。節奏快、分段清楚，每段有一句可以上大字幕的重點。開場是有精神的打招呼。不用任何特定人物的口頭禪。",
  },
  {
    key: "yt-tw-outsider", platform: "youtube", market: "tw",
    label: "外人視角大型企劃型", pitch: "像第一次接觸的人一樣問問題，再辦成一場企劃",
    question: "一個完全不懂的人，第一次聽到這個議題會問哪一個最直白的問題？",
    style: "主持人用外來者的好奇心看事情：把大家習以為常的做法當成新鮮事來問，好奇本身就是笑點。內容設計成一場有前提、有關卡、有結局的企劃（例如找幾個人一起做同一件事再比較），每一段結尾留一個懸念帶到下一段。標題帶企劃名稱與這一集的看點。",
  },

  // ── Facebook ──
  {
    key: "fb-us-moral", platform: "facebook", market: "us",
    label: "寓言反轉短劇型", pitch: "先讓錯的做法佔上風，再用反轉收一句道理",
    question: "這個議題裡，哪一個「大家以為沒差」的做法，最後會讓人後悔？",
    style: "把內容寫成一段有角色的小故事：前半段讓一個常見的錯誤想法看起來很有道理，後半段出現反轉，最後明白說出一句道理，而且重複一次。用字簡單到九歲到九十九歲都看得懂，不用反諷。角色是泛稱的虛構人物（例如「一位總說自己沒事的上班族」），不能寫成真實病例。",
  },
  {
    key: "fb-us-storyteller", platform: "facebook", market: "us",
    label: "邊做事邊講懸案型", pitch: "像跟朋友聊八卦一樣，把一件事當謎團講到底",
    question: "這個議題裡，哪一個現象可以當成一個「到底為什麼」的謎團來講？",
    style: "開頭像跟朋友打招呼一樣親切，然後把主題當成一樁懸案：先交代背景，再照時間順序一路講，邊講邊加自己的反應與旁白，最後揭曉答案與後續。句子偏長、口語、有插話，像邊做手邊的事邊聊天。題材再嚴肅，語氣也保持輕鬆但尊重。",
  },
  {
    key: "fb-tw-neighborhood", platform: "facebook", market: "tw",
    label: "台味生活碎念型", pitch: "從一件生活小事開始碎念，念到重點",
    question: "這個議題在台灣人的日常裡，最常出現在哪一個場合（餐桌、早餐店、家族群組）？",
    style: "從一個很台灣的生活場景開場（餐桌、早餐店、長輩群組的訊息），用碎念、吐槽的口氣寫，自嘲多於說教；段落短，像在跟粉絲聊天。中段把碎念轉成一個清楚的重點，結尾丟一個讓人想留言的問題（「你家也這樣嗎？」這一類）。",
  },
  {
    key: "fb-tw-daily-comic", platform: "facebook", market: "tw",
    label: "日常無厘頭圖文型", pitch: "一個好笑的日常畫面，配一句意外的話",
    question: "這個議題有哪一個日常畫面，本身就有點好笑？",
    style: "用一個具體、有畫面的日常小片段開場，字很少、節奏很快，笑點靠畫面與落差，不靠說明。每段一兩句，像圖文貼文的旁白；最後才用兩三句把笑點接回正經的重點。語氣輕鬆無害，不嘲笑任何人。",
  },

  // ── Instagram ──
  {
    key: "ig-us-routine", platform: "instagram", market: "us",
    label: "自律晨間儀式型", pitch: "用時間戳與第幾天，把一個習慣拍成儀式",
    question: "這個議題可以拆成哪幾個有固定時間點的動作？",
    style: "用「第幾天」加上時間範圍當標題，內容照時間戳一格一格往下走，每一格是一個重複的小儀式。語氣認真、精煉、有嚮往感，話很少，靠時間點推節奏。主軸是「一個小習慣持續下去會改變生活」。儀式只能是安全的日常動作，時間不要誇張到不合理。",
  },
  {
    key: "ig-us-chatty", platform: "instagram", market: "us",
    label: "邊準備邊聊天日常型", pitch: "一邊做手邊的事，一邊像朋友一樣講今天的事",
    question: "關於這個議題，醫師私下最想跟朋友講的一句真心話是什麼？",
    style: "對著鏡頭邊準備出門邊聊天的口氣：語速快、像在跟朋友講今天發生的事，會自己打斷自己、補一句真心話。內容是一段有頭有尾的碎片式回顧，重點是順口帶出來的，不是條列。說明文字短、隨興。",
  },
  {
    key: "ig-tw-family", platform: "instagram", market: "tw",
    label: "家庭日常紀錄型", pitch: "家人是固定班底，重點藏在家裡的對話裡",
    question: "這個議題在家裡會是誰跟誰的對話？",
    style: "把家人當固定班底（長輩、另一半、小孩，都用泛稱），內容是一段家裡的對話或小事件，口氣溫暖又愛開玩笑。每張卡像一格生活照的圖說，短、口語；最後一張把笑點收成一句實用的提醒。",
  },
  {
    key: "ig-tw-selfmock", platform: "instagram", market: "tw",
    label: "自嘲系生活搞笑型", pitch: "先笑自己，再把話說清楚",
    question: "關於這個議題，醫師自己也犯過、可以拿來自嘲的是哪一件事？",
    style: "先拿自己開玩笑（「我自己也……」），讓人放下戒心，再把正確的做法講清楚。用字年輕、口語、有梗但不低級；每張卡一句話，反差越大越好。自嘲的只能是無傷大雅的生活習慣，不能編造醫師的病史或看診經歷。",
  },

  // ── TikTok ──
  {
    key: "tt-us-visual-twist", platform: "tiktok", market: "us",
    label: "視覺反轉魔術型", pitch: "不靠說話，靠一個意想不到的畫面",
    question: "這個議題可以用哪一個「看起來正常、下一秒不一樣」的畫面說完？",
    style: "幾乎不講話，靠畫面說故事：一個平凡的開場畫面 → 一個意想不到的視覺轉折 → 一個很快的收尾。腳本要把每一個畫面寫清楚，口白只留一兩句、其餘用字卡。說明文字是一句俏皮話或一個問題，適合重複播放。",
  },
  {
    key: "tt-us-trend", platform: "tiktok", market: "us",
    label: "流行音樂跟拍型", pitch: "跟著當紅的音樂，重點全放在字卡上",
    question: "這個議題最短可以濃縮成哪三句字卡？",
    style: "不說開場白，音樂的第一拍就是開場；人在鏡頭前做簡單的動作或手勢，重點全部用跟著節拍出現的字卡帶。一鏡到底、正面拍。說明文字很短、很隨興，幾個字加一個表情符號。腳本只寫「用當下流行的音樂」，不要指定任何歌名。",
  },
  {
    key: "tt-tw-result-first", platform: "tiktok", market: "tw",
    label: "結果先給變身型", pitch: "前三秒先給你看結果，再教你怎麼做",
    question: "這個議題做對之後的「結果畫面」是什麼？",
    style: "三秒原則：第一個畫面就是做對之後的結果，接著才回頭教怎麼做。畫面明亮乾淨、節奏快、效果誇張一點沒關係，最重要的是有趣。步驟一個一個給，每一步配一個清楚的畫面。跟著當下流行的格式改編。",
  },
  {
    key: "tt-tw-daily-gag", platform: "tiktok", market: "tw",
    label: "日常無厘頭短片型", pitch: "一個生活小片段，一個沒想到的收尾",
    question: "這個議題在生活裡哪一個小片段，可以有一個沒想到的收尾？",
    style: "話很少，靠一個生活小片段與意外的收尾讓人笑出來；搭配當下流行的音樂（不指定歌名），不需要聽得懂語言也看得懂。最後用一張字卡把笑點接回一句正經的提醒。說明文字短，幾個通用的 hashtag。",
  },
];

export const PERSONA_KEYS: string[] = INSPIRE_PERSONAS.map((p) => p.key);

export function personaOf(key: string): InspirePersona | undefined {
  return INSPIRE_PERSONAS.find((p) => p.key === key);
}
