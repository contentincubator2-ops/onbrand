/**
 * EntityStats — single source of UI display for entity counts.
 *
 * Reads `entity.stats` and renders one of three layouts:
 *   - "inline":   N 方法論 · M 技能 · K Agents   (one-line, used in hero subtitles)
 *   - "row":      three Card cells side-by-side  (used as a banner above lists)
 *   - "table":    HeroUI Table with sub-breakdowns (used on dashboards / debug)
 *
 * Layout chosen via the `variant` prop. Same data, different look.
 */
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { Card, CardBody, Chip, Skeleton, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faCubes, faRobot } from "@fortawesome/free-solid-svg-icons";

interface Props {
  variant?: "inline" | "row" | "table";
  className?: string;
}

export function EntityStats({ variant = "inline", className }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const q = (trpc as any).entity?.stats?.useQuery
    ? (trpc as any).entity.stats.useQuery(undefined, {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      })
    : { data: null, isLoading: false };

  const data: any = q.data;

  if (q.isLoading) {
    if (variant === "inline") return <Skeleton className={className ?? "h-5 w-72 rounded"} />;
    return <Skeleton className={className ?? "h-24 w-full rounded-large"} />;
  }
  if (!data) return null;

  if (variant === "inline") {
    return (
      <span className={className ?? "text-medium text-default-500"}>
        <b className="text-foreground">{data.squad.curated}</b> 精選方法論
        （共 {data.squad.total}）
        ・<b className="text-foreground">{data.skill.total}</b> 技能
        ・<b className="text-foreground">{data.agent.available}</b> {en ? "Agents" : "AI 專家"}
      </span>
    );
  }

  if (variant === "row") {
    return (
      <div className={`grid grid-cols-3 gap-3 ${className ?? ""}`}>
        <StatCell icon={faUsers} label="方法論小組" main={data.squad.curated} sub={`精選 / 全部 ${data.squad.total}`} />
        <StatCell icon={faCubes}  label="技能"        main={data.skill.total} sub={originBreakdown(data.skill.byOrigin)} />
        <StatCell icon={faRobot}  label={en ? "Agents" : "AI 專家"}      main={data.agent.available} sub={`可用 / 全部 ${data.agent.total}`} />
      </div>
    );
  }

  // table
  return (
    <Table aria-label="實體數量統計" removeWrapper className={className}>
      <TableHeader>
        <TableColumn>類型</TableColumn>
        <TableColumn>總數</TableColumn>
        <TableColumn>L1</TableColumn>
        <TableColumn>L2</TableColumn>
        <TableColumn>L3</TableColumn>
        <TableColumn>L4</TableColumn>
        <TableColumn>L5</TableColumn>
        <TableColumn>L6</TableColumn>
      </TableHeader>
      <TableBody>
        <TableRow key="squad">
          <TableCell>方法論（精選 {data.squad.curated} / 全部 {data.squad.total}）</TableCell>
          <TableCell>{data.squad.total}</TableCell>
          <TableCell>{data.squad.byLayer.L1 ?? 0}</TableCell>
          <TableCell>{data.squad.byLayer.L2 ?? 0}</TableCell>
          <TableCell>{data.squad.byLayer.L3 ?? 0}</TableCell>
          <TableCell>{data.squad.byLayer.L4 ?? 0}</TableCell>
          <TableCell>{data.squad.byLayer.L5 ?? 0}</TableCell>
          <TableCell>{data.squad.byLayer.L6 ?? 0}</TableCell>
        </TableRow>
        <TableRow key="skill">
          <TableCell>技能（{originBreakdown(data.skill.byOrigin)}）</TableCell>
          <TableCell>{data.skill.total}</TableCell>
          <TableCell>{data.skill.byLayer.L1 ?? 0}</TableCell>
          <TableCell>{data.skill.byLayer.L2 ?? 0}</TableCell>
          <TableCell>{data.skill.byLayer.L3 ?? 0}</TableCell>
          <TableCell>{data.skill.byLayer.L4 ?? 0}</TableCell>
          <TableCell>{data.skill.byLayer.L5 ?? 0}</TableCell>
          <TableCell>{data.skill.byLayer.L6 ?? 0}</TableCell>
        </TableRow>
        <TableRow key="agent">
          <TableCell>Agents（可用 {data.agent.available} / 全部 {data.agent.total}）</TableCell>
          <TableCell>{data.agent.total}</TableCell>
          <TableCell>{tierChips(data.agent.byTier)}</TableCell>
          <TableCell>—</TableCell>
          <TableCell>—</TableCell>
          <TableCell>—</TableCell>
          <TableCell>—</TableCell>
          <TableCell>—</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function StatCell({
  icon, label, main, sub,
}: { icon: any; label: string; main: number | string; sub: string }) {
  return (
    <Card shadow="sm">
      <CardBody className="flex flex-row items-center gap-3">
        <FontAwesomeIcon icon={icon} className="text-2xl text-default-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-tiny text-default-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{main}</p>
          <p className="text-tiny text-default-400 truncate">{sub}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function tierChips(byTier: Record<string, number>) {
  return (
    <span className="flex flex-wrap gap-1">
      {Object.entries(byTier).map(([k, v]) => (
        <Chip key={k} size="sm" variant="flat" className="capitalize">{k}: {String(v)}</Chip>
      ))}
    </span>
  );
}

function originBreakdown(byOrigin: Record<string, number> | undefined): string {
  if (!byOrigin) return "";
  const order = ["claude", "openai", "gemini", "deepseek", "qwen", "cross"];
  const parts: string[] = [];
  for (const k of order) {
    if (byOrigin[k]) parts.push(`${k} ${byOrigin[k]}`);
  }
  for (const [k, v] of Object.entries(byOrigin)) {
    if (!order.includes(k) && v) parts.push(`${k} ${v}`);
  }
  return parts.join(" · ");
}
