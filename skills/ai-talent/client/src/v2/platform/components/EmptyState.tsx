/**
 * 空白頁：一個圖示＋一行短標題＋一個主要動作。不要放說明段落，
 * 需要解釋的話放進 hint（會收進「?」）。
 *
 *   <EmptyState icon={ICON.brand} title="還沒有品牌" action={{ label: "新增品牌", onPress: open }} />
 */
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Button } from "@heroui/react";
import { ICON } from "./icons";
import { HelpTip } from "./HelpTip";

export function EmptyState({
  icon, title, action, hint, compact,
}: {
  icon: IconDefinition;
  title: ReactNode;
  action?: { label: ReactNode; onPress: () => void; icon?: IconDefinition };
  hint?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 ${compact ? "py-8" : "py-16"}`}>
      <div className="flex items-center justify-center rounded-full bg-default-100 text-default-500" style={{ width: compact ? 44 : 56, height: compact ? 44 : 56 }}>
        <FontAwesomeIcon icon={icon} style={{ fontSize: compact ? 18 : 22 }} />
      </div>
      <div className="flex items-center gap-1 text-[15px] font-medium text-default-800">
        {title}
        {hint ? <HelpTip>{hint}</HelpTip> : null}
      </div>
      {action ? (
        <Button
          size="sm"
          color="default"
          variant="solid"
          className="bg-default-900 text-white"
          startContent={<FontAwesomeIcon icon={action.icon ?? ICON.add} />}
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
