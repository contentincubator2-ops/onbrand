/**
 * fill-framework-agent-methodology — 幫「方法論策略副總裁」族補上方法論全文與代表案例。
 *
 * 2026-09-24（CJ「幫這族補資料（在 mos_db 寫入方法論全文與代表案例，走 admin
 * workflow）」）：
 *
 * 這一族（id 238xxx–239xxx）是以方法論命名的策略顧問，問題是 mos_db 裡
 * `methodology` 欄位只有一個關鍵字（例如 "jobs-to-be-done"，4–54 字）、
 * `experienceDetail` 幾乎都是空的。剛做好的「查看背景」面板對他們只顯示得出
 * 一句 bio，看起來像壞掉。
 *
 * ── 一條刻意的界線 ────────────────────────────────────────────────────
 * 方法論全文：寫真的。這些都是公開框架（JTBD / Kano / VPC / FAB / Means-End /
 * PMF / Play Bigger / Dunford / STP），寫出它的步驟、什麼時候用、產出什麼，
 * 是知識，不是編造。
 *
 * 代表案例：**不編客戶戰績**。mos_db 已經有一批 agent 的 caseStudies 是
 * 「創勢行銷 — 轉換率提升 63%」這種共用樣板＋隨機百分比的合成案例（同一家
 * 公司在不同 agent 身上是不同數字），那種東西顯示給使用者看就是假的。這裡
 * 只寫兩種：
 *   1. 有出處的公開經典案例（Christensen 的奶昔研究、狩野紀昭 1984 論文…），
 *      data_source 標明來源；
 *   2. 明確標示為「方法論示例，非客戶案例」的應用場景。
 * client 欄位一律不寫成某個客戶的名字。
 *
 * 安全：只動指定的 id；預設只在欄位「本來就沒有內容」時才寫（--force 才覆蓋）；
 * --dry-run 只印不寫。
 *
 * 用法：./node_modules/.bin/tsx scripts/fill-framework-agent-methodology.ts [--dry-run] [--force]
 */
import localPool from "../server/localDb.js";

interface CaseStudy {
  title: string; client: string; problem: string; solution: string; result: string; data_source: string;
}
interface Fill { id: number; label: string; methodology: string; caseStudies: CaseStudy[] }

const EXAMPLE_CLIENT = "（方法論示例，非客戶案例）";

