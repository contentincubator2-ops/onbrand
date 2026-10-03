/**
 * 「通路」tray 的內容——七個平台各一張 PositioningCard（同品牌定位總覽的卡片），
 * 點開是 ChannelRoleModal（五格 + 與 AI 討論 + 貼上現成文字）。
 *
 * 2026-10-03（CJ「不同平台的定位不同，不是加在品牌頁面，而是增加一個 mission tray，
 * 呈現方式參考品牌頁面」）。資料在 brands.positioning.channelRoles，跟品牌定位同一份 JSON，
 * 所以讀的是 BrandsPage 已經載入的 positioningSegmentData，不另外查詢。
 */
import { useLang } from "../../../../lib/i18n";
import { ICON } from "../../../platform/components/icons";
import { PositioningCard, SectionLabel, truncate } from "./PositioningGrid";
import {
  CHANNELS, normalizeRole, roleFilledCount, roleHeadline, roleIsEmpty, type ChannelId,
} from "../../lib/channelRoles";

export default function ChannelRolesTray({
  channelRoles, onEdit,
}: {
  channelRoles?: Record<string, any>;
  onEdit: (channel: ChannelId) => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  return (
    <div style={{ padding: "8px 0 32px" }}>
      <SectionLabel
        label={en ? "Platform roles" : "通路角色"}
        counter={`${CHANNELS.filter((c) => !roleIsEmpty(channelRoles?.[c.id])).length} / ${CHANNELS.length}`}
        intro={en
          ? "The same brand plays a different role on each platform — who it talks to, what it says, what it leaves out. Only tasks that publish to a platform read that platform's card; shared brand positioning stays on the Brand page."
          : "同一個品牌，在每個平台扮演的角色不一樣：對誰說、說什麼、不說什麼。只有發在該平台的任務會讀到那個平台的卡片；品牌共通的定位仍然放在「品牌」頁。"}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {CHANNELS.map((ch) => {
          const role = normalizeRole(channelRoles?.[ch.id]);
          const filled = roleFilledCount(role);
          const hasContent = filled > 0;
          const headline = roleHeadline(role);
          return (
            <PositioningCard
              key={ch.id}
              label={en ? ch.en : ch.zh}
              icon={ICON[ch.icon]}
              onClick={() => onEdit(ch.id)}
              hasContent={hasContent}
              headline={headline ? truncate(headline, 50) : undefined}
              rationale={en ? ch.hintEn : ch.hintZh}
              preview={hasContent ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {role.audience && (
                    <li><strong style={{ color: "#171717", fontWeight: 600 }}>{en ? "To: " : "對象："}</strong>{truncate(role.audience, 40)}</li>
                  )}
                  {role.tone && (
                    <li><strong style={{ color: "#171717", fontWeight: 600 }}>{en ? "Tone: " : "語氣："}</strong>{truncate(role.tone, 40)}</li>
                  )}
                </ul>
              ) : undefined}
              sourceLabel={hasContent
                ? (en ? `${filled} / 5 filled` : `已填 ${filled} / 5 格`)
                : (en ? "Platform role" : "通路角色")}
            />
          );
        })}
      </div>
    </div>
  );
}
