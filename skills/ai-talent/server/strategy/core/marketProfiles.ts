/**
 * marketProfiles.ts — Global market context for LLM content generation.
 *
 * Every brand has a targetCountry (ISO 3166-1) and outputLanguage (BCP 47).
 * buildMarketContext(countryCode, outputLanguage) returns a string injected
 * into every LLM prompt so the AI writes market-appropriate content.
 *
 * Architecture:
 *   Tier A — hand-crafted profiles for 35+ high-traffic markets (always fresh).
 *   Tier B — LLM-generated profiles for all other countries, cached in
 *             market_profiles DB table so generation only happens once.
 *   Tier C — user-supplied override (stored in brands.marketContextOverride).
 *
 * The returned string is concise (~400 chars) to avoid "prompt dilution".
 */

export interface MarketProfile {
  countryCode: string;
  countryName: string;
  defaultLanguage: string;
  platforms: string[];
  culturalContext: string;
  regulations: string;
  visualStyle: string;
  rtl?: boolean;
}

// ─── Tier A: Hand-crafted profiles ────────────────────────────────────────────

const PROFILES: Record<string, MarketProfile> = {
  // ── East Asia ──────────────────────────────────────────────────────────────
  TW: {
    countryCode: "TW", countryName: "Taiwan", defaultLanguage: "zh-TW",
    platforms: ["Facebook", "Instagram", "LINE", "YouTube", "Dcard", "PTT"],
    culturalContext: "溝通風格親切、偏好正面溫暖語氣，重視關係與品牌信任感。消費者重視 CP 值、口碑推薦與情感連結。避免過度強硬的銷售語氣；用故事性內容建立共鳴。年輕族群（Z世代）偏好 Dcard/IG，熟齡族群偏好 Facebook/LINE。",
    regulations: "避免醫療效果宣稱（需衛福部核准）；化妝品廣告不得誇大功效；金融廣告需揭露風險。",
    visualStyle: "溫暖色調為主；台灣在地元素（夜市、山海、城市街景）受歡迎；真實生活感照片效果優於過度精修。",
  },
  JP: {
    countryCode: "JP", countryName: "Japan", defaultLanguage: "ja",
    platforms: ["LINE", "Twitter/X", "Instagram", "YouTube", "TikTok", "note.com"],
    culturalContext: "使用敬語體（です/ます調）；避免最高級表達（「最高」「No.1」）；強調品質、信賴感與匠人精神。消費者重視包裝精緻度、品牌一致性與他人口碑（口コミ）。不直接批評競品；情感表達含蓄。季節性行銷（春：桜、夏：海、秋：紅葉、冬：雪）效果極佳。",
    regulations: "景品表示法：禁用「日本一」「業界最安値」等最高級語句；醫薬品・健康食品廣告需符合藥機法規範。",
    visualStyle: "細膩留白（余白の美）；季節感設計；整齊排版；插畫風格接受度高；避免過於直白的價格訴求。",
  },
  KR: {
    countryCode: "KR", countryName: "South Korea", defaultLanguage: "ko",
    platforms: ["KakaoTalk", "Instagram", "YouTube", "TikTok", "Naver Blog", "Twitter/X"],
    culturalContext: "내용이 트렌디하고 세련되어야 함. K-beauty, K-pop 미학이 강하게 영향. 빠른 트렌드 수용. '인싸' 문화 - 유행하는 콘텐츠 형식 활용. 젊은층은 TikTok/IG, 30대+ 는 KakaoTalk/YouTube 선호. 가성비와 프리미엄 양극화 뚜렷.",
    regulations: "의약품·건강기능식품 효능 과장 금지 (식약처 규제); 인플루언서 협찬 공개 의무 (#광고 #협찬).",
    visualStyle: "K-beauty 미학: 밝고 깨끗한 피부 톤, 파스텔 컬러, 감성적인 레이아웃. 텍스트 오버레이를 활용한 숏폼 콘텐츠.",
  },
  CN: {
    countryCode: "CN", countryName: "China", defaultLanguage: "zh-CN",
    platforms: ["WeChat", "Weibo", "Douyin (TikTok CN)", "Xiaohongshu (RED)", "Bilibili", "Kuaishou"],
    culturalContext: "使用简体中文；内容需通过平台审核（避免政治话题）；消费者重视国货品牌、品质背书与KOL推荐。直播电商是重要渠道。节日营销关键节点：618、双11、春节。小红书适合种草，微信适合私域流量，抖音适合短视频引流。",
    regulations: "广告法严格：禁用「最」「第一」「国家级」等绝对化语言；医疗健康产品需相应资质；需遵守互联网信息服务管理规定。",
    visualStyle: "红色、金色为吉祥色；国潮（新中式）风格流行；直播截图式视觉效果好；产品细节展示为主。",
  },
  HK: {
    countryCode: "HK", countryName: "Hong Kong", defaultLanguage: "zh-HK",
    platforms: ["Facebook", "Instagram", "YouTube", "WhatsApp", "HKTVmall"],
    culturalContext: "港式廣東話風格：親切俏皮；中英夾雜自然（Chinglish）；消費者品味成熟，重視國際感與本地情懷並存。飲食文化（茶餐廳、港式文化）是強大的內容連結點。節省但願意為高質素產品付費。",
    regulations: "避免失實陳述（商品說明條例）；醫療廣告受嚴格規管；需遵守消費者委員會指引。",
    visualStyle: "城市感、夜景、霓虹美學；本地地標（維港、中環）效果好；簡潔現代設計。",
  },

  // ── Southeast Asia ─────────────────────────────────────────────────────────
  SG: {
    countryCode: "SG", countryName: "Singapore", defaultLanguage: "en",
    platforms: ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Telegram"],
    culturalContext: "English is primary; Singlish slang adds local flavour but use sparingly in brand copy. Multicultural (Chinese/Malay/Indian/Expat) — avoid cultural stereotyping. Efficiency-oriented: value clear benefits and ROI. High purchasing power; luxury and premium brands perform well. LinkedIn is crucial for B2B.",
    regulations: "Accurate claims required under Consumer Protection (Fair Trading) Act; health product claims strictly regulated by HSA; influencer disclosure required (#ad).",
    visualStyle: "Clean, cosmopolitan aesthetic; diverse talent in lifestyle shots; hawker culture resonates locally; modern city skyline for premium positioning.",
  },
  TH: {
    countryCode: "TH", countryName: "Thailand", defaultLanguage: "th",
    platforms: ["Facebook", "LINE", "TikTok", "Instagram", "YouTube"],
    culturalContext: "เนื้อหาต้องมีความสุภาพและเคารพวัฒนธรรมไทย ห้ามหมิ่นพระบรมเดชานุภาพ ผู้บริโภคชื่นชอบเนื้อหาที่สนุกสนาน อบอุ่น และเน้นครอบครัว Facebook ยังคงเป็นแพลตฟอร์มหลัก TikTok กำลังเติบโตในกลุ่มวัยรุ่น ธีมเทศกาล (สงกรานต์ ลอยกระทง) เชื่อมต่อแบรนด์กับผู้บริโภคได้ดี",
    regulations: "ห้ามดูหมิ่นสถาบันพระมหากษัตริย์ (มาตรา 112); การโฆษณาผลิตภัณฑ์สุขภาพต้องได้รับอนุมัติจาก อย.",
    visualStyle: "สีสันสดใส สไตล์ไทยร่วมสมัย รูปถ่ายครอบครัวและกลุ่มเพื่อน สัญลักษณ์วัฒนธรรม (ดอกไม้ วัด) ใช้อย่างระมัดระวัง",
  },
  VN: {
    countryCode: "VN", countryName: "Vietnam", defaultLanguage: "vi",
    platforms: ["Facebook", "Zalo", "YouTube", "TikTok", "Instagram"],
    culturalContext: "Nội dung phải thân thiện, gần gũi. Người tiêu dùng trẻ (<35 tuổi) chiếm đa số. Giá trị gia đình và cộng đồng quan trọng. TikTok tăng trưởng mạnh ở Gen Z. Zalo là ứng dụng nhắn tin chủ đạo. Marketing dịp lễ Tết rất hiệu quả. E-commerce qua Shopee/Lazada phát triển nhanh.",
    regulations: "Không được quảng cáo sai sự thật (Luật Quảng cáo 2012); sản phẩm y tế cần phê duyệt của Bộ Y tế; influencer cần công khai hợp tác thương mại.",
    visualStyle: "Màu sắc tươi sáng; hình ảnh gia đình và bạn bè; ẩm thực Việt Nam tạo kết nối cảm xúc tốt; thiết kế trẻ trung, năng động.",
  },
  ID: {
    countryCode: "ID", countryName: "Indonesia", defaultLanguage: "id",
    platforms: ["Instagram", "TikTok", "YouTube", "WhatsApp", "Facebook", "Tokopedia"],
    culturalContext: "Bahasa Indonesia santai dan ramah. Nilai-nilai keluarga dan komunitas sangat penting. Konten berbasis agama (Ramadan, Lebaran) sangat berpengaruh. Generasi muda mendominasi media sosial. E-commerce berkembang pesat (Shopee, Tokopedia). Micro-influencer sangat efektif. Konten lokal dan 'relate' lebih disukai daripada konten mewah.",
    regulations: "Tidak boleh menyinggung SARA (Suku, Agama, Ras, Antar golongan); produk kesehatan diatur BPOM; perjudian dan alkohol dilarang dalam periklanan.",
    visualStyle: "Warna-warna cerah dan hangat; keberagaman budaya; alam Indonesia (pantai, hutan); estetika modest fashion saat Ramadan.",
  },
  MY: {
    countryCode: "MY", countryName: "Malaysia", defaultLanguage: "ms",
    platforms: ["Facebook", "Instagram", "TikTok", "YouTube", "WhatsApp", "Shopee"],
    culturalContext: "Bilingual (Malay/English) copy works best. Multicultural (Malay/Chinese/Indian) — be culturally inclusive. Halal certification matters for food/health products. Community and family values are central. Price-sensitive but aspirational; 11.11 and Raya/CNY promotions are huge. Shopee is a key marketing channel.",
    regulations: "Advertising Standards Authority Malaysia (ASAM) guidelines; Halal claims require JAKIM certification; no alcohol advertising on mainstream media.",
    visualStyle: "Multicultural representation; tropical nature imagery; traditional batik patterns for local campaigns; modern and clean for premium brands.",
  },
  PH: {
    countryCode: "PH", countryName: "Philippines", defaultLanguage: "en",
    platforms: ["Facebook", "TikTok", "YouTube", "Instagram", "Shopee", "Lazada"],
    culturalContext: "Filipino English with local expressions ('bes', 'grabe', 'charot') creates authenticity. Highly social and family-oriented. 'Hugot' (emotional/relatable) content performs exceptionally well. BPO workers = large middle class with purchasing power. Strong TikTok and Facebook usage. Brand loyalty built through 'kilig' (giddy excitement) and 'pagmamahal' (love).",
    regulations: "Philippine Advertising Standards Authority (PASA) code; health claims require FDA Philippines approval; gambling ads restricted.",
    visualStyle: "Bright, joyful imagery; diverse Filipino faces; festival colours (fiestas); street food and local cuisine visuals resonate strongly.",
  },

  // ── South Asia ─────────────────────────────────────────────────────────────
  IN: {
    countryCode: "IN", countryName: "India", defaultLanguage: "en",
    platforms: ["Instagram", "YouTube", "Facebook", "WhatsApp", "ShareChat", "Moj"],
    culturalContext: "Use English for urban/premium; Hindi or regional language for tier-2/3 cities. Family values, festivals (Diwali, Holi, Eid) are massive marketing moments. Cricket and Bollywood culture drives huge engagement. Aspirational middle class is the primary growth segment. WhatsApp is critical for community marketing. Price-value balance is key.",
    regulations: "ASCI (Advertising Standards Council of India) guidelines; no denigration of competitors; health claims regulated by FSSAI; FMCGs have strict packaging rules.",
    visualStyle: "Festival colours (orange, yellow, red, gold); diverse regional aesthetics; cricket/sports imagery; family gathering scenes for FMCG.",
  },

  // ── North America ──────────────────────────────────────────────────────────
  US: {
    countryCode: "US", countryName: "United States", defaultLanguage: "en",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn", "X (Twitter)", "Pinterest"],
    culturalContext: "Direct, benefit-first messaging. Strong CTA in first line. Casual tone for B2C, professional for B2B. American values: individualism, ambition, diversity. Cultural sensitivity to race/gender representation is critical. Use of humour and pop-culture references engages Gen Z/Millennials. LinkedIn B2B copy should be data-driven and ROI-focused.",
    regulations: "FTC: mandatory disclosure for paid partnerships (#ad, #sponsored, #gifted); health claims require FDA substantiation; no misleading 'free' offers.",
    visualStyle: "Bold, high-contrast visuals; diverse casting essential; outdoor lifestyle imagery popular; clean minimalism for tech/SaaS; warm Americana for food/lifestyle.",
  },
  CA: {
    countryCode: "CA", countryName: "Canada", defaultLanguage: "en",
    platforms: ["Instagram", "Facebook", "YouTube", "LinkedIn", "TikTok", "Reddit"],
    culturalContext: "Friendly, inclusive tone. More understated than US — avoid aggressive sales tactics. Bilingual awareness (French-English) important; Quebec requires French. Multicultural sensitivity essential. Canadians respond well to authenticity, social good messaging, and local pride. Environmental and sustainability values resonate strongly.",
    regulations: "CRTC and Ad Standards Canada guidelines; bilingual requirements for federal regulation; French language law (Bill 101) in Quebec; health claims regulated by Health Canada.",
    visualStyle: "Natural landscapes (mountains, lakes, forests); multicultural representation; seasonal themes (winter/autumn); clean, respectful aesthetic.",
  },
  MX: {
    countryCode: "MX", countryName: "Mexico", defaultLanguage: "es",
    platforms: ["Facebook", "Instagram", "TikTok", "YouTube", "WhatsApp", "Mercado Libre"],
    culturalContext: "Tono cálido, familiar y cercano. Valores de familia y comunidad son centrales. Festividades clave: Día de Muertos, Navidad, 14 de febrero. El humor y la autenticidad generan mucha conexión. Clase media aspiracional en crecimiento. WhatsApp es el canal de comunicación principal. Memes y tendencias locales funcionan muy bien.",
    regulations: "CONAR (autorregulación publicitaria); COFEPRIS regula salud; restricciones estrictas en alcohol y tabaco; publicidad dirigida a menores muy regulada.",
    visualStyle: "Colores vibrantes; elementos culturales (artesanía, gastronomía, Día de Muertos); fotografía familiar y comunitaria; estética urbana para marcas jóvenes.",
  },

  // ── South America ──────────────────────────────────────────────────────────
  BR: {
    countryCode: "BR", countryName: "Brazil", defaultLanguage: "pt",
    platforms: ["Instagram", "TikTok", "YouTube", "WhatsApp", "Facebook", "Kwai"],
    culturalContext: "Tom caloroso, animado e próximo. Valores de família, amizade e celebração. Brasil é o maior mercado de WhatsApp do mundo — estratégias de WhatsApp Business são essenciais. TikTok e Kwai crescem rapidamente. Conteúdo regional varia muito (Nordeste vs. São Paulo vs. Sul). Carnaval, Copa e festas juninas são momentos de marketing poderosos.",
    regulations: "CONAR regula autopublicidade; ANVISA regula saúde e alimentos; divulgação obrigatória para publicidade paga (#publi, #ad); sem propaganda política fora do período eleitoral.",
    visualStyle: "Cores vibrantes e tropicais; diversidade racial é fundamental; praias, natureza e festividades; estética urbana e periférica para jovens.",
  },
  AR: {
    countryCode: "AR", countryName: "Argentina", defaultLanguage: "es",
    platforms: ["Instagram", "TikTok", "YouTube", "WhatsApp", "Facebook", "Twitter/X"],
    culturalContext: "Argentinos son apasionados y directos. Fútbol (especialmente Selección) es religión de marca. Humor irónico y sarcástico funciona bien. Contexto económico de inflación afecta mensajes de precio. Orgullo nacional por gastronomía (asado, mate, vino). Twitter/X tiene alta penetración para conversación. Tono más europeo que otros países latinoamericanos.",
    regulations: "CONARP regula publicidad; ANMAT regula salud y alimentos; publicidad comparativa permitida con evidencia; sin comunicación engañosa (Ley 22.802).",
    visualStyle: "Estética urbana porteña; imágenes de fútbol y asado; café y mate; colores bandera (celeste y blanco) con cuidado.",
  },

  // ── Europe ─────────────────────────────────────────────────────────────────
  GB: {
    countryCode: "GB", countryName: "United Kingdom", defaultLanguage: "en-GB",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn", "Twitter/X"],
    culturalContext: "Dry wit and understatement are quintessentially British — use sparingly and smartly. Authenticity over hype: Brits are sceptical of overselling. Class consciousness: avoid alienating working-class audiences. Local pride (regional accents, local references) works well. LinkedIn B2B is highly active. 'Proper' and understated quality messaging over flashy claims.",
    regulations: "ASA (Advertising Standards Authority) strict enforcement; CAP Code; GDPR for data; health claims regulated by MHRA; alcohol advertising code (no linking to sexual success).",
    visualStyle: "Muted, sophisticated colour palette; British countryside and urban heritage imagery; diverse casting; understated luxury aesthetic.",
  },
  DE: {
    countryCode: "DE", countryName: "Germany", defaultLanguage: "de",
    platforms: ["Instagram", "YouTube", "Facebook", "LinkedIn", "TikTok", "XING"],
    culturalContext: "Direktheit und Sachlichkeit geschätzt. Qualität, Zuverlässigkeit und Technik stehen im Vordergrund. Verbraucherschutz sehr stark — keine Übertreibungen. Nachhaltigkeit (Umwelt, Soziales) wichtiges Kaufkriterium. Duzen (Sie→du) wird von jüngeren Zielgruppen akzeptiert; bei B2B eher förmlich bleiben. XING als deutsches LinkedIn für B2B relevant.",
    regulations: "UWG (Gesetz gegen unlauteren Wettbewerb); keine irreführenden Aussagen; Lebensmittelkennzeichnung streng; Heilmittelwerbegesetz für Gesundheitsprodukte; DSGVO für Datenschutz.",
    visualStyle: "Sauber, funktional, minimalistisch. Qualitätsphotos. Technische Infografiken. Keine übertriebene Lifestyle-Ästhetik. Natur/Wald und Stadtarchitektur beliebte Motive.",
  },
  FR: {
    countryCode: "FR", countryName: "France", defaultLanguage: "fr",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn", "Snapchat"],
    culturalContext: "L'élégance et le raffinement sont valorisés. Les Français apprécient la créativité, l'art de vivre et la gastronomie. Ton plus formel dans la communication B2B. Fierté culturelle forte — éviter de traiter la France comme un marché 'parmi d'autres'. TikTok en forte croissance chez les jeunes. Les engagements RSE (environnement, social) sont de plus en plus importants.",
    regulations: "ARPP (Autorité de Régulation Professionnelle de la Publicité); loi Evin pour alcool et tabac; mentions légales obligatoires (#sponsorisé); RGPD (GDPR) strict.",
    visualStyle: "Esthétique minimaliste et chic. Photographie lifestyle gastronomique. Références culturelles françaises (Paris, art de vivre). Éviter le trop-plein de couleurs vives.",
  },
  ES: {
    countryCode: "ES", countryName: "Spain", defaultLanguage: "es",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook", "Twitter/X", "LinkedIn"],
    culturalContext: "Tono cálido y cercano. Sentido del humor presente. Orgullo regional fuerte (Cataluña, País Vasco, Andalucía) — cuidado con referencias nacionales genéricas. Horarios diferentes: mayor actividad en redes después de las 20:00. Gastronomía, fútbol y moda son temas de alto engagement. TikTok con crecimiento masivo en menores de 30.",
    regulations: "AUTOCONTROL regula publicidad; Ley General de Publicidad; restricciones en publicidad de juego online; AEPD (protección de datos GDPR).",
    visualStyle: "Colores mediterráneos vibrantes; gastronomía y terraza lifestyle; diversidad regional; combinación entre tradición y modernidad.",
  },
  IT: {
    countryCode: "IT", countryName: "Italy", defaultLanguage: "it",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn", "WhatsApp"],
    culturalContext: "Estetica, stile e qualità sono valori primari. La famiglia e le tradizioni sono centrali. Il tono è caldo ma professionale. Gli italiani apprezzano l'autenticità e l'artigianalità (Made in Italy). Instagram è fondamentale per fashion, food e lifestyle. Il calcio è un potente connettore culturale. La gastronomia locale è sacra — rispettarla.",
    regulations: "IAP (Istituto dell'Autodisciplina Pubblicitaria); Codice del Consumo; GDPR; nessuna claim esagerata su salute e bellezza senza prove.",
    visualStyle: "Eleganza e raffinatezza italiana; cibo autentico e territorio; artigianato e dettagli di qualità; palazzi storici e paesaggi per posizionamento premium.",
  },
  PL: {
    countryCode: "PL", countryName: "Poland", defaultLanguage: "pl",
    platforms: ["Facebook", "Instagram", "YouTube", "TikTok", "Wykop"],
    culturalContext: "Polacy doceniają bezpośrednią komunikację. Rodzina i tradycja są ważne. Silne poczucie humoru (często sarkazm). Polacy są sceptyczni wobec przesady reklamowej — rzetelność i autentyczność są kluczowe. Facebook nadal dominuje wśród starszych grup, TikTok rośnie u młodszych. Lokalne marki i patriotyzm konsumencki zyskują na popularności.",
    regulations: "UOKiK (Urząd Ochrony Konkurencji i Konsumentów); zakaz reklamy wprowadzającej w błąd; RODO (GDPR); ograniczenia reklamy alkoholu.",
    visualStyle: "Stonowane kolory, naturalne materiały. Polskie krajobrazy (jeziora, lasy). Rodzinne i lokalne motywy. Minimalistyczny design dla marek premium.",
  },
  RU: {
    countryCode: "RU", countryName: "Russia", defaultLanguage: "ru",
    platforms: ["VKontakte (VK)", "Telegram", "YouTube", "Instagram", "Odnoklassniki"],
    culturalContext: "Тон должен быть уважительным и профессиональным. Ценятся патриотизм, традиции и семья. ВКонтакте — основная социальная сеть. Telegram активно растёт. Юмор ценится, но должен быть тонким. Акцент на качестве, надёжности и российских традициях хорошо работает для местных брендов.",
    regulations: "ФАС (Федеральная антимонопольная служба) контролирует рекламу; закон о рекламе 2006 г.; маркировка «реклама» для спонсорских материалов обязательна.",
    visualStyle: "Насыщенные цвета; русская природа (берёзы, зима); архитектурные достопримечательности; семейные и традиционные сцены.",
  },
  TR: {
    countryCode: "TR", countryName: "Turkey", defaultLanguage: "tr",
    platforms: ["Instagram", "YouTube", "TikTok", "Twitter/X", "Facebook", "BiTakip"],
    culturalContext: "Sıcak, samimi ve aile odaklı bir ton tercih edilir. Türkler geleneksel değerlere bağlıdır; aynı zamanda modern ve girişimci bir ruhları var. Ramazan dönemi büyük pazarlama fırsatı. Futbol ve dizi kültürü (Türk dizileri) güçlü referans noktaları. Instagram'da estetik içerik çok popüler. Fiyat-performans dengesi önemli.",
    regulations: "RTÜK (Radyo ve Televizyon Üst Kurulu) yayın düzenlemeleri; TÜSAD reklamcılık standartları; sağlık ürünleri için Sağlık Bakanlığı onayı gerekli.",
    visualStyle: "Zengin renkler ve dokular; Türk mutfağı ve mimarisi; aile ve topluluk sahneleri; modern şehir estetiği genç kitleler için.",
  },

  // ── Middle East ────────────────────────────────────────────────────────────
  AE: {
    countryCode: "AE", countryName: "UAE", defaultLanguage: "ar",
    platforms: ["Instagram", "YouTube", "TikTok", "Snapchat", "LinkedIn", "Twitter/X"],
    culturalContext: "محتوى راقٍ يعكس الفخامة والطموح. الإمارات سوق متعدد الثقافات (مواطنون + 200 جنسية) — المحتوى باللغتين العربية والإنجليزية فعّال. رمضان والأعياد فرص تسويقية كبرى. الهوية الإماراتية والتميز والابتكار قيم محورية. Snapchat شائع جداً بين الشباب الخليجي. LinkedIn محوري للأعمال.",
    regulations: "وزارة الاقتصاد تنظّم الإعلانات؛ ممنوع المحتوى غير اللائق والسياسي؛ المنتجات الصحية تستلزم موافقة وزارة الصحة؛ رمز الإفصاح الإعلاني إلزامي.",
    visualStyle: "فخامة وعصرية. أفق دبي وأبوظبي. عناصر تراثية إماراتية (قهوة عربية، عقال) بأسلوب راقٍ. إضاءة ذهبية ودرامية.",
    rtl: true,
  },
  SA: {
    countryCode: "SA", countryName: "Saudi Arabia", defaultLanguage: "ar",
    platforms: ["Snapchat", "Instagram", "YouTube", "TikTok", "Twitter/X", "LinkedIn"],
    culturalContext: "رؤية 2030 تشكّل اتجاهات جديدة: الترفيه، السياحة، التمكين. الشباب السعودي (70% أقل من 35 عاماً) حديث التوجه. Snapchat له أعلى نسبة اختراق عالمياً في السعودية. احترام القيم الإسلامية إلزامي. الرياضة (كرة القدم، الرياضة الإلكترونية) محرك قوي. التسويق خلال رمضان الأكثر تأثيراً.",
    regulations: "الهيئة العامة للإعلام المرئي والمسموع؛ ممنوع الترويج للكحول والمقامرة؛ القيم الإسلامية ملزمة؛ الإفصاح عن الإعلانات الممولة.",
    visualStyle: "إبراز هوية المملكة وعناصرها الثقافية. مواقع رؤية 2030 (نيوم، البحر الأحمر). ألوان راقية: ذهبي وأخضر. تنوع في التمثيل الجنسي مع مراعاة الاعتدال.",
    rtl: true,
  },
  IL: {
    countryCode: "IL", countryName: "Israel", defaultLanguage: "he",
    platforms: ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "WhatsApp"],
    culturalContext: "ישראלים מעריכים ישירות ויצירתיות. הומור הוא כלי שיווקי חזק. חדשנות וטכנולוגיה מעוררות גאווה. שפה עברית יוצרת קרבה; אנגלית מקובלת לחברות בינלאומיות. לינקד'אין חיוני להייטק. חגים יהודיים הם הזדמנויות שיווק משמעותיות.",
    regulations: "רשות הפרסום; איסור פרסום מטעה; תקנות בריאות קפדניות; גילוי נאות לפרסום ממומן.",
    visualStyle: "עיצוב נקי ומודרני. נוף ישראלי (ים, מדבר, ירושלים). גיוון תרבותי. אסתטיקת סטארטאפ לטכנולוגיה.",
    rtl: true,
  },

  // ── Africa ─────────────────────────────────────────────────────────────────
  ZA: {
    countryCode: "ZA", countryName: "South Africa", defaultLanguage: "en",
    platforms: ["Facebook", "Instagram", "YouTube", "TikTok", "WhatsApp", "Twitter/X"],
    culturalContext: "Rainbow Nation diversity must be reflected authentically. 'Ubuntu' philosophy (community, togetherness) resonates deeply. Football, music (Amapiano) and township culture are powerful brand connectors. WhatsApp dominates communication. Load-shedding awareness is real context. Mix of English and local language slang ('lekker', 'braai', 'eish') shows authenticity.",
    regulations: "ASA (Advertising Standards Authority SA); POPIA (data protection); no racial discrimination in advertising; alcohol and tobacco strictly regulated.",
    visualStyle: "Vibrant, warm tones; diverse representation across all 11 ethnic groups; township murals and street art aesthetic; wildlife and landscape for tourism.",
  },
  NG: {
    countryCode: "NG", countryName: "Nigeria", defaultLanguage: "en",
    platforms: ["Instagram", "WhatsApp", "YouTube", "TikTok", "Facebook", "Twitter/X"],
    culturalContext: "Nigerians are energetic, entrepreneurial and aspirational. 'Naija' culture celebrated: Afrobeats, Nollywood, street food. WhatsApp is the #1 communication tool — WhatsApp Business groups are key. Pidgin English adds local authenticity. Religious values (Christianity and Islam balance) important. Strong pride in Nigerian excellence and success stories.",
    regulations: "Advertising Practitioners Council of Nigeria (APCON); no deceptive advertising; health products need NAFDAC approval; no political advertising outside election season.",
    visualStyle: "Bold, joyful colours; Afrocentric patterns (Ankara, Adire); Lagos city energy; Afrobeats culture visuals; aspirational success imagery.",
  },
  KE: {
    countryCode: "KE", countryName: "Kenya", defaultLanguage: "sw",
    platforms: ["Facebook", "YouTube", "TikTok", "Instagram", "Twitter/X", "WhatsApp"],
    culturalContext: "Kiswahili na Kiingereza ni lugha mbili muhimu. Vijana ni sehemu kubwa ya masoko (median umri: miaka 20). Jamii na familia ni maadili ya msingi. M-Pesa na fintech maarufu sana. Muziki (Afrobeats, Gengetone) na michezo (marathon, rugbi) ni viambatishi vikubwa. Biashara za ndani zinaungwa mkono sana.",
    regulations: "Advertising Standards Committee Kenya; ushahidi unaohitajika kwa madai ya bidhaa za afya; usiri wa data (Data Protection Act 2019).",
    visualStyle: "Rangi za asili (kijani, kahawia, manjano); mandhari ya Kenya (savanna, pwani); utamaduni wa Maasai kwa heshima; picha za familia na jamii.",
  },

  // ── Oceania ────────────────────────────────────────────────────────────────
  AU: {
    countryCode: "AU", countryName: "Australia", defaultLanguage: "en-AU",
    platforms: ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Snapchat"],
    culturalContext: "Australians value authenticity, irreverence and directness — avoid corporate-speak. 'Tall poppy syndrome' means bragging backfires; let quality speak. Outdoor lifestyle (beach, BBQ, sports) is central to culture. LGBTQ+ inclusivity expected. Indigenous acknowledgement appropriate for community brands. LinkedIn strong for B2B mining, finance, and professional services.",
    regulations: "ARPA (Australian Association of National Advertisers) Code; ACCC for competition and fair trading; health claims regulated by TGA; mandatory disclosure (#ad, #sponsored).",
    visualStyle: "Bright outdoor lifestyle; beaches and nature; diverse multicultural cast; laid-back, sun-drenched aesthetic; Indigenous art elements with cultural permission.",
  },
};

