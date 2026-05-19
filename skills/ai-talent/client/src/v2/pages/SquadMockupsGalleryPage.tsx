/**
 * SquadMockupsGalleryPage — design-system gallery for the 5 squad mockup
 * variants. Lets CJ review the look & data shape before they get wired
 * into the live squad runner.
 *
 * Uses Pokemon GO Deino Community Day (May 2026) as the test case.
 *
 * Route: /squad-mockups (registered in AppV2 router)
 */
import React from "react";
import { Tabs, Tab, Card, CardBody, Avatar, Switch, Chip } from "@heroui/react";
import { resolveAvatarUrl } from "../lib/avatarUrl";
import {
  IntakeFormMockup,
  PillarTableMockup,
  CalendarGridMockup,
  FBPostBriefMockup,
  QAReportMockup,
} from "../components/SquadMockups";
import {
  SAMPLE_INTAKE, SAMPLE_PILLARS, SAMPLE_CALENDAR,
  SAMPLE_BRIEFS, SAMPLE_QA,
} from "./squad-lab/sampleData";

// ── Crew (matches squads.agents JSON for #725 fb-monthly-calendar-pulizzi) ─
const CREW = [
  { id: 180159, role: "Squad Lead",                    name: "Claire Hsu",   slug: null,                              isLead: true,  step: "0/1/6" },
  { id: 239180, role: "Audience Insight Lead",         name: "Stacy Lin",    slug: "audience-insight-lead",           isLead: false, step: "2"     },
  { id: 239181, role: "Content Pillar Architect",      name: "Vincent Shen", slug: "content-pillar-architect",        isLead: false, step: "3"     },
  { id: 239182, role: "Editorial Calendar Lead",       name: "Phoebe Yang",  slug: "editorial-calendar-architect",    isLead: false, step: "4"     },
  { id: 239183, role: "FB Content Brief Writer",       name: "Aiden Hsu",    slug: "fb-brief-writer",                 isLead: false, step: "5"     },
  { id: 239184, role: "FB Visual Direction Lead",      name: "Mandy Cheng",  slug: "fb-visual-director",              isLead: false, step: "5"     },
] as const;

const avatarFor = (slug: string | null, displayPx: number) => {
  if (!slug) return null;
  return resolveAvatarUrl(`/static/covers/agent-${slug}.png`, displayPx);
};


// ── Crew header strip ──────────────────────────────────────────────────
function CrewHeader() {
  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-4">
        <p className="text-tiny text-default-500 uppercase tracking-wider mb-2">
          SQUAD #725 · CREW (6 agents)
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {CREW.map((m) => {
            const src = avatarFor(m.slug, 64);
            return (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-divider bg-content1 min-w-0">
                <Avatar
                  size="sm"
                  src={src ?? undefined}
                  name={m.name}
                  className="shrink-0"
                  showFallback
                />
                <div className="min-w-0">
                  <p className="text-tiny font-semibold truncate flex items-center gap-1">
                    {m.name}
                    {m.isLead && <Chip size="sm" variant="flat" color="primary" className="h-4 text-tiny">Lead</Chip>}
                  </p>
                  <p className="text-tiny text-default-500 truncate">
                    {m.role} · 步驟 {m.step}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

export default function SquadMockupsGalleryPage() {
  const [showActive, setShowActive] = React.useState(false);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-tiny text-default-500 uppercase tracking-wider">DESIGN SYSTEM · GALLERY</p>
            <h1 className="text-2xl font-semibold tracking-tight">FB 月行事曆小組 — 6 個預覽</h1>
            <p className="text-small text-default-500 mt-1">
              測試案例：Pokemon GO 台灣社群 · 2026/5/4 → 5/31（Deino Community Day Classic 5/17）
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch size="sm" isSelected={showActive} onValueChange={setShowActive}>
              <span className="text-tiny">Show 「執行中」 indicator</span>
            </Switch>
          </div>
        </header>

        <div className="mb-4">
          <CrewHeader />
        </div>

        <Tabs aria-label="squad mockup gallery" variant="underlined" color="primary">
          <Tab key="intake" title="① Intake / Checkpoint">
            <IntakeFormMockup data={SAMPLE_INTAKE} readOnly={false} isActive={showActive} />
          </Tab>
          <Tab key="pillar" title="③ Pillars">
            <PillarTableMockup data={SAMPLE_PILLARS} readOnly isActive={showActive} />
          </Tab>
          <Tab key="calendar" title="④ Calendar">
            <CalendarGridMockup data={SAMPLE_CALENDAR} readOnly isActive={showActive} />
          </Tab>
          <Tab key="brief" title="⑤ Post Briefs">
            <FBPostBriefMockup data={{ briefs: SAMPLE_BRIEFS }} readOnly isActive={showActive} />
          </Tab>
          <Tab key="qa" title="⑥ QA Report">
            <QAReportMockup data={SAMPLE_QA} readOnly isActive={showActive} />
          </Tab>
        </Tabs>

        <Card shadow="none" className="border border-divider mt-6">
          <CardBody className="px-5 py-4 gap-1">
            <p className="text-tiny text-default-500 uppercase tracking-wider">關於這個 Gallery</p>
            <p className="text-small text-default-700 leading-relaxed">
              這 5 個 mockup 是 squad <code className="text-tiny">fb-monthly-calendar-pulizzi</code>（id=725）每個 step 上線後會渲染的 UI。
              squad <code>is_approved=0</code>（draft），等你 review 通過才會在前台 picker 出現。
              demo 用 Pokemon GO Deino CD 擬真資料 — 真實跑時各步驟的 AI 專家把結論寫進對應儲存欄，這些預覽畫面從儲存欄讀取渲染。打開「執行中」開關可預覽各步驟執行中的 AI 專家進度狀態。
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