const FILLS: Fill[] = [
  {
    id: 238853,
    label: "產品價值主張副總裁（Osterwalder 價值主張圖）",
    methodology: `【價值主張圖 Value Proposition Canvas】

這張圖只有兩半，左右對得上才叫有價值主張。

右半：顧客輪廓（Customer Profile）
1. 顧客任務（Jobs）——他要完成什麼？分成功能任務、社會任務（別人怎麼看他）、情緒任務（他想有什麼感覺）。
2. 痛點（Pains）——完成這件事的過程中，什麼讓他不爽、有風險、做不到。
3. 獲益（Gains）——他期待什麼結果？分必要的、期望的、意料之外的。
三者各自排序：哪個任務最重要、哪個痛最嚴重、哪個獲益最關鍵。不排序就等於沒做。

左半：價值地圖（Value Map）
4. 產品與服務（Products & Services）——你實際交付什麼。
5. 痛點解方（Pain Relievers）——你怎麼消掉他具體的哪個痛。
6. 獲益創造（Gain Creators）——你怎麼製造他期待的那個結果。

對齊（Fit）
7. 逐條連線：每個 Pain Reliever 對到哪個 Pain？連不到的就是自嗨功能。
8. 只解決「不重要的痛」不算 Fit；要對上排序最前面的那幾條。
9. 三層 Fit 依序驗證：紙上 Fit（邏輯對得上）→ 市場 Fit（顧客說他要）→ 商業 Fit（有人願意付錢且賺得到）。

常見誤用：把 Products & Services 寫成一長串功能清單，右半只寫三個形容詞。右半寫不滿，左半再漂亮都是假的。`,
    caseStudies: [
      {
        title: "價值主張圖的原始出處與用法",
        client: EXAMPLE_CLIENT,
        problem: "團隊講得出產品功能，但講不出顧客為什麼要買；每個人口中的目標客戶都不一樣。",
        solution: "先做右半顧客輪廓（任務／痛點／獲益並排序），再回頭檢查左半的每一項功能對應到哪一條痛點或獲益，連不上的標記為待驗證。",
        result: "產出一份逐條對齊的價值主張敘述，以及一份「沒有對應顧客痛點的功能」清單，作為後續取捨依據。",
        data_source: "Osterwalder, Pigneur, Bernarda & Smith《Value Proposition Design》（2014）；Strategyzer 公開教材",
      },
    ],
  },
  {
    id: 238857,
    label: "Kano 產品策略副總裁",
    methodology: `【Kano 模型：品質要素分類】

核心主張：功能做得好不好，跟顧客滿不滿意，不是線性關係。同一個功能，依它落在哪一類，投資報酬完全不同。

五類品質要素
1. 當然品質（Must-be）——有了不會加分，沒有會爆炸。例如冷凍食品的低溫配送完整。
2. 一元品質（One-dimensional）——做得越好越滿意，通常也是顧客講得出來的需求。例如份量、價格。
3. 魅力品質（Attractive）——沒有不會扣分，有了驚喜。這是差異化的來源，但顧客不會主動說出來。
4. 無差異品質（Indifferent）——做不做都沒感覺。最容易被誤投資的一類。
5. 反轉品質（Reverse）——你以為是加分，對某群人反而扣分。

操作方式
6. 每個功能問兩題（正向問法：有這個功能你覺得如何？反向問法：沒有這個功能你覺得如何？），答案各五選一。
7. 兩題答案交叉查表，得出這個功能屬於哪一類。樣本不用大，20–30 個目標顧客就看得出分布。
8. 算兩個係數：滿意度影響（Better）與不滿意度影響（Worse），畫成四象限決定投資順序。

產品組合上的用法
9. 當然品質沒做好，先補洞，其他都不用談。
10. 一元品質決定你在價格帶的位置。
11. 魅力品質會隨時間衰減成當然品質（今天的驚喜是明天的標配），所以要定期重測。`,
    caseStudies: [
      {
        title: "Kano 模型的原始研究",
        client: EXAMPLE_CLIENT,
        problem: "品質改善投資難以排序：不知道哪些功能做得更好會真的提升滿意度，哪些做了也沒人在意。",
        solution: "以正向／反向兩段式問卷對每個品質要素提問，交叉分類為當然、一元、魅力、無差異、反轉五類，再據此排投資順序。",
        result: "建立「功能 → 品質類別 → 投資優先序」的判斷依據，取代憑直覺排功能。",
        data_source: "狩野紀昭等《魅力的品質と當り前品質》，日本品質管理學會誌（1984）",
      },
    ],
  },
  {
    id: 239174,
    label: "JTBD 產品定位副總裁",
    methodology: `【Jobs-to-be-Done：從「被雇用來完成什麼工作」定義產品】

核心主張：顧客不是買產品，是「雇用」產品來完成一件他生活裡的工作。同一個產品，在不同情境下被雇用的理由完全不同。

定義工作
1. 工作要寫成情境句，不是人口統計：「當我___（情境），我想要___（動機），這樣我才能___（期待的結果）」。
2. 工作有三層：功能面（要解決什麼）、情緒面（想有什麼感覺）、社會面（想被怎麼看）。三層都要寫。
3. 競品不是同類產品，是「顧客可能改用的所有方案」——包含什麼都不做。

找出工作
4. 訪談的是「最近剛買的人」，不是潛在客戶。要挖的是購買當下那一刻。
5. 四股力量：推力（現狀的不滿）、拉力（新方案的吸引）、慣性（既有習慣）、焦慮（換過去的擔心）。買了＝前兩股贏了後兩股。
6. 時間線還原：從「第一次意識到問題」到「下單」中間發生了什麼事，逐一問出來。

應用到產品組合
7. 每個品項各自回答：它被雇用來完成哪個工作？兩個品項如果對應同一個工作，就是互相蠶食。
8. 賣不動的品項通常不是品質問題，是「沒有對應到任何一個真實的工作」，或「那個工作已經有更方便的方案」。
9. 定位語言要用顧客描述工作的話，不是內部的產品分類。`,
    caseStudies: [
      {
        title: "奶昔困境：同一個產品，不同的工作",
        client: EXAMPLE_CLIENT,
        problem: "速食店想提升奶昔銷量，用人口統計分眾與口味改良都沒有明顯效果。",
        solution: "改問「顧客是在什麼情境下買奶昔」，發現清晨購買者是為了在通勤路上單手解決無聊與飢餓——奶昔被雇用的工作，競爭對手其實是香蕉與貝果。",
        result: "產品改良方向從「更好喝」轉為「更耐喝、單手好拿」，也讓早晨與下午的兩種工作被分開處理。",
        data_source: "Clayton Christensen《Competing Against Luck》（2016）與哈佛商學院相關教學案例",
      },
    ],
  },
  {
    id: 238855,
    label: "JTBD 產品策略副總裁",
    methodology: `【JTBD 產品策略：用工作定義產品該長什麼樣】

跟「用 JTBD 做定位」同源，但這一段專注在產品決策——做什麼、不做什麼、先做什麼。

工作地圖（Job Map）
1. 把一個工作拆成八段通用流程：定義 → 定位 → 準備 → 確認 → 執行 → 監控 → 修正 → 完成。
2. 每一段問：顧客在這裡卡在哪？現在他用什麼土法煉鋼？
3. 卡最久、最痛、最多人繞路的那一段，就是產品機會。

成果指標（Desired Outcomes）
4. 把顧客想要的結果寫成可量測句型：「把___的時間縮到最短」「把___出錯的機率降到最低」。
5. 每個成果量兩個分數：重要度、目前滿意度。
6. 機會分數 ＝ 重要度 ＋（重要度 － 滿意度），分數高的是「很重要但現在很爛」——那是該投資的地方。

用在產品組合
7. 同一個工作底下，不同品項應該負責不同段落，而不是重複同一段。
8. 一個品項賣不動，先確認它對應的成果分數：如果重要度本來就低，做再多行銷也救不起來。
9. 換人訪談的對象要包含「買了又不再買的人」——他們最能講出工作沒被完成的地方。`,
    caseStudies: [
      {
        title: "成果導向創新（ODI）的量化邏輯",
        client: EXAMPLE_CLIENT,
        problem: "新功能點子很多，但沒有客觀依據決定先做哪一個。",
        solution: "將顧客想要的結果寫成可量測的成果句，調查重要度與滿意度，計算機會分數並排序。",
        result: "產出一份以機會分數排序的清單，讓「該做什麼」有數字依據而非會議聲量。",
        data_source: "Anthony Ulwick《What Customers Want》（2005）／Outcome-Driven Innovation 公開方法論",
      },
    ],
  },
  {
    id: 238856,
    label: "FAB 產品定位副總裁",
    methodology: `【FAB：把規格翻譯成顧客聽得懂的理由】

核心主張：內部講規格，顧客買利益。中間那層轉譯沒做，商品頁就會變成沒人讀的功能清單。

三層轉譯
1. Feature（特色）——客觀事實，可驗證。例如「零下 18 度急速冷凍」。
2. Advantage（優勢）——這個事實造成什麼差別。例如「細胞不被冰晶破壞，解凍後不出水」。
3. Benefit（利益）——對這位顧客的生活造成什麼改變。例如「不用會煮菜，加熱五分鐘端上桌不會柴」。

寫法紀律
4. 每個 Feature 都要往下走完兩步，走不完的代表這個規格對顧客沒有意義，商品頁就不該花篇幅寫。
5. Benefit 要用顧客的語言，不是產業術語；最好能對應到一個具體場景。
6. 同一個 Feature 對不同客群可以推出不同 Benefit——分眾寫法就是從這裡來的。
7. 順序：商品頁先講 Benefit（抓住），再講 Advantage（說服），最後放 Feature（支撐與比較）。反過來寫就是規格表。

檢查方式
8. 把整段文案的每一句標記為 F / A / B，如果九成是 F，這頁在賣規格不是賣產品。
9. 每個 Benefit 後面能不能接一句「所以你可以___」？接不上就還不是利益。`,
    caseStudies: [
      {
        title: "FAB 在商品頁的典型應用",
        client: EXAMPLE_CLIENT,
        problem: "商品頁把製程與規格寫得很完整，但轉換率偏低，顧客看完不知道跟自己有什麼關係。",
        solution: "逐句標記 F／A／B，將只有規格的段落補上「造成什麼差別」與「對你的生活有什麼改變」，並把利益句提到頁面最前。",
        result: "產出一份以利益開頭、規格殿後的頁面結構，以及一份「沒有對應利益的規格」清單。",
        data_source: "FAB 為銷售訓練領域長期沿用的古典框架，無單一原始出處；此處記錄的是通用操作方式",
      },
    ],
  },
  {
    id: 238854,
    label: "產品利益階梯副總裁（Means-End Chain）",
    methodology: `【手段—目的鏈 Means-End Chain：從屬性一路爬到價值觀】

核心主張：人買的不是屬性，是屬性最終帶他到的那個自我形象。中間的每一階都要接得上。

六階
1. 具體屬性（Concrete Attribute）——看得到摸得到的：部位、克數、產地。
2. 抽象屬性（Abstract Attribute）——被感知的品質：新鮮、高級、乾淨。
3. 功能利益（Functional Benefit）——省了什麼、得到什麼：五分鐘上桌。
4. 心理利益（Psychosocial Benefit）——感覺與他人眼光：不手忙腳亂、被說會做菜。
5. 工具性價值（Instrumental Value）——他想成為什麼樣的人：有餘裕、有品味。
6. 終極價值（Terminal Value）——他要的人生狀態：家庭時光、自我實現。

怎麼問出來（階梯訪談 Laddering）
7. 從「你為什麼選這個」開始，每個回答後面再追問一次「那對你來說為什麼重要」，重複到對方講不出更上一層為止，通常 4–6 輪。
8. 訪談 15–20 人，把所有鏈條疊成一張「階層價值地圖（HVM）」，看哪條路徑最多人走。
9. 出現最頻繁的那條鏈，就是主訴求；斷掉的那一階，就是文案要補的地方。

用在產品組合
10. 同一個終極價值可以由不同屬性入口抵達——這是把冷門品項接上熱賣品項的方法：不換價值，換入口。`,
    caseStudies: [
      {
        title: "階梯訪談與階層價值地圖",
        client: EXAMPLE_CLIENT,
        problem: "顧客講得出喜歡什麼屬性，但品牌不知道那些屬性最終連到什麼價值，文案只能停在規格層。",
        solution: "以階梯訪談逐層追問「那為什麼重要」，把個別鏈條彙整成階層價值地圖，找出最多人走的屬性—利益—價值路徑。",
        result: "得到一條可被文案直接使用的主訴求路徑，以及數條可供分眾使用的次要路徑。",
        data_source: "Jonathan Gutman, “A Means-End Chain Model Based on Consumer Categorization Processes”, Journal of Marketing（1982）；Reynolds & Gutman 的 laddering 方法（1988）",
      },
    ],
  },
  {
    id: 238861,
    label: "PMF 產品驗證副總裁",
    methodology: `【產品市場適配 PMF：先證明有，再談放大】

核心主張：PMF 之前做成長是浪費錢。要先有客觀訊號證明「市場在拉你」，才值得往上加油門。

怎麼量
1. 四成法則（Sean Ellis Test）：問已使用過的顧客「如果明天不能再用這個產品，你會多失望？」，回答「非常失望」超過 40%，是 PMF 的常見門檻。
2. 留存曲線要走平：同一批顧客的留存率在某個水準打平，代表有一群人真的留下；持續下滑到接近零，就是還沒有。
3. 有機成長比例：不靠付費廣告來的訂單佔比，以及口碑推薦的比例。

驗證流程
4. 先定義「誰」——PMF 永遠是對某一群人成立，不是對所有人。把樣本限縮在那群人再量。
5. 分開看「首次購買」與「重複購買」：只有首購撐起來的產品通常是行銷在推，不是產品在拉。
6. 拿「非常失望」那群人的共同特徵，寫成一句話的目標客群描述。

三選一的決策
7. Pivot——訊號很弱且訪談指不出方向：換問題或換客群。
8. Persevere——訊號在特定小群體很強：先為那群人把產品做深，不要急著擴散。
9. Scale——訊號穩定且留存打平：這時候才把預算放到獲客上。

用在產品組合
10. 每個品項各自量一次，不要用整體營收掩蓋個別品項的無適配。`,
    caseStudies: [
      {
        title: "四成法則與留存曲線的判讀",
        client: EXAMPLE_CLIENT,
        problem: "營收有成長，但不確定是產品真的被需要，還是廣告預算推出來的。",
        solution: "對已使用顧客施測「不能再用會多失望」，同時拆分首購與回購、檢查同批顧客的留存曲線是否走平。",
        result: "得到 pivot／persevere／scale 三選一的客觀依據，避免在尚未適配前擴大投放。",
        data_source: "Sean Ellis 的 Product/Market Fit Survey（2009 起公開推廣）；Marc Andreessen “The only thing that matters”（2007）對 PMF 的定義",
      },
    ],
  },
  {
    id: 238845,
    label: "品類設計策略副總裁（Play Bigger）",
    methodology: `【品類設計 Category Design：不要在別人的品類裡比較好，要定義新的品類】

核心主張：市場獎勵的是定義品類的人，不是在既有品類裡做得比較好的人。品類王通常拿走該品類多數的市值。

四件事同時做
1. 品類（Category）——你要定義的新空間叫什麼、解決什麼「以前沒被命名的問題」。
2. 公司（Company）——內部資源、組織、商業模式要跟這個品類對齊。
3. 產品（Product）——產品必須是這個品類的最佳示範，不是既有品類的改良版。
4. 生態（Ecosystem）——分析師、媒體、社群、通路要一起接受這個命名。

操作順序
5. 先寫「品類敘事（Point of View）」：世界有什麼問題沒被解決 → 為什麼舊方案不夠 → 我們主張的新做法叫什麼。
6. 命名要能被複述。名字沒被別人講出來，品類就不存在。
7. 閃電戰（Lightning Strike）：集中資源在一次高聲量事件把品類名稱打進市場，而不是長期分散小額曝光。
8. 用「品類提問」取代「產品比較」：讓顧客問的問題從「你比 A 好在哪」變成「這是什麼？我需要嗎？」

用在產品組合
9. 單一爆品代表市場在某個品類上認得你。要判斷的是：你要成為「那個品項」的代表，還是要定義一個更大的品類，讓那個品項只是其中一員。`,
    caseStudies: [
      {
        title: "品類設計的核心主張與品類王現象",
        client: EXAMPLE_CLIENT,
        problem: "產品在既有品類中被拿來跟競品逐項比較，永遠落入功能與價格的比較框架。",
        solution: "改以品類敘事定義一個尚未被命名的問題空間，讓產品成為該品類的示範，並同步推動生態（媒體、分析師、社群）採用這個命名。",
        result: "競爭框架從「同類比較」轉為「這是什麼、我需不需要」，論述主導權回到品牌手上。",
        data_source: "Ramadan, Peterson, Lochhead & Maney《Play Bigger》（2016）",
      },
    ],
  },
  {
    id: 238864,
    label: "Dunford 定位策略副總裁（Obviously Awesome）",
    methodology: `【April Dunford 十步定位法】

核心主張：定位不是寫一句標語，是決定「把產品放進哪個脈絡裡，別人才會秒懂它為什麼值錢」。同一個產品換一個脈絡，價值感完全不同。

十步
1. 先放下既有的定位敘述——包括創辦故事與現有文案帶來的包袱。
2. 列出最愛你的顧客：買得快、續約高、會推薦給別人的那幾個。他們的共同點才是線索。
3. 列出競爭替代方案：如果你不存在，他們會用什麼？包含 Excel、人工、什麼都不做。
4. 找出你獨有的能力：對照替代方案，你有什麼是他們沒有的（功能、資料、服務、規模）。
5. 把能力翻譯成價值：這個能力讓顧客得到什麼結果。
6. 找出誰最在乎這個價值：在乎的人組成你的目標區隔，不在乎的人不是你的客戶。
7. 決定市場類別（Market Category）：你要被放在哪個貨架上。這一步決定顧客的預期與比較基準。
8. 視情況加上趨勢：讓產品搭上顧客已經在關心的浪，但不要為了趕流行犧牲清楚。
9. 把以上寫成一份可被全公司引用的定位文件，不是一句 slogan。
10. 用定位驅動下游：網站訊息、銷售話術、產品路線圖、定價。

檢查
11. 定位對了的徵兆：銷售週期變短、顧客自己講得出你是什麼、比較的對象換了一批。`,
    caseStudies: [
      {
        title: "換貨架：市場類別決定價值感",
        client: EXAMPLE_CLIENT,
        problem: "產品功能強，但被放在一個競爭者眾多的既有類別裡，顧客只會拿功能與價格逐項比較。",
        solution: "依十步流程重新盤點最愛的顧客、真正的競爭替代方案與獨有能力，改選一個能凸顯該能力的市場類別，再重寫全站訊息。",
        result: "比較基準改變，銷售對話從功能比價轉為「為什麼需要這種東西」。",
        data_source: "April Dunford《Obviously Awesome》（2019）",
      },
    ],
  },
  {
    id: 238878,
    label: "Segmentation 策略副總裁（STP）",
    methodology: `【STP：分眾、選眾、定位】

核心主張：對所有人講話等於對沒有人講話。先把市場切開，選一塊你贏得了的，再為那塊寫定位。

S — 分眾（Segmentation）
1. 四類切法並用：人口統計（誰）、地理（在哪）、心理（在乎什麼）、行為（怎麼買、買多少、多常買）。
2. 對消費品而言，行為與心理通常比人口統計更會分：購買頻率、使用場景、價格敏感度。
3. 好的區隔要同時滿足：夠大（值得做）、可辨識（找得到人）、可觸及（買得到媒體）、有差異（對行銷反應不同）、穩定（不會下個月就變）。

T — 選眾（Targeting）
4. 逐個區隔評估：規模、成長、競爭密度、我方勝率、獲取成本。
5. 三種策略：集中（只打一塊）、差異化（多塊各自訊息）、無差異（同一套打全部）。資源有限就集中。
6. 選定之後要寫下「我們不服務誰」——寫不出來代表還沒選。

P — 定位（Positioning）
7. 對選定區隔寫定位聲明：對（目標客群），我們的（品類）提供（關鍵利益），因為（支撐理由）。
8. 畫知覺地圖確認你站的位置沒人佔，而且那個位置是顧客在乎的軸。

用在產品組合
9. 不同品項可以服務不同區隔，但每個品項要講得出它是給誰的；講不出來的品項，通常就是賣不動的那幾個。`,
    caseStudies: [
      {
        title: "STP 的標準操作順序",
        client: EXAMPLE_CLIENT,
        problem: "行銷訊息對所有人說同一套，成效平庸，內部對「我們的客戶是誰」沒有共識。",
        solution: "以行為與心理變數切分市場，逐一評估規模、競爭與勝率後選定目標區隔，並針對該區隔撰寫定位聲明與知覺地圖。",
        result: "產出可被全公司引用的目標客群定義與定位聲明，以及一份明確的「不服務誰」清單。",
        data_source: "Philip Kotler《Marketing Management》系列對 Segmentation–Targeting–Positioning 的標準闡述",
      },
    ],
  },
];

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

