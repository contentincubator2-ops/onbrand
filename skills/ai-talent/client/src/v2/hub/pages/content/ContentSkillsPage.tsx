import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import ContentSkills from "../../components/content-skills";
import { useT } from "../../lang";

export default function ContentSkillsPage() {
  const t = useT();
  const content = trpc.hub.admin.content.useQuery(undefined, { staleTime: 30_000 });
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Content · Skill library", "內容 · 寫作技能庫")}
        title={t("Company-approved ways to write a post", "公司核准的寫作技能")}
        subtitle={t(
          "Each skill is a SKILL.md, the same format Hermes Agent loads. Reps only see approved skills for their market.",
          "每個技能都是一份 SKILL.md，和 Hermes Agent 載入的格式相同；業務只看得到自己市場已核准的技能。",
        )}
      />
      {content.isLoading ? <Loading /> : <ErrorNote error={content.error} />}
      {content.data ? <ContentSkills skills={content.data.skills} /> : null}
    </div>
  );
}
