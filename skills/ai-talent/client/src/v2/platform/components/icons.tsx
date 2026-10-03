/**
 * 全站圖示的唯一出口：一個意思只用一個圖，全部出自 FontAwesome Free（單色、跟文字同色）。
 *
 * 對照表（CJ 2026-09-29 確認）：https://claude.ai/artifact/Uq9LF9znNAqeqCPbU98wMA
 *
 * 用法：
 *   - 元件：<DeleteIcon size={14} />（size 同舊 lucide，數字＝px，預設 24）
 *   - 定義：<FontAwesomeIcon icon={ICON.delete} />（要傳 IconDefinition 的地方）
 *
 * 規則：不要再 import lucide-react，也不要用 emoji 當圖示。
 * 找不到對應概念時先加進 ICON，不要在頁面裡直接挑一個 fa* 圖。
 */
import type { CSSProperties, MouseEventHandler } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faWandMagicSparkles, faRotateRight, faRotateLeft, faUserPen, faPenToSquare, faTrashCan, faXmark,
  faPlus, faMagnifyingGlass, faCopy, faDownload, faArrowUpFromBracket, faPaperPlane,
  faArrowUpRightFromSquare, faShareNodes, faLock, faCircleCheck, faCheck, faTriangleExclamation,
  faCircleInfo, faCircleQuestion, faSpinner, faClock, faFlask, faUserTie, faFire, faImage, faImages,
  faVideo, faFileLines, faComment, faBoxOpen, faBookOpen, faBrain, faTag, faPenNib, faChartLine,
  faBullhorn, faFolderOpen, faLayerGroup, faComments, faClipboardCheck,
  faBell, faLanguage, faGear, faStore, faUsers, faUser, faUserPlus, faChevronLeft, faChevronRight,
  faArrowLeft, faFont, faBullseye, faShieldHalved, faPalette, faPlay, faQuoteLeft, faHashtag, faIdCard,
  faAward, faDollarSign, faBuilding, faBug, faInbox, faEnvelope, faFolder, faCircle, faBagShopping,
  faWaveSquare, faWrench, faGlobe, faChartColumn, faCircleDot, faPaste, faTableCellsLarge, faArrowPointer,
  faPause, faForwardStep, faStop, faCircleXmark, faLink, faLockOpen, faFlag, faPuzzlePiece, faMemory, faLightbulb,
  faCommentDots, faCompass, faMasksTheater, faBan, faGem, faStar, faChessKnight, faArrowTrendUp, faHeart, faMessage,
  faScaleBalanced, faHandshake,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faThreads, faLine, faTiktok, faYoutube, faLinkedin, faGoogle,
} from "@fortawesome/free-brands-svg-icons";

