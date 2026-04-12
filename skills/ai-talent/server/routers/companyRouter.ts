import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { mosCompanies, mosCompanyAgents, mosDepartments, brands, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

export const companyRouter = router({
  // 取得或建立當前用戶的企業
  getOrCreate: protectedProcedure
    .input(z.object({ name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const userId = ctx.user!.id;

      // 查用戶是否已有 companyId
      const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userRows[0];

      if (user?.companyId) {
        const companyRows = await db.select().from(mosCompanies).where(eq(mosCompanies.id, user.companyId)).limit(1);
        return companyRows[0] ?? null;
      }

      // 建立新企業
      const companyName = input.name ?? "我的企業";
      const [insertResult] = await db.insert(mosCompanies).values({ name: companyName });
      const companyId = (insertResult as any).insertId as number;

      // 更新 user.companyId
      await db.update(users).set({ companyId }).where(eq(users.id, userId));

      // 建立 company_agent workspace
      const workspacePath = `/home/azureuser/marketing-os/workspaces/${companyId}`;
      await db.insert(mosCompanyAgents).values({
        companyId,
        workspacePath,
        sessionKey: `company-${companyId}-${Date.now()}`,
        soulMdContent: `# ${companyName} Agent\n\n你是 ${companyName} 的行銷 AI 助理。`,
        memoryMdContent: `# ${companyName} 記憶\n\n## 基本資訊\n- 企業名稱：${companyName}\n`,
      });

      // 建立 workspace 目錄 + 檔案
      try {
        fs.mkdirSync(workspacePath, { recursive: true });
        fs.writeFileSync(
          path.join(workspacePath, "SOUL.md"),
          `# ${companyName} Agent\n\n你是 ${companyName} 的行銷 AI 助理。`
        );
        fs.writeFileSync(
          path.join(workspacePath, "MEMORY.md"),
          `# ${companyName} 記憶\n\n## 基本資訊\n- 企業名稱：${companyName}\n`
        );
      } catch (e) {
        console.warn("[companyRouter] workspace dir creation warning:", e);
      }

      const newCompany = await db.select().from(mosCompanies).where(eq(mosCompanies.id, companyId)).limit(1);
      return newCompany[0] ?? null;
    }),

  // 取得企業資訊
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user!.id;

    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user?.companyId) return null;

    const companyRows = await db.select().from(mosCompanies).where(eq(mosCompanies.id, user.companyId)).limit(1);
    return companyRows[0] ?? null;
  }),

  // 新增部門
  addDepartment: protectedProcedure
    .input(z.object({ name: z.string(), brandId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const userId = ctx.user!.id;

      const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userRows[0];
      if (!user?.companyId) throw new Error("No company found for this user");

      const [result] = await db.insert(mosDepartments).values({
        companyId: user.companyId,
        brandId: input.brandId,
        name: input.name,
      });
      return { id: (result as any).insertId as number };
    }),

  // 列出部門
  listDepartments: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user!.id;

    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user?.companyId) return [];

    return db.select().from(mosDepartments).where(eq(mosDepartments.companyId, user.companyId));
  }),
});