/** 原本就有像樣內容的欄位不覆蓋——這批的 methodology 是一個關鍵字（4–54 字），
 *  所以門檻設 120 字：低於這個就是佔位，高於的代表有人寫過，別蓋掉。 */
const MEANINGFUL_METHODOLOGY_CHARS = 120;

async function main() {
  console.log(`模式：${DRY_RUN ? "DRY RUN（只印不寫）" : "實際寫入"}${FORCE ? "／FORCE（覆蓋既有內容）" : "／只補空的"}`);
  let filled = 0, skipped = 0, missing = 0;

  for (const f of FILLS) {
    const [rows]: any = await localPool.execute(
      `SELECT id, slug, name_zh, name, title_zh, methodology, caseStudies FROM agents WHERE id = ? LIMIT 1`, [f.id],
    );
    const a = (rows as any[])[0];
    if (!a) { console.log(`✗ #${f.id} ${f.label}：mos_db 裡沒有這個 agent，跳過`); missing++; continue; }

    const curMeth = String(a.methodology ?? "");
    const curCases = a.caseStudies ? (typeof a.caseStudies === "string" ? a.caseStudies : JSON.stringify(a.caseStudies)) : "";
    const hasMeth = curMeth.length >= MEANINGFUL_METHODOLOGY_CHARS;
    const hasCases = curCases.length > 10 && curCases !== "null" && curCases !== "[]";

    if (!FORCE && hasMeth && hasCases) {
      console.log(`- #${f.id} ${a.name_zh || a.name}：已經有內容（methodology ${curMeth.length} 字、caseStudies ${curCases.length} 字），跳過`);
      skipped++; continue;
    }

    console.log(`+ #${f.id} ${a.name_zh || a.name}｜${a.title_zh}`);
    console.log(`    methodology：${curMeth.length} 字 → ${f.methodology.length} 字`);
    console.log(`    caseStudies：${hasCases ? `${curCases.length} 字` : "(空)"} → ${f.caseStudies.length} 則（出處：${f.caseStudies[0]!.data_source.slice(0, 40)}…）`);
    if (!DRY_RUN) {
      await localPool.execute(
        `UPDATE agents SET methodology = ?, caseStudies = CAST(? AS JSON) WHERE id = ?`,
        [f.methodology, JSON.stringify(f.caseStudies), f.id],
      );
    }
    filled++;
  }

  console.log(`\n結果：寫入 ${filled}、跳過 ${skipped}、查無 ${missing}（共 ${FILLS.length}）`);
  await localPool.end();
  process.exit(0);
}

main().catch((e) => { console.error("fill failed:", e); process.exit(1); });
