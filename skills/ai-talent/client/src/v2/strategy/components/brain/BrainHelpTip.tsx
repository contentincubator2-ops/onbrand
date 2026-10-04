import { HelpTip } from "../../../platform/components/HelpTip";

/** One copy of the Brand Brain explainer, shared by the Memory view and the Brands page. */
export function BrainHelpTip({ en }: { en: boolean }) {
  return (
    <HelpTip>{en
      ? "This is the one Brand Brain every writer reads — and the post-write checker reviews each draft against it."
      : "這是所有寫手共用的同一顆品牌大腦，寫完之後的檢查也是拿它來對照每一篇。"}</HelpTip>
  );
}
