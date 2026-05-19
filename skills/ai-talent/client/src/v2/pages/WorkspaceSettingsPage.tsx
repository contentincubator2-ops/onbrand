/**
 * /settings/workspace — Team / Agency workspace management.
 * 2026-05-12. CJ direction「Team / Agency 方案 + 多客戶 workspace 都要完成」.
 *
 * Lists workspaces the user belongs to. For each:
 *   - members (with role + remove/setRole controls for owners)
 *   - brand list (with brand-scoping for viewers)
 *   - invite-by-email form
 *   - white-label name/logo (Agency tier only)
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { showToastGlobal } from "../../components/ui/Toast";
import { ChevronLeft, UserPlus, Trash2, Shield, Building2 } from "lucide-react";

type Role = "owner" | "admin" | "editor" | "viewer";

const ROLE_LABEL_ZH: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer (僅查看)",
};
const ROLE_LABEL_EN: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer (read-only)",
};

const PLAN_LABEL: Record<string, string> = {
  trial:        "Trial",
  solo:         "Solo",
  drop_starter: "OnBrand Starter",
  drop_pro:     "OnBrand Solo",
  drop_team:    "OnBrand Studio",
  drop_agency:  "OnBrand Agency",
  enterprise:   "Enterprise",
};

export default function WorkspaceSettingsPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const ROLE_LABEL = lang === "en" ? ROLE_LABEL_EN : ROLE_LABEL_ZH;
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
          <ChevronLeft size={16} /> {lang === "en" ? "Back" : "返回"}
        </button>

        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{lang === "en" ? "Workspace settings" : "工作空間設定"}</h1>
        <p className="text-sm text-neutral-500 mb-6">{lang === "en"
          ? "Manage team members, client access, and white-label"
          : "管理團隊成員、客戶分權、白牌設定"}</p>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar: workspace list */}
          <aside className="space-y-1">
            {listQ?.isLoading ? (
              <p className="text-sm text-neutral-400">{lang === "en" ? "Loading…" : "載入中…"}</p>
            ) : workspaces.length === 0 ? (
              <p className="text-sm text-neutral-400">{lang === "en" ? "No workspaces yet" : "尚無工作空間"}</p>
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
                    <Building2 size={14} /> {w.name}
                  </div>
                  <div className={`text-xs mt-0.5 ${selectedId === w.id ? "text-neutral-300" : "text-neutral-400"}`}>
                    {PLAN_LABEL[w.planCode] ?? w.planCode} · {lang === "en"
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
  const ROLE_LABEL = lang === "en" ? ROLE_LABEL_EN : ROLE_LABEL_ZH;
  const ws = detail.workspace;
  const myRole: Role = detail.myRole;
  const members = (detail.members ?? []) as any[];
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
  const removeMut = (trpc as any).tenant?.removeMember?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Removed" : "已移除", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Couldn't remove" : "移除失敗")),
  });
  const updateMut = (trpc as any).tenant?.update?.useMutation?.({
    onSuccess: () => { showToastGlobal(lang === "en" ? "Saved ✓" : "已儲存", "success"); onChanged(); },
    onError: (e: any) => showToastGlobal(e?.message ?? (lang === "en" ? "Update failed" : "更新失敗")),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviteBrandIds, setInviteBrandIds] = useState<number[]>([]);
  const [wlName, setWlName] = useState(ws.whiteLabelName ?? "");
  const [wlLogo, setWlLogo] = useState(ws.whiteLabelLogo ?? "");

  const canWhiteLabel = ws.planCode === "drop_agency" || ws.planCode === "enterprise";

  return (
    <div className="space-y-6">
      {/* Workspace header */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{ws.name}</h2>
            <p className="text-xs text-neutral-500 mt-1">
              {lang === "en" ? "Plan: " : "方案："}{PLAN_LABEL[ws.planCode] ?? ws.planCode} ·
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
          <Shield size={16} /> {lang === "en" ? `Members (${members.length})` : `成員（${members.length}）`}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="text-left py-2">{lang === "en" ? "Name" : "姓名"}</th>
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">{lang === "en" ? "Role" : "角色"}</th>
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
                        <Trash2 size={14} />
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
              <UserPlus size={14} /> {lang === "en" ? "Invite a member" : "邀請新成員"}
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
                    brandIds: inviteBrandIds.length > 0 ? inviteBrandIds : undefined,
                  });
                  setInviteEmail("");
                  setInviteBrandIds([]);
                }}
                disabled={!inviteEmail || inviteMut?.isPending}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {inviteMut?.isPending
                  ? (lang === "en" ? "Sending…" : "處理中…")
                  : (lang === "en" ? "Invite" : "邀請")}
              </button>
            </div>
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
                ? "They'll need a SoWork account first. Team plan: up to 5 members; Agency: unlimited."
                : "對方需先在 drop.sowork.ai 註冊。Team 方案上限 5 位，Agency 方案無限。"}
            </p>
          </div>
        )}
      </section>

      {/* White label (Agency+ only) */}
      {isOwner && (
        <section className={`bg-white border rounded-xl p-6 ${canWhiteLabel ? "border-neutral-200" : "border-neutral-100 opacity-60"}`}>
          <h3 className="text-base font-semibold text-neutral-900 mb-1">White Label</h3>
          <p className="text-xs text-neutral-500 mb-4">
            {canWhiteLabel
              ? (lang === "en"
                ? "Use your own name and logo — client-facing reports rebrand automatically."
                : "用你自己的公司名和 logo，給客戶看的工作報表會自動換成你的品牌。")
              : (lang === "en"
                ? "Upgrade to OnBrand Agency to unlock (your logo + name on client views)"
                : "升級 OnBrand Agency 解鎖（用你的 logo + 公司名給客戶看）")}
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