export const ICON = {
  // 動作
  generate: faWandMagicSparkles,
  regenerate: faRotateRight,
  sendBack: faRotateLeft,
  rewriteAs: faUserPen,
  edit: faPenToSquare,
  delete: faTrashCan,
  close: faXmark,
  add: faPlus,
  search: faMagnifyingGlass,
  copy: faCopy,
  download: faDownload,
  upload: faArrowUpFromBracket,
  send: faPaperPlane,
  external: faArrowUpRightFromSquare,
  share: faShareNodes,
  lock: faLock,
  unlock: faLockOpen,
  link: faLink,
  play: faPlay,
  back: faArrowLeft,
  chevronLeft: faChevronLeft,
  chevronRight: faChevronRight,
  // 狀態與提示
  done: faCircleCheck,
  check: faCheck,
  warning: faTriangleExclamation,
  error: faCircleXmark,
  flag: faFlag,
  info: faCircleInfo,
  help: faCircleQuestion,
  working: faSpinner,
  waiting: faClock,
  sample: faFlask,
  agent: faUserTie,
  viral: faFire,
  setupBySoWork: faWrench,
  // 主要導覽
  strategy: faBrain,
  brainCheck: faMemory,
  ideas: faLightbulb,
  brand: faTag,
  content: faPenNib,
  performance: faChartLine,
  campaign: faBullhorn,
  partner: faHandshake,
  project: faFolderOpen,
  taskCards: faLayerGroup,
  meeting: faComments,
  regulation: faScaleBalanced,
  review: faClipboardCheck,
  notify: faBell,
  language: faLanguage,
  settings: faGear,
  // 素材類型
  image: faImage,
  images: faImages,
  video: faVideo,
  text: faFileLines,
  comment: faComment,
  bundle: faBoxOpen,
  library: faBookOpen,
  // 其他通用
  people: faUsers,
  user: faUser,
  userAdd: faUserPlus,
  font: faFont,
  target: faBullseye,
  shield: faShieldHalved,
  palette: faPalette,
  quote: faQuoteLeft,
  hashtag: faHashtag,
  idCard: faIdCard,
  award: faAward,
  money: faDollarSign,
  building: faBuilding,
  bug: faBug,
  inbox: faInbox,
  mail: faEnvelope,
  folder: faFolder,
  dot: faCircle,
  shop: faBagShopping,
  activity: faWaveSquare,
  chart: faChartColumn,
  current: faCircleDot,
  paste: faPaste,
  grid: faTableCellsLarge,
  click: faArrowPointer,
  pause: faPause,
  skip: faForwardStep,
  stop: faStop,
  puzzle: faPuzzlePiece,
  // 品牌脈絡（任務 modal 的 context 圖示列；2026-09-30 CJ：語氣不用笑臉、WHY 不用燈泡）
  tone: faCommentDots,       // 語氣＝說話的方式
  why: faCompass,            // WHY＝品牌為什麼存在，是方向，不是點子
  persona: faMasksTheater,   // 品牌原型（智者、照顧者…）
  forbidden: faBan,
  values: faGem,
  standout: faStar,          // 差異化／獨家賣點
  competitor: faChessKnight,
  trend: faArrowTrendUp,
  feeling: faHeart,          // 使用者感受／情緒價值
  message: faMessage,        // 核心訊息
  // 通路與外部平台（單色 logo）
  facebook: faFacebook,
  instagram: faInstagram,
  threads: faThreads,
  line: faLine,
  tiktok: faTiktok,
  youtube: faYoutube,
  linkedin: faLinkedin,
  google: faGoogle,
  newsletter: faEnvelope,
  website: faGlobe,
  store: faStore,
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICON;

export interface IconProps {
  /** px 數字或 CSS 長度；沿用舊 lucide 的預設 24。 */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  color?: string;
  title?: string;
  onClick?: MouseEventHandler<SVGSVGElement>;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
  /** 舊 lucide 參數，FontAwesome 是實心圖示，忽略。 */
  strokeWidth?: number | string;
  /** 舊 lucide 參數（實心填色），FontAwesome 本來就是實心，忽略。 */
  fill?: string;
}

export function Icon({ name, ...rest }: IconProps & { name: IconName }) {
  return renderIcon(ICON[name], rest);
}

function renderIcon(def: IconDefinition, { size = 24, className, style, color, title, onClick, strokeWidth: _sw, fill: _fill, ...aria }: IconProps) {
  return (
    <FontAwesomeIcon
      icon={def}
      className={className}
      title={title}
      onClick={onClick}
      style={{ fontSize: typeof size === "number" ? `${size}px` : size, ...(color ? { color } : null), ...style }}
      {...aria}
    />
  );
}

const make = (name: IconName) => {
  const C = (p: IconProps) => renderIcon(ICON[name], p);
  C.displayName = `Icon(${name})`;
  return C;
};

export const GenerateIcon = make("generate");
export const RegenerateIcon = make("regenerate");
export const SendBackIcon = make("sendBack");
export const EditIcon = make("edit");
export const DeleteIcon = make("delete");
export const CloseIcon = make("close");
export const AddIcon = make("add");
export const SearchIcon = make("search");
export const CopyIcon = make("copy");
export const DownloadIcon = make("download");
export const UploadIcon = make("upload");
export const SendIcon = make("send");
export const ExternalIcon = make("external");
export const LockIcon = make("lock");
export const PlayIcon = make("play");
export const BackIcon = make("back");
export const ChevronLeftIcon = make("chevronLeft");
export const ChevronRightIcon = make("chevronRight");
export const DoneIcon = make("done");
export const CheckIcon = make("check");
export const WarningIcon = make("warning");
export const InfoIcon = make("info");
export const HelpIcon = make("help");
export const WaitingIcon = make("waiting");
export const AgentIcon = make("agent");
export const SetupBySoWorkIcon = make("setupBySoWork");
export const StrategyIcon = make("strategy");
export const PerformanceIcon = make("performance");
export const CampaignIcon = make("campaign");
export const ImageIcon = make("image");
export const TextIcon = make("text");
export const CommentIcon = make("comment");
export const BundleIcon = make("bundle");
export const LibraryIcon = make("library");
export const PeopleIcon = make("people");
export const UserIcon = make("user");
export const UserAddIcon = make("userAdd");
export const FontIcon = make("font");
export const TargetIcon = make("target");
export const ShieldIcon = make("shield");
export const PaletteIcon = make("palette");
export const QuoteIcon = make("quote");
export const HashtagIcon = make("hashtag");
export const IdCardIcon = make("idCard");
export const AwardIcon = make("award");
export const MoneyIcon = make("money");
export const BuildingIcon = make("building");
export const BugIcon = make("bug");
export const InboxIcon = make("inbox");
export const MailIcon = make("mail");
export const FolderIcon = make("folder");
export const DotIcon = make("dot");
export const ShopIcon = make("shop");
export const ActivityIcon = make("activity");
export const ChartIcon = make("chart");
export const CurrentIcon = make("current");
export const PasteIcon = make("paste");
export const ClickIcon = make("click");
export const PauseIcon = make("pause");
export const SkipIcon = make("skip");
export const StopIcon = make("stop");
export const WorkingIcon = make("working");
export const SampleIcon = make("sample");
export const TaskCardsIcon = make("taskCards");
export const MeetingIcon = make("meeting");
export const RegulationIcon = make("regulation");
export const ShareIcon = make("share");
export const RewriteAsIcon = make("rewriteAs");
export const ErrorIcon = make("error");
export const FlagIcon = make("flag");
export const LinkIcon = make("link");
export const PartnerIcon = make("partner");
export const PuzzleIcon = make("puzzle");
export const NotifyIcon = make("notify");
export const MemoryIcon = make("brainCheck");
