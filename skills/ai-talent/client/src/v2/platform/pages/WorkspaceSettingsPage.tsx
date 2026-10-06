/**
 * /settings/workspace — 團隊 workspace 管理（專業方案 5 席）。
 * 2026-05-12 起建；2026-09-07 Studio／Agency 方案下架，CJ「workspace 就是現在的 5 人團隊方案」。
 *
 * Lists workspaces the user belongs to. For each:
 *   - members (with role + remove/setRole controls for owners)
 *   - brand list (with brand-scoping for viewers)
 *   - invite-by-email form
 *   - white-label name/logo (enterprise only)
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../components/Toast";
import { BuildingIcon, ChevronLeftIcon, DeleteIcon, ShieldIcon, UserAddIcon } from "../components/icons";

type Role = "owner" | "admin" | "editor" | "viewer";

// 中英放同一張表（englishCoverage.test.ts 要看得出這些中文有英文對照）。
const ROLE_LABELS: Record<"zh" | "en", Record<Role, string>> = {
  zh: {
    owner: "擁有者",
    admin: "管理者（全部權限）",
    editor: "編輯者（撰寫內容）",
    viewer: "檢視者（僅查看）",
  },
  en: {
    owner: "Owner",
    admin: "Admin (everything)",
    editor: "Editor (writes content)",
    viewer: "Viewer (read-only)",
  },
};

const PLAN_LABEL_EN: Record<string, string> = {
  trial:        "Trial",
  solo:         "Solo",
  drop_starter: "onBrand Studio Basic",
  drop_pro:     "onBrand Studio Professional",
  enterprise:   "Enterprise",
};
function planLabel(code: string, lang: string): string | undefined {
  return lang === "en" ? PLAN_LABEL_EN[code] : PLAN_LABEL[code];
}
const PLAN_LABEL: Record<string, string> = {
  trial:        "Trial",
  solo:         "Solo",
  drop_starter: "onBrand Studio 基礎版",
  drop_pro:     "onBrand Studio 專業版",
  enterprise:   "Enterprise",
};

export default function WorkspaceSettingsPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQ = (trpc as any).tenant?.listMine?.useQuery
    ? (trpc as any).tenant.listMine.useQuery()
    : { data: [], refetch: () => {} };
  const workspaces = (listQ?.data ?? []) as any[];

  // auto-pick first workspace
  React.useEffect(() => {
    if (selectedId === null && workspaces.length > 0) {
      setSelectedId(workspaces[0].id);
    }
  }, [workspaces, selectedId]);

  const detailQ = (trpc as any).tenant?.detail?.useQuery
    ? (trpc as any).tenant.detail.useQuery(
        { workspaceId: selectedId ?? 0 },
        { enabled: !!selectedId },
      )
    : { data: null, refetch: () => {} };

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-6">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1 mb-6"
        >
          <ChevronLeftIcon size={16} /> {lang === "en" ? "Back" : "返回"}
        </button>

        <h1 className="text-2xl font-bold text-neutral-900 mb-6">{lang === "en" ? "Workspace settings" : "工作空間設定"}</h1>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar: workspace list */}
          <aside className="space-y-1">
            {listQ?.isLoading ? (
              <p className="text-sm text-neutral-400">{lang === "en" ? "Loading…" : "載入中…"}</p>
            ) : workspaces.length === 0 ? (
              <p className="text-sm text-neutral-400">{lang === "en" ? "No workspaces yet" : "還沒有工作空間"}</p>
            ) : (
              workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    selectedId === w.id
                      ? "bg-neutral-900 text-white"
                      : "hover:bg-neutral-100 text-neutral-700"
                  }`}
                >
                  <div className="font-medium flex items-center gap-1.5">
                    <BuildingIcon size={14} /> {w.name}
                  </div>
                  <div className={`text-xs mt-0.5 ${selectedId === w.id ? "text-neutral-300" : "text-neutral-400"}`}>
                    {planLabel(w.planCode, lang) ?? w.planCode} · {lang === "en"
                      ? `${w.memberCount} members · ${w.brandCount} brands`
                      : `${w.memberCount} 位成員 · ${w.brandCount} 品牌`}
                  </div>
                </button>
              ))
            )}
          </aside>

          {/* Main: workspace detail */}
          <main>
            {selectedId && detailQ?.data ? (
              <WorkspaceDetail
                detail={detailQ.data as any}
                onChanged={() => {
                  (detailQ as any)?.refetch?.();
                  (listQ as any)?.refetch?.();
                }}
              />
            ) : (
              <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-400 text-sm">
                {lang === "en" ? "Pick a workspace on the left" : "選擇左側一個工作空間"}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function WorkspaceDetail({ detail, onChanged }: { detail: any; onChanged: () => void }) {
  const { lang } = useLang();
  const ROLE_LABEL = ROLE_LABELS[lang === "en" ? "en" : "zh"];
  const ws = detail.workspace;
  const myRole: Role = detail.myRole;
  const members = (detail.members ?? []) as any[];
  // 2026-09-07 席次上限。邀到第 6 個才被擋是死路，事前就要看得到「已用 N／M」。
  const statusQ = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery()
    : { data: undefined };
  const seatLimit: number | undefined = (statusQ.data as any)?.quota?.team_members;
  const seatLabel = seatLimit === undefined || seatLimit === -1
    ? ""
    : (lang === "en" ? ` / ${seatLimit} seats` : ` ／ ${seatLimit} 席`);
  const brands = (detail.brands ?? []) as any[];
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const inviteMut = (trpc as any).tenant?.invite?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Member added" : "已加入成員", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Couldn't invite" : "邀請失敗")),
  });
  const setRoleMut = (trpc as any).tenant?.setRole?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Role updated" : "角色已更新", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Update failed" : "更新失敗")),
  });
  const setPermsMut = (trpc as any).tenant?.setPermissions?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Permissions updated" : "權限已更新", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Update failed" : "更新失敗")),
  });
  const removeMut = (trpc as any).tenant?.removeMember?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Removed" : "已移除", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Couldn't remove" : "移除失敗")),
  });
  const updateMut = (trpc as any).tenant?.update?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Saved" : "已儲存", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Update failed" : "更新失敗")),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviteBrandIds, setInviteBrandIds] = useState<number[]>([]);
  const [inviteStrategy, setInviteStrategy] = useState(false);
  const [invitePublish, setInvitePublish] = useState(false);
  const brandName = (id: number) => brands.find((b) => b.id === id)?.name ?? `#${id}`;
  const [wlName, setWlName] = useState(ws.whiteLabelName ?? "");
  const [wlLogo, setWlLogo] = useState(ws.whiteLabelLogo ?? "");

  const canWhiteLabel = ws.planCode === "enterprise";

  return (
    <div className="space-y-6">
      {/* Workspace header */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{ws.name}</h2>
            <p className="text-xs text-neutral-500 mt-1">
              {lang === "en" ? "Plan: " : "方案："}{planLabel(ws.planCode, lang) ?? ws.planCode} ·
              {lang === "en" ? " Your role:" : "你的角色："}<span className="font-medium ml-1">{ROLE_LABEL[myRole]}</span>
            </p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">
            ID #{ws.id}
          </span>
        </div>
      </section>

      {/* Members */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <ShieldIcon size={16} /> {lang === "en" ? `Members (${members.length}${seatLabel})` : `成員（${members.length}${seatLabel}）`}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="text-left py-2">{lang === "en" ? "Name" : "姓名"}</th>
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">{lang === "en" ? "Role" : "角色"}</th>
                <th className="text-left py-2">{lang === "en" ? "Permissions" : "權限"}</th>
                <th className="text-right py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-neutral-100">
                  <td className="py-2 font-medium text-neutral-900">{m.name ?? "—"}</td>
                  <td className="py-2 text-neutral-600">{m.email}</td>
                  <td className="py-2">
                    {isOwner && m.role !== "owner" ? (
                      <select
                        value={m.role}
                        onChange={(e) => setRoleMut?.mutate({
                          workspaceId: ws.id,
                          userId: m.userId,
                          role: e.target.value as Role,
                        })}
                        className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="admin">{ROLE_LABEL.admin}</option>
                        <option value="editor">{ROLE_LABEL.editor}</option>
                        <option value="viewer">{ROLE_LABEL.viewer}</option>
                      </select>
                    ) : (
                      <span className="text-xs text-neutral-700">{ROLE_LABEL[m.role as Role]}</span>
                    )}
                  </td>
                  <td className="py-2">
                    {m.role === "editor" ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {([
                          ["canEditStrategy", lang === "en" ? "Edit positioning" : "修改定位"],
                          ["canPublish", lang === "en" ? "Publish" : "發布"],
                        ] as const).map(([key, label]) => {
                          const enabled = !!m.permissions?.[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={!canManage || setPermsMut?.isPending}
                              aria-pressed={enabled}
                              onClick={() => setPermsMut?.mutate({ workspaceId: ws.id, userId: m.userId, [key]: !enabled })}
                              className={`text-xs px-2 py-1 rounded-full border transition disabled:cursor-default ${
                                enabled
                                  ? "bg-neutral-900 text-white border-neutral-900"
                                  : "border-neutral-300 text-neutral-500 hover:border-neutral-500"
                              }`}
                            >
                              {label}{enabled ? (lang === "en" ? ": on" : "：開") : (lang === "en" ? ": off" : "：關")}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        {m.role === "viewer"
                          ? (lang === "en" ? "Read only" : "只能查看")
                          : (lang === "en" ? "Everything" : "全部")}
                      </span>
                    )}
                    {(m.role === "editor" || m.role === "viewer") && (
                      <p className="text-xs text-neutral-400 mt-1">
                        {(m.brandIds ?? []).length === 0
                          ? (lang === "en" ? "All brands" : "所有品牌")
                          : (lang === "en" ? "Brands: " : "品牌：") + (m.brandIds as number[]).map(brandName).join("、")}
                      </p>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {canManage && m.role !== "owner" && (
                      <button
                        onClick={() => {
                          const msg = lang === "en" ? `Remove ${m.email}?` : `確定移除 ${m.email}？`;
                          if (confirm(msg)) {
                            removeMut?.mutate({ workspaceId: ws.id, userId: m.userId });
                          }
                        }}
                        className="text-xs text-red-600 hover:text-red-800 transition"
                      >
                        <DeleteIcon size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Invite form */}
        {canManage && (
          <div className="mt-6 pt-6 border-t border-neutral-100">
            <h4 className="text-sm font-medium text-neutral-900 mb-3 flex items-center gap-1.5">
              <UserAddIcon size={14} /> {lang === "en" ? "Invite a member" : "邀請新成員"}
            </h4>
            <div className="flex flex-wrap gap-2 items-start">
              <input
                type="email"
                placeholder={lang === "en" ? "teammate or client email" : "同事/客戶 email"}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="text-sm border border-neutral-300 rounded-lg px-3 py-2 bg-white"
              >
                <option value="viewer">{ROLE_LABEL.viewer}</option>
                <option value="editor">{ROLE_LABEL.editor}</option>
                <option value="admin">{ROLE_LABEL.admin}</option>
              </select>
              <button
                onClick={() => {
                  if (!inviteEmail) return;
                  inviteMut?.mutate({
                    workspaceId: ws.id,
                    email: inviteEmail,
                    role: inviteRole,
                    canEditStrategy: inviteRole === "editor" ? inviteStrategy : undefined,
                    canPublish: inviteRole === "editor" ? invitePublish : undefined,
                    brandIds: inviteRole !== "admin" && inviteBrandIds.length > 0 ? inviteBrandIds : undefined,
                  });
                  setInviteEmail("");
                  setInviteBrandIds([]);
                  setInviteStrategy(false);
                  setInvitePublish(false);
                }}
                disabled={!inviteEmail || inviteMut?.isPending}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {inviteMut?.isPending
                  ? (lang === "en" ? "Sending…" : "處理中…")
                  : (lang === "en" ? "Invite" : "邀請")}
              </button>
            </div>
            {/* What this role can do, and the two editor switches */}
            <p className="mt-3 text-xs text-neutral-500">
              {inviteRole === "viewer" && (lang === "en"
                ? "Viewer: sees the brand's positioning, task cards and content. Cannot write, change or publish."
                : "檢視者：看得到品牌定位、任務卡與內容，不能撰寫、修改或發布。")}
              {inviteRole === "editor" && (lang === "en"
                ? "Editor: sees everything, writes content with the brand and uploads photos. Choose below whether they may also change positioning or publish."
                : "編輯者：看得到全部，並可用這個品牌撰寫內容、上傳照片。下面決定是否也能修改定位、是否能發布。")}
              {inviteRole === "admin" && (lang === "en"
                ? "Admin: everything, including positioning, publishing, connecting social accounts and reviewing."
                : "管理者：全部權限，包含修改定位、發布、連結社群帳號與審核。")}
            </p>
            {inviteRole === "editor" && (
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={inviteStrategy} onChange={(e) => setInviteStrategy(e.target.checked)} />
                  {lang === "en" ? "May edit positioning, products and events" : "可以修改品牌定位、產品與活動"}
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={invitePublish} onChange={(e) => setInvitePublish(e.target.checked)} />
                  {lang === "en" ? "May schedule and publish" : "可以排程與發布"}
                </label>
              </div>
            )}
            {/* Brand scoping (for viewer/editor) */}
            {inviteRole !== "admin" && brands.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-neutral-500 mb-2">
                  {lang === "en"
                    ? "Limit access to these brands (none = sees every brand in workspace)"
                    : "限制只看以下品牌（不選 = 可看工作空間所有品牌）"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {brands.map((b) => (
                    <label
                      key={b.id}
                      className={`text-xs px-2 py-1 rounded-full border cursor-pointer transition ${
                        inviteBrandIds.includes(b.id)
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "border-neutral-300 text-neutral-600 hover:border-neutral-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={inviteBrandIds.includes(b.id)}
                        onChange={() =>
                          setInviteBrandIds((prev) =>
                            prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id],
                          )
                        }
                        className="hidden"
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-neutral-400">
              {lang === "en"
                ? "They'll need an onBrand Studio account first. Basic: 2 seats; Professional: 5 seats."
                : "對方需先在 onbrand.sowork.ai 註冊。基礎方案 2 席，專業方案 5 席。"}
            </p>
          </div>
        )}
      </section>

      {/* White label (enterprise only) */}
      {isOwner && (
        <section className={`bg-white border rounded-xl p-6 ${canWhiteLabel ? "border-neutral-200" : "border-neutral-100 opacity-60"}`}>
          <h3 className="text-base font-semibold text-neutral-900 mb-1">White Label</h3>
          <p className="text-xs text-neutral-500 mb-4">
            {canWhiteLabel
              ? (lang === "en"
                ? "Use your own name and logo — client-facing reports rebrand automatically."
                : "用你自己的公司名和 logo，給客戶看的工作報表會自動換成你的品牌。")
              : (lang === "en"
                ? "Enterprise only — set up with SoWork during onboarding (your logo + name on client views)"
                : "企業客製版功能 — 由 SoWork 導入時設定（用你的 logo + 公司名給客戶看）")}
          </p>
          <div className="space-y-3 max-w-md">
            <div>
              <label className="block text-xs text-neutral-600 mb-1">{lang === "en" ? "Display name" : "顯示名稱"}</label>
              <input
                type="text"
                value={wlName}
                onChange={(e) => setWlName(e.target.value)}
                disabled={!canWhiteLabel}
                placeholder={lang === "en" ? "e.g. Your Agency Name" : "例：你的代理商名稱"}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 disabled:bg-neutral-50"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">Logo URL</label>
              <input
                type="url"
                value={wlLogo}
                onChange={(e) => setWlLogo(e.target.value)}
                disabled={!canWhiteLabel}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 disabled:bg-neutral-50"
              />
            </div>
            <button
              onClick={() => updateMut?.mutate({
                workspaceId: ws.id,
                whiteLabelName: wlName,
                whiteLabelLogo: wlLogo || undefined,
              })}
              disabled={!canWhiteLabel || updateMut?.isPending}
              className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {updateMut?.isPending
                ? (lang === "en" ? "Saving…" : "儲存中…")
                : (lang === "en" ? "Save" : "儲存")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