// ─── buildMarketContext: format profile for prompt injection ───────────────────

/**
 * Returns a compact market context string (~300-500 chars) ready to inject
 * into any LLM system prompt. Falls back to an LLM-generated profile for
 * countries not in the Tier A static list.
 */
export async function buildMarketContext(
  countryCode: string | null | undefined,
  outputLanguage: string | null | undefined,
  marketContextOverride?: string | null,
): Promise<string> {
  if (!countryCode) return "";

  const code = countryCode.toUpperCase();
  const lang = outputLanguage || PROFILES[code]?.defaultLanguage || "en";

  // User override takes precedence over everything
  if (marketContextOverride?.trim()) {
    return `\n[市場設定 — 用戶自訂]\n${marketContextOverride.trim()}\n輸出語言：${lang}\n`;
  }

  // Tier A: static profile
  const profile = PROFILES[code];
  if (profile) {
    return formatProfileForPrompt(profile, lang);
  }

  // Tier B: try DB cache, then generate dynamically
  try {
    const cached = await getCachedProfile(code);
    if (cached) return formatProfileForPrompt(cached, lang);

    const generated = await generateMarketProfile(code, lang);
    if (generated) return formatProfileForPrompt(generated, lang);
  } catch {
    // non-fatal — proceed without market context
  }

  // Fallback: minimal language directive only
  return `\n[輸出設定]\n輸出語言：${lang}\n`;
}

