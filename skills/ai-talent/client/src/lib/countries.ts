/**
 * countries.ts — Full ISO 3166-1 country list with default language mappings.
 * Used by brand setup UI for target market + output language selection.
 *
 * languageCode: BCP 47 tag (e.g. "zh-TW", "ja", "en", "ar")
 * rtl: right-to-left script (Arabic, Hebrew, Persian, Urdu)
 */

export interface CountryOption {
  code: string;        // ISO 3166-1 alpha-2
  name: string;        // English display name
  nameZh?: string;     // Chinese display name
  emoji: string;       // Flag emoji
  languageCode: string; // BCP 47 default output language
  languageName: string; // Human-readable language name
  languageNameZh: string; // Language name in Chinese
  rtl?: boolean;       // Right-to-left
}

export const COUNTRIES: CountryOption[] = [
  // ── East Asia ──────────────────────────────────────────────────
  { code: "TW", name: "Taiwan", nameZh: "台灣", emoji: "🇹🇼", languageCode: "zh-TW", languageName: "Traditional Chinese", languageNameZh: "繁體中文" },
  { code: "JP", name: "Japan", nameZh: "日本", emoji: "🇯🇵", languageCode: "ja", languageName: "Japanese", languageNameZh: "日本語" },
  { code: "KR", name: "South Korea", nameZh: "韓國", emoji: "🇰🇷", languageCode: "ko", languageName: "Korean", languageNameZh: "韓文" },
  { code: "CN", name: "China", nameZh: "中國", emoji: "🇨🇳", languageCode: "zh-CN", languageName: "Simplified Chinese", languageNameZh: "簡體中文" },
  { code: "HK", name: "Hong Kong", nameZh: "香港", emoji: "🇭🇰", languageCode: "zh-HK", languageName: "Traditional Chinese (HK)", languageNameZh: "繁體中文（香港）" },
  { code: "MO", name: "Macao", nameZh: "澳門", emoji: "🇲🇴", languageCode: "zh-TW", languageName: "Traditional Chinese", languageNameZh: "繁體中文" },
  { code: "MN", name: "Mongolia", nameZh: "蒙古", emoji: "🇲🇳", languageCode: "mn", languageName: "Mongolian", languageNameZh: "蒙古文" },

  // ── Southeast Asia ─────────────────────────────────────────────
  { code: "SG", name: "Singapore", nameZh: "新加坡", emoji: "🇸🇬", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "TH", name: "Thailand", nameZh: "泰國", emoji: "🇹🇭", languageCode: "th", languageName: "Thai", languageNameZh: "泰文" },
  { code: "VN", name: "Vietnam", nameZh: "越南", emoji: "🇻🇳", languageCode: "vi", languageName: "Vietnamese", languageNameZh: "越南文" },
  { code: "ID", name: "Indonesia", nameZh: "印尼", emoji: "🇮🇩", languageCode: "id", languageName: "Indonesian", languageNameZh: "印尼文" },
  { code: "MY", name: "Malaysia", nameZh: "馬來西亞", emoji: "🇲🇾", languageCode: "ms", languageName: "Malay", languageNameZh: "馬來文" },
  { code: "PH", name: "Philippines", nameZh: "菲律賓", emoji: "🇵🇭", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "MM", name: "Myanmar", nameZh: "緬甸", emoji: "🇲🇲", languageCode: "my", languageName: "Burmese", languageNameZh: "緬甸文" },
  { code: "KH", name: "Cambodia", nameZh: "柬埔寨", emoji: "🇰🇭", languageCode: "km", languageName: "Khmer", languageNameZh: "高棉文" },
  { code: "LA", name: "Laos", nameZh: "寮國", emoji: "🇱🇦", languageCode: "lo", languageName: "Lao", languageNameZh: "寮文" },
  { code: "BN", name: "Brunei", nameZh: "汶萊", emoji: "🇧🇳", languageCode: "ms", languageName: "Malay", languageNameZh: "馬來文" },
  { code: "TL", name: "Timor-Leste", nameZh: "東帝汶", emoji: "🇹🇱", languageCode: "pt", languageName: "Portuguese", languageNameZh: "葡萄牙文" },

  // ── South Asia ─────────────────────────────────────────────────
  { code: "IN", name: "India", nameZh: "印度", emoji: "🇮🇳", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "PK", name: "Pakistan", nameZh: "巴基斯坦", emoji: "🇵🇰", languageCode: "ur", languageName: "Urdu", languageNameZh: "烏爾都文", rtl: true },
  { code: "BD", name: "Bangladesh", nameZh: "孟加拉", emoji: "🇧🇩", languageCode: "bn", languageName: "Bengali", languageNameZh: "孟加拉文" },
  { code: "LK", name: "Sri Lanka", nameZh: "斯里蘭卡", emoji: "🇱🇰", languageCode: "si", languageName: "Sinhala", languageNameZh: "僧伽羅文" },
  { code: "NP", name: "Nepal", nameZh: "尼泊爾", emoji: "🇳🇵", languageCode: "ne", languageName: "Nepali", languageNameZh: "尼泊爾文" },
  { code: "MV", name: "Maldives", nameZh: "馬爾地夫", emoji: "🇲🇻", languageCode: "dv", languageName: "Dhivehi", languageNameZh: "迪維希文" },
  { code: "BT", name: "Bhutan", nameZh: "不丹", emoji: "🇧🇹", languageCode: "dz", languageName: "Dzongkha", languageNameZh: "宗卡文" },
  { code: "AF", name: "Afghanistan", nameZh: "阿富汗", emoji: "🇦🇫", languageCode: "ps", languageName: "Pashto", languageNameZh: "普什圖文", rtl: true },

  // ── North America ──────────────────────────────────────────────
  { code: "US", name: "United States", nameZh: "美國", emoji: "🇺🇸", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "CA", name: "Canada", nameZh: "加拿大", emoji: "🇨🇦", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "MX", name: "Mexico", nameZh: "墨西哥", emoji: "🇲🇽", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },

  // ── Central America & Caribbean ────────────────────────────────
  { code: "GT", name: "Guatemala", nameZh: "瓜地馬拉", emoji: "🇬🇹", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "HN", name: "Honduras", nameZh: "宏都拉斯", emoji: "🇭🇳", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "SV", name: "El Salvador", nameZh: "薩爾瓦多", emoji: "🇸🇻", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "NI", name: "Nicaragua", nameZh: "尼加拉瓜", emoji: "🇳🇮", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "CR", name: "Costa Rica", nameZh: "哥斯大黎加", emoji: "🇨🇷", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "PA", name: "Panama", nameZh: "巴拿馬", emoji: "🇵🇦", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "CU", name: "Cuba", nameZh: "古巴", emoji: "🇨🇺", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "DO", name: "Dominican Republic", nameZh: "多明尼加", emoji: "🇩🇴", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "PR", name: "Puerto Rico", nameZh: "波多黎各", emoji: "🇵🇷", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "JM", name: "Jamaica", nameZh: "牙買加", emoji: "🇯🇲", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "HT", name: "Haiti", nameZh: "海地", emoji: "🇭🇹", languageCode: "fr", languageName: "French", languageNameZh: "法文" },
  { code: "TT", name: "Trinidad & Tobago", nameZh: "千里達及托巴哥", emoji: "🇹🇹", languageCode: "en", languageName: "English", languageNameZh: "英文" },

  // ── South America ──────────────────────────────────────────────
  { code: "BR", name: "Brazil", nameZh: "巴西", emoji: "🇧🇷", languageCode: "pt", languageName: "Portuguese", languageNameZh: "葡萄牙文" },
  { code: "AR", name: "Argentina", nameZh: "阿根廷", emoji: "🇦🇷", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "CL", name: "Chile", nameZh: "智利", emoji: "🇨🇱", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "CO", name: "Colombia", nameZh: "哥倫比亞", emoji: "🇨🇴", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "PE", name: "Peru", nameZh: "秘魯", emoji: "🇵🇪", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "VE", name: "Venezuela", nameZh: "委內瑞拉", emoji: "🇻🇪", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "EC", name: "Ecuador", nameZh: "厄瓜多", emoji: "🇪🇨", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "BO", name: "Bolivia", nameZh: "玻利維亞", emoji: "🇧🇴", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "PY", name: "Paraguay", nameZh: "巴拉圭", emoji: "🇵🇾", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "UY", name: "Uruguay", nameZh: "烏拉圭", emoji: "🇺🇾", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "GY", name: "Guyana", nameZh: "蓋亞那", emoji: "🇬🇾", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "SR", name: "Suriname", nameZh: "蘇利南", emoji: "🇸🇷", languageCode: "nl", languageName: "Dutch", languageNameZh: "荷蘭文" },

  // ── Western Europe ─────────────────────────────────────────────
  { code: "GB", name: "United Kingdom", nameZh: "英國", emoji: "🇬🇧", languageCode: "en-GB", languageName: "English (UK)", languageNameZh: "英文（英式）" },
  { code: "DE", name: "Germany", nameZh: "德國", emoji: "🇩🇪", languageCode: "de", languageName: "German", languageNameZh: "德文" },
  { code: "FR", name: "France", nameZh: "法國", emoji: "🇫🇷", languageCode: "fr", languageName: "French", languageNameZh: "法文" },
  { code: "ES", name: "Spain", nameZh: "西班牙", emoji: "🇪🇸", languageCode: "es", languageName: "Spanish", languageNameZh: "西班牙文" },
  { code: "IT", name: "Italy", nameZh: "義大利", emoji: "🇮🇹", languageCode: "it", languageName: "Italian", languageNameZh: "義大利文" },
  { code: "NL", name: "Netherlands", nameZh: "荷蘭", emoji: "🇳🇱", languageCode: "nl", languageName: "Dutch", languageNameZh: "荷蘭文" },
  { code: "BE", name: "Belgium", nameZh: "比利時", emoji: "🇧🇪", languageCode: "nl", languageName: "Dutch / French", languageNameZh: "荷蘭文／法文" },
  { code: "CH", name: "Switzerland", nameZh: "瑞士", emoji: "🇨🇭", languageCode: "de", languageName: "German / French", languageNameZh: "德文／法文" },
  { code: "AT", name: "Austria", nameZh: "奧地利", emoji: "🇦🇹", languageCode: "de", languageName: "German", languageNameZh: "德文" },
  { code: "PT", name: "Portugal", nameZh: "葡萄牙", emoji: "🇵🇹", languageCode: "pt", languageName: "Portuguese", languageNameZh: "葡萄牙文" },
  { code: "IE", name: "Ireland", nameZh: "愛爾蘭", emoji: "🇮🇪", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "LU", name: "Luxembourg", nameZh: "盧森堡", emoji: "🇱🇺", languageCode: "fr", languageName: "French / German", languageNameZh: "法文／德文" },
  { code: "MC", name: "Monaco", nameZh: "摩納哥", emoji: "🇲🇨", languageCode: "fr", languageName: "French", languageNameZh: "法文" },

  // ── Northern Europe ────────────────────────────────────────────
  { code: "SE", name: "Sweden", nameZh: "瑞典", emoji: "🇸🇪", languageCode: "sv", languageName: "Swedish", languageNameZh: "瑞典文" },
  { code: "NO", name: "Norway", nameZh: "挪威", emoji: "🇳🇴", languageCode: "no", languageName: "Norwegian", languageNameZh: "挪威文" },
  { code: "DK", name: "Denmark", nameZh: "丹麥", emoji: "🇩🇰", languageCode: "da", languageName: "Danish", languageNameZh: "丹麥文" },
  { code: "FI", name: "Finland", nameZh: "芬蘭", emoji: "🇫🇮", languageCode: "fi", languageName: "Finnish", languageNameZh: "芬蘭文" },
  { code: "IS", name: "Iceland", nameZh: "冰島", emoji: "🇮🇸", languageCode: "is", languageName: "Icelandic", languageNameZh: "冰島文" },
  { code: "EE", name: "Estonia", nameZh: "愛沙尼亞", emoji: "🇪🇪", languageCode: "et", languageName: "Estonian", languageNameZh: "愛沙尼亞文" },
  { code: "LV", name: "Latvia", nameZh: "拉脫維亞", emoji: "🇱🇻", languageCode: "lv", languageName: "Latvian", languageNameZh: "拉脫維亞文" },
  { code: "LT", name: "Lithuania", nameZh: "立陶宛", emoji: "🇱🇹", languageCode: "lt", languageName: "Lithuanian", languageNameZh: "立陶宛文" },

  // ── Southern & Eastern Europe ──────────────────────────────────
  { code: "PL", name: "Poland", nameZh: "波蘭", emoji: "🇵🇱", languageCode: "pl", languageName: "Polish", languageNameZh: "波蘭文" },
  { code: "CZ", name: "Czech Republic", nameZh: "捷克", emoji: "🇨🇿", languageCode: "cs", languageName: "Czech", languageNameZh: "捷克文" },
  { code: "SK", name: "Slovakia", nameZh: "斯洛伐克", emoji: "🇸🇰", languageCode: "sk", languageName: "Slovak", languageNameZh: "斯洛伐克文" },
  { code: "HU", name: "Hungary", nameZh: "匈牙利", emoji: "🇭🇺", languageCode: "hu", languageName: "Hungarian", languageNameZh: "匈牙利文" },
  { code: "RO", name: "Romania", nameZh: "羅馬尼亞", emoji: "🇷🇴", languageCode: "ro", languageName: "Romanian", languageNameZh: "羅馬尼亞文" },
  { code: "BG", name: "Bulgaria", nameZh: "保加利亞", emoji: "🇧🇬", languageCode: "bg", languageName: "Bulgarian", languageNameZh: "保加利亞文" },
  { code: "HR", name: "Croatia", nameZh: "克羅埃西亞", emoji: "🇭🇷", languageCode: "hr", languageName: "Croatian", languageNameZh: "克羅埃西亞文" },
  { code: "RS", name: "Serbia", nameZh: "塞爾維亞", emoji: "🇷🇸", languageCode: "sr", languageName: "Serbian", languageNameZh: "塞爾維亞文" },
  { code: "SI", name: "Slovenia", nameZh: "斯洛維尼亞", emoji: "🇸🇮", languageCode: "sl", languageName: "Slovenian", languageNameZh: "斯洛維尼亞文" },
  { code: "BA", name: "Bosnia & Herzegovina", nameZh: "波士尼亞", emoji: "🇧🇦", languageCode: "bs", languageName: "Bosnian", languageNameZh: "波士尼亞文" },
  { code: "MK", name: "North Macedonia", nameZh: "北馬其頓", emoji: "🇲🇰", languageCode: "mk", languageName: "Macedonian", languageNameZh: "馬其頓文" },
  { code: "AL", name: "Albania", nameZh: "阿爾巴尼亞", emoji: "🇦🇱", languageCode: "sq", languageName: "Albanian", languageNameZh: "阿爾巴尼亞文" },
  { code: "GR", name: "Greece", nameZh: "希臘", emoji: "🇬🇷", languageCode: "el", languageName: "Greek", languageNameZh: "希臘文" },
  { code: "TR", name: "Turkey", nameZh: "土耳其", emoji: "🇹🇷", languageCode: "tr", languageName: "Turkish", languageNameZh: "土耳其文" },
  { code: "RU", name: "Russia", nameZh: "俄羅斯", emoji: "🇷🇺", languageCode: "ru", languageName: "Russian", languageNameZh: "俄文" },
  { code: "UA", name: "Ukraine", nameZh: "烏克蘭", emoji: "🇺🇦", languageCode: "uk", languageName: "Ukrainian", languageNameZh: "烏克蘭文" },
  { code: "BY", name: "Belarus", nameZh: "白俄羅斯", emoji: "🇧🇾", languageCode: "be", languageName: "Belarusian", languageNameZh: "白俄羅斯文" },
  { code: "MD", name: "Moldova", nameZh: "摩爾多瓦", emoji: "🇲🇩", languageCode: "ro", languageName: "Romanian", languageNameZh: "羅馬尼亞文" },
  { code: "CY", name: "Cyprus", nameZh: "賽普勒斯", emoji: "🇨🇾", languageCode: "el", languageName: "Greek", languageNameZh: "希臘文" },
  { code: "MT", name: "Malta", nameZh: "馬爾他", emoji: "🇲🇹", languageCode: "en", languageName: "English", languageNameZh: "英文" },

  // ── Middle East ────────────────────────────────────────────────
  { code: "AE", name: "UAE", nameZh: "阿聯酋", emoji: "🇦🇪", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "SA", name: "Saudi Arabia", nameZh: "沙烏地阿拉伯", emoji: "🇸🇦", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "IL", name: "Israel", nameZh: "以色列", emoji: "🇮🇱", languageCode: "he", languageName: "Hebrew", languageNameZh: "希伯來文", rtl: true },
  { code: "EG", name: "Egypt", nameZh: "埃及", emoji: "🇪🇬", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "JO", name: "Jordan", nameZh: "約旦", emoji: "🇯🇴", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "LB", name: "Lebanon", nameZh: "黎巴嫩", emoji: "🇱🇧", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "QA", name: "Qatar", nameZh: "卡達", emoji: "🇶🇦", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "KW", name: "Kuwait", nameZh: "科威特", emoji: "🇰🇼", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "BH", name: "Bahrain", nameZh: "巴林", emoji: "🇧🇭", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "OM", name: "Oman", nameZh: "阿曼", emoji: "🇴🇲", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "YE", name: "Yemen", nameZh: "葉門", emoji: "🇾🇪", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "IQ", name: "Iraq", nameZh: "伊拉克", emoji: "🇮🇶", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "IR", name: "Iran", nameZh: "伊朗", emoji: "🇮🇷", languageCode: "fa", languageName: "Persian", languageNameZh: "波斯文", rtl: true },
  { code: "SY", name: "Syria", nameZh: "敘利亞", emoji: "🇸🇾", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },

  // ── Central Asia ───────────────────────────────────────────────
  { code: "KZ", name: "Kazakhstan", nameZh: "哈薩克", emoji: "🇰🇿", languageCode: "kk", languageName: "Kazakh", languageNameZh: "哈薩克文" },
  { code: "UZ", name: "Uzbekistan", nameZh: "烏茲別克", emoji: "🇺🇿", languageCode: "uz", languageName: "Uzbek", languageNameZh: "烏茲別克文" },
  { code: "AZ", name: "Azerbaijan", nameZh: "亞塞拜然", emoji: "🇦🇿", languageCode: "az", languageName: "Azerbaijani", languageNameZh: "亞塞拜然文" },
  { code: "GE", name: "Georgia", nameZh: "喬治亞", emoji: "🇬🇪", languageCode: "ka", languageName: "Georgian", languageNameZh: "喬治亞文" },
  { code: "AM", name: "Armenia", nameZh: "亞美尼亞", emoji: "🇦🇲", languageCode: "hy", languageName: "Armenian", languageNameZh: "亞美尼亞文" },

  // ── Oceania ────────────────────────────────────────────────────
  { code: "AU", name: "Australia", nameZh: "澳洲", emoji: "🇦🇺", languageCode: "en-AU", languageName: "English (AU)", languageNameZh: "英文（澳式）" },
  { code: "NZ", name: "New Zealand", nameZh: "紐西蘭", emoji: "🇳🇿", languageCode: "en-NZ", languageName: "English (NZ)", languageNameZh: "英文（紐西蘭）" },
  { code: "FJ", name: "Fiji", nameZh: "斐濟", emoji: "🇫🇯", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "PG", name: "Papua New Guinea", nameZh: "巴布亞紐幾內亞", emoji: "🇵🇬", languageCode: "en", languageName: "English", languageNameZh: "英文" },

  // ── Sub-Saharan Africa ─────────────────────────────────────────
  { code: "ZA", name: "South Africa", nameZh: "南非", emoji: "🇿🇦", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "NG", name: "Nigeria", nameZh: "奈及利亞", emoji: "🇳🇬", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "KE", name: "Kenya", nameZh: "肯亞", emoji: "🇰🇪", languageCode: "sw", languageName: "Swahili", languageNameZh: "斯瓦希里文" },
  { code: "GH", name: "Ghana", nameZh: "迦納", emoji: "🇬🇭", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "ET", name: "Ethiopia", nameZh: "衣索比亞", emoji: "🇪🇹", languageCode: "am", languageName: "Amharic", languageNameZh: "阿姆哈拉文" },
  { code: "TZ", name: "Tanzania", nameZh: "坦尚尼亞", emoji: "🇹🇿", languageCode: "sw", languageName: "Swahili", languageNameZh: "斯瓦希里文" },
  { code: "UG", name: "Uganda", nameZh: "烏干達", emoji: "🇺🇬", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "CI", name: "Côte d'Ivoire", nameZh: "象牙海岸", emoji: "🇨🇮", languageCode: "fr", languageName: "French", languageNameZh: "法文" },
  { code: "SN", name: "Senegal", nameZh: "塞內加爾", emoji: "🇸🇳", languageCode: "fr", languageName: "French", languageNameZh: "法文" },
  { code: "CM", name: "Cameroon", nameZh: "喀麥隆", emoji: "🇨🇲", languageCode: "fr", languageName: "French", languageNameZh: "法文" },
  { code: "MZ", name: "Mozambique", nameZh: "莫三比克", emoji: "🇲🇿", languageCode: "pt", languageName: "Portuguese", languageNameZh: "葡萄牙文" },
  { code: "AO", name: "Angola", nameZh: "安哥拉", emoji: "🇦🇴", languageCode: "pt", languageName: "Portuguese", languageNameZh: "葡萄牙文" },
  { code: "ZW", name: "Zimbabwe", nameZh: "辛巴威", emoji: "🇿🇼", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "ZM", name: "Zambia", nameZh: "尚比亞", emoji: "🇿🇲", languageCode: "en", languageName: "English", languageNameZh: "英文" },
  { code: "RW", name: "Rwanda", nameZh: "盧安達", emoji: "🇷🇼", languageCode: "rw", languageName: "Kinyarwanda", languageNameZh: "盧安達文" },

  // ── North Africa ───────────────────────────────────────────────
  { code: "MA", name: "Morocco", nameZh: "摩洛哥", emoji: "🇲🇦", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "DZ", name: "Algeria", nameZh: "阿爾及利亞", emoji: "🇩🇿", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "TN", name: "Tunisia", nameZh: "突尼西亞", emoji: "🇹🇳", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "LY", name: "Libya", nameZh: "利比亞", emoji: "🇱🇾", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
  { code: "SD", name: "Sudan", nameZh: "蘇丹", emoji: "🇸🇩", languageCode: "ar", languageName: "Arabic", languageNameZh: "阿拉伯文", rtl: true },
];

/** Find a country by ISO code (case-insensitive). */
export function getCountry(code: string): CountryOption | undefined {
  return COUNTRIES.find(c => c.code.toLowerCase() === code.toLowerCase());
}

/** Get display name for a country code in the current language. */
export function getCountryDisplayName(code: string, lang: "zh-TW" | "en"): string {
  const c = getCountry(code);
  if (!c) return code;
  return lang === "zh-TW" && c.nameZh ? `${c.emoji} ${c.nameZh}` : `${c.emoji} ${c.name}`;
}

/** Map of ISO code → CountryOption for O(1) lookup. */
export const COUNTRY_MAP: Record<string, CountryOption> = Object.fromEntries(
  COUNTRIES.map(c => [c.code, c])
);
