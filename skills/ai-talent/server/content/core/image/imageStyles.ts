/**
 * 圖片卡的「畫面樣式」清單（2026-10-04 CJ「底圖的樣式，也要給用戶多點選擇」）。
 * 單一來源：前台從 imageCard.list 拿到 id／名稱，只在前台自己配圖示；生圖時用 promptEn。
 * 樣式管的是「怎麼畫」（質感、色調、筆觸），不管「畫什麼」——場景與主體仍由方向／分鏡決定。
 */
export interface ImageStyle {
  id: string;
  labelZh: string;
  labelEn: string;
  promptEn: string;
}

export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: "photo", labelZh: "真實攝影", labelEn: "Photo",
    promptEn: "Realistic commercial photography: natural light, true-to-life colours, shallow depth of field, fine photographic grain.",
  },
  {
    id: "fresh", labelZh: "日系清新", labelEn: "Fresh",
    promptEn: "Japanese-style fresh photography: bright airy exposure, soft diffused daylight, low contrast, pastel and slightly desaturated colours, gentle whites.",
  },
  {
    id: "minimal", labelZh: "極簡留白", labelEn: "Minimal",
    promptEn: "Minimalist composition: one clear subject, large areas of clean empty space, a restrained two-to-three colour palette, flat soft light, no clutter.",
  },
  {
    id: "illustration", labelZh: "插畫", labelEn: "Illustration",
    promptEn: "Flat vector-style editorial illustration: clean shapes, bold simple colour blocks, subtle texture, no photorealism.",
  },
  {
    id: "watercolor", labelZh: "手繪水彩", labelEn: "Watercolour",
    promptEn: "Hand-painted watercolour: soft bleeding washes, visible paper texture, loose brush edges, translucent layered colour.",
  },
  {
    id: "render3d", labelZh: "3D 渲染", labelEn: "3D render",
    promptEn: "Polished 3D render: smooth soft-clay or glossy materials, studio lighting, gentle shadows, rounded forms, clean backdrop.",
  },
  {
    id: "film", labelZh: "復古膠片", labelEn: "Film",
    promptEn: "Vintage film photography: warm faded tones, lifted blacks, visible film grain, soft halation around highlights, slightly imperfect framing.",
  },
  {
    id: "brandblock", labelZh: "品牌色塊", labelEn: "Colour blocks",
    promptEn: "Bold graphic poster look: large flat blocks of the brand colours, simple geometric shapes, strong contrast, the subject cut cleanly against the colour field.",
  },
];

export function getImageStyle(id: string | null | undefined): ImageStyle | null {
  return IMAGE_STYLES.find((s) => s.id === id) ?? null;
}

export const IMAGE_STYLE_IDS = IMAGE_STYLES.map((s) => s.id) as [string, ...string[]];