function formatProfileForPrompt(profile: MarketProfile, outputLanguage: string): string {
  const lines: string[] = [];
  lines.push(`目標市場：${profile.countryName} (${profile.countryCode})`);
  lines.push(`輸出語言：${outputLanguage}`);
  if (profile.platforms.length > 0) {
    lines.push(`主流平台：${profile.platforms.slice(0, 6).join("、")}`);
  }
  if (profile.culturalContext) {
    lines.push(`文化與溝通風格：${profile.culturalContext.slice(0, 400)}`);
  }
  if (profile.regulations) {
    lines.push(`廣告法規注意：${profile.regulations.slice(0, 200)}`);
  }
  if (profile.visualStyle) {
    lines.push(`圖片視覺方向：${profile.visualStyle.slice(0, 200)}`);
  }
  return "\n[市場設定 — 所有產出必須符合此市場文化與語言]\n" +
    lines.map(l => `- ${l}`).join("\n") + "\n";
}

// ─── DB cache helpers ──────────────────────────────────────────────────────────

async function getCachedProfile(countryCode: string): Promise<MarketProfile | null> {
  try {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT * FROM market_profiles WHERE countryCode = ? LIMIT 1`,
      [countryCode],
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      countryCode: row.countryCode,
      countryName: row.countryName,
      defaultLanguage: row.defaultLanguage,
      platforms: JSON.parse(row.platforms || "[]"),
      culturalContext: row.culturalContext || "",
      regulations: row.regulations || "",
      visualStyle: row.visualStyle || "",
      rtl: !!row.rtl,
    };
  } catch { return null; }
}

async function saveCachedProfile(profile: MarketProfile): Promise<void> {
  try {
    const { default: localPool } = await import("../../localDb");
    await localPool.execute(
      `INSERT INTO market_profiles
         (countryCode, countryName, defaultLanguage, platforms, culturalContext, regulations, visualStyle, rtl, isManual, generatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())
       ON DUPLICATE KEY UPDATE
         countryName=VALUES(countryName), platforms=VALUES(platforms),
         culturalContext=VALUES(culturalContext), regulations=VALUES(regulations),
         visualStyle=VALUES(visualStyle), generatedAt=NOW()`,
      [
        profile.countryCode, profile.countryName, profile.defaultLanguage,
        JSON.stringify(profile.platforms),
        profile.culturalContext, profile.regulations, profile.visualStyle,
        profile.rtl ? 1 : 0,
      ],
    );
  } catch { /* non-fatal */ }
}

// ─── Tier B: LLM-generated profile for unlisted countries ─────────────────────

async function generateMarketProfile(
  countryCode: string,
  outputLanguage: string,
): Promise<MarketProfile | null> {
  try {
    const { invokeLLM } = await import("../../platform/core/llm");
    const prompt = `You are a global marketing expert. Generate a concise marketing profile for content marketing in the country with ISO code "${countryCode}" (output language: ${outputLanguage}).

Return ONLY a JSON object with these exact keys:
{
  "countryName": "...",
  "platforms": ["platform1", "platform2", "platform3", "platform4"],
  "culturalContext": "Brief description of communication style, consumer values, cultural norms, dos and don'ts for marketing. Max 300 chars.",
  "regulations": "Key advertising regulatory restrictions. Max 150 chars.",
  "visualStyle": "Visual aesthetic preferences for image generation. Max 150 chars."
}

Be specific and accurate. No extra text outside the JSON.`;

    const result: any = await invokeLLM({
      provider: "anthropic",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 600,
    });

    const raw = String(result?.content ?? result?.text ?? "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    const profile: MarketProfile = {
      countryCode: countryCode.toUpperCase(),
      countryName: data.countryName || countryCode,
      defaultLanguage: outputLanguage,
      platforms: Array.isArray(data.platforms) ? data.platforms : [],
      culturalContext: String(data.culturalContext || ""),
      regulations: String(data.regulations || ""),
      visualStyle: String(data.visualStyle || ""),
    };

    // Cache in DB for future requests (fire-and-forget)
    saveCachedProfile(profile).catch(() => {});

    return profile;
  } catch { return null; }
}

/** Expose static profiles for seeding / admin purposes. */
export { PROFILES as STATIC_MARKET_PROFILES };
