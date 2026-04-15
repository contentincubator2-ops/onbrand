/**
 * 全球化設定
 * 支援 13 個目標市場 × 16 種內容語言
 */

// ─── Target Markets ──────────────────────────────────────────────────────────

export const TARGET_MARKETS = [
  { code: "TW", name: "台灣",         currency: "TWD", locale: "zh-TW", timezone: "Asia/Taipei"      },
  { code: "HK", name: "香港",         currency: "HKD", locale: "zh-HK", timezone: "Asia/Hong_Kong"   },
  { code: "CN", name: "中國大陸",     currency: "CNY", locale: "zh-CN", timezone: "Asia/Shanghai"    },
  { code: "SG", name: "新加坡",       currency: "SGD", locale: "en-SG", timezone: "Asia/Singapore"   },
  { code: "MY", name: "馬來西亞",     currency: "MYR", locale: "ms-MY", timezone: "Asia/Kuala_Lumpur"},
  { code: "JP", name: "日本",         currency: "JPY", locale: "ja-JP", timezone: "Asia/Tokyo"       },
  { code: "KR", name: "韓國",         currency: "KRW", locale: "ko-KR", timezone: "Asia/Seoul"       },
  { code: "TH", name: "泰國",         currency: "THB", locale: "th-TH", timezone: "Asia/Bangkok"     },
  { code: "PH", name: "菲律賓",       currency: "PHP", locale: "en-PH", timezone: "Asia/Manila"      },
  { code: "ID", name: "印尼",         currency: "IDR", locale: "id-ID", timezone: "Asia/Jakarta"     },
  { code: "VN", name: "越南",         currency: "VND", locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" },
  { code: "US", name: "美國",         currency: "USD", locale: "en-US", timezone: "America/New_York" },
  { code: "GB", name: "英國",         currency: "GBP", locale: "en-GB", timezone: "Europe/London"    },
] as const;

export type MarketCode = typeof TARGET_MARKETS[number]["code"];

// ─── Content Languages ───────────────────────────────────────────────────────

export const CONTENT_LANGUAGES = [
  { code: "zh-TW", name: "繁體中文",      nativeName: "繁體中文"           },
  { code: "zh-CN", name: "简体中文",      nativeName: "简体中文"           },
  { code: "zh-HK", name: "粵語 (繁體)",   nativeName: "粵語（繁體）"       },
  { code: "en",    name: "English",        nativeName: "English"            },
  { code: "ja",    name: "日本語",         nativeName: "日本語"             },
  { code: "ko",    name: "한국어",         nativeName: "한국어"             },
  { code: "th",    name: "ภาษาไทย",       nativeName: "ภาษาไทย"           },
  { code: "vi",    name: "Tiếng Việt",     nativeName: "Tiếng Việt"         },
  { code: "id",    name: "Bahasa Indonesia", nativeName: "Bahasa Indonesia" },
  { code: "ms",    name: "Bahasa Melayu",  nativeName: "Bahasa Melayu"      },
  { code: "tl",    name: "Filipino",       nativeName: "Filipino"           },
  { code: "fr",    name: "Français",       nativeName: "Français"           },
  { code: "de",    name: "Deutsch",        nativeName: "Deutsch"            },
  { code: "es",    name: "Español",        nativeName: "Español"            },
  { code: "pt",    name: "Português",      nativeName: "Português"          },
  { code: "ar",    name: "العربية",        nativeName: "العربية"            },
] as const;

export type LanguageCode = typeof CONTENT_LANGUAGES[number]["code"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Look up a market by its ISO code. Returns undefined if not found.
 */
export function getMarket(code: MarketCode) {
  return TARGET_MARKETS.find((m) => m.code === code);
}

/**
 * Look up a language entry by its BCP-47 code.
 */
export function getLanguage(code: LanguageCode) {
  return CONTENT_LANGUAGES.find((l) => l.code === code);
}

/**
 * Return the primary language code for a given market.
 * Falls back to "en" for markets without an explicit mapping.
 */
export function getDefaultLanguageForMarket(marketCode: MarketCode): LanguageCode {
  const map: Record<MarketCode, LanguageCode> = {
    TW: "zh-TW",
    HK: "zh-HK",
    CN: "zh-CN",
    SG: "en",
    MY: "ms",
    JP: "ja",
    KR: "ko",
    TH: "th",
    PH: "tl",
    ID: "id",
    VN: "vi",
    US: "en",
    GB: "en",
  };
  return map[marketCode] ?? "en";
}

/**
 * Returns all markets that use a given language as their primary language.
 */
export function getMarketsForLanguage(languageCode: LanguageCode): MarketCode[] {
  return TARGET_MARKETS
    .filter((m) => getDefaultLanguageForMarket(m.code) === languageCode)
    .map((m) => m.code);
}
