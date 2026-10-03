/**
 * CloudFilePicker — "連接 Google Drive / OneDrive" + folder/file browser for
 * the persona-agent training-source form.
 *
 * 2026-08-21 (CJ「怎麼覺得還是不踏實，因為很多人，影音就是放在google drive,
 * one drive or youtube上面」→ 帳號連接型 build): OAuth install runs in a
 * popup (server/routes/cloudOAuthRoute.ts), which postMessages the result
 * back here rather than navigating the whole app away and back.
 */
import { useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../platform/components/Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogleDrive, faMicrosoft } from "@fortawesome/free-brands-svg-icons";
import { faFolder, faFileVideo, faFileAudio, faChevronLeft, faPlus, faSpinner, faLink } from "@fortawesome/free-solid-svg-icons";
import { CloseIcon } from "../../../platform/components/icons";

type Provider = "google_drive" | "onedrive";
export type CloudFileSource = { provider: Provider; fileId: string; name: string };

const PROVIDER_LABEL: Record<Provider, string> = { google_drive: "Google Drive", onedrive: "OneDrive" };
const PROVIDER_ICON: Record<Provider, any> = { google_drive: faGoogleDrive, onedrive: faMicrosoft };
const PROVIDER_TONE: Record<Provider, string> = { google_drive: "#18181b", onedrive: "#18181b" };

function openConnectPopup(provider: Provider, brandId: number): Promise<boolean> {
  return new Promise((resolve) => {
    const path = provider === "google_drive" ? "google-drive" : "onedrive";
    const popup = window.open(`/api/oauth/${path}/install?brandId=${brandId}`, "cloudConnect", "width=520,height=650");
    if (!popup) { resolve(false); return; }
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type !== "cloud-oauth-result" || e.data.provider !== provider) return;
      window.removeEventListener("message", onMessage);
      clearInterval(closedCheck);
      resolve(!!e.data.ok);
    };
    window.addEventListener("message", onMessage);
    const closedCheck = setInterval(() => {
      if (popup.closed) { clearInterval(closedCheck); window.removeEventListener("message", onMessage); resolve(false); }
    }, 700);
  });
}

function ProviderPane({ brandId, provider, onAdd, added }: {
  brandId: number; provider: Provider; onAdd: (f: CloudFileSource) => void; added: Set<string>;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const utils = trpc.useUtils();
  const [connecting, setConnecting] = useState(false);
  const [path, setPath] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: en ? "Root" : "根目錄" }]);
  const folderId = path[path.length - 1]?.id ?? null;

  const statusQ = (trpc as any).cloudDrive?.status?.useQuery({ brandId }, { enabled: !!brandId });
  const connected = !!statusQ?.data?.[provider]?.connected;
  const accountEmail = statusQ?.data?.[provider]?.accountEmail as string | null | undefined;

  const listQ = (trpc as any).cloudDrive?.listFiles?.useQuery(
    { brandId, provider, folderId },
    { enabled: !!brandId && connected },
  );

  const connect = async () => {
    setConnecting(true);
    try {
      const ok = await openConnectPopup(provider, brandId);
      if (ok) {
        showToastGlobal(en ? `${PROVIDER_LABEL[provider]} connected` : `已連接 ${PROVIDER_LABEL[provider]}`, "success");
        utils.cloudDrive?.status?.invalidate?.();
      } else {
        showToastGlobal(en ? "Connection cancelled" : "已取消連接");
      }
    } finally {
      setConnecting(false);
    }
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <FontAwesomeIcon icon={PROVIDER_ICON[provider]} style={{ color: PROVIDER_TONE[provider], fontSize: 28 }} />
        <p className="text-xs text-default-500 max-w-[220px]">
          {en ? `Connect your ${PROVIDER_LABEL[provider]} account to pick a video/audio file — files stay private, nothing changes hands but the ones you pick.`
              : `連接你的 ${PROVIDER_LABEL[provider]} 帳號來挑選影音檔案 — 檔案維持私人，只有你選的那一個會被讀取。`}
        </p>
        <button
          onClick={connect}
          disabled={connecting}
          className="text-xs font-semibold px-4 py-2 rounded-full text-white transition flex items-center gap-1.5"
          style={{ background: connecting ? "#D6D3D1" : PROVIDER_TONE[provider] }}
        >
          {connecting ? <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: 12 }} /> : <FontAwesomeIcon icon={PROVIDER_ICON[provider]} style={{ fontSize: 12 }} />}
          {connecting ? (en ? "Connecting…" : "連接中…") : (en ? `Connect ${PROVIDER_LABEL[provider]}` : `連接 ${PROVIDER_LABEL[provider]}`)}
        </button>
      </div>
    );
  }

  const files = listQ?.data?.ok ? listQ.data.files : [];
  const listError = listQ?.data && !listQ.data.ok ? listQ.data.error : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 text-[12px] text-default-500 flex-wrap">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-default-300">/</span>}
              <button
                onClick={() => setPath(path.slice(0, i + 1))}
                className={i === path.length - 1 ? "font-semibold text-default-700" : "hover:text-zinc-600"}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>
        {accountEmail && <span className="text-[12px] text-default-400 truncate max-w-[140px]">{accountEmail}</span>}
      </div>

      <div className="rounded-lg border border-default-200 max-h-56 overflow-y-auto divide-y divide-default-100">
        {path.length > 1 && (
          <button
            onClick={() => setPath((p) => p.slice(0, -1))}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-default-500 hover:bg-default-50"
          >
            <FontAwesomeIcon icon={faChevronLeft} style={{ fontSize: 12 }} /> {en ? "Back" : "上一層"}
          </button>
        )}
        {listQ?.isLoading && <div className="px-3 py-4 text-center text-xs text-default-400">{en ? "Loading…" : "載入中…"}</div>}
        {listError && <div className="px-3 py-4 text-center text-xs text-danger-500">{listError}</div>}
        {!listQ?.isLoading && !listError && files.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-default-400">{en ? "Empty folder" : "這個資料夾是空的"}</div>
        )}
        {files.filter((f: any) => f.isFolder || f.isMedia).map((f: any) => {
          const key = `${provider}:${f.id}`;
          const isAdded = added.has(key);
          return (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-default-50">
              {f.isFolder ? (
                <button onClick={() => setPath((p) => [...p, { id: f.id, name: f.name }])} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <FontAwesomeIcon icon={faFolder} style={{ color: "#71717a", fontSize: 13 }} />
                  <span className="text-xs text-default-700 truncate">{f.name}</span>
                </button>
              ) : (
                <>
                  <FontAwesomeIcon icon={/^audio\//.test(f.mimeType ?? "") ? faFileAudio : faFileVideo} style={{ color: "#94A3B8", fontSize: 13 }} />
                  <span className="text-xs text-default-700 truncate flex-1 min-w-0">{f.name}</span>
                  <button
                    disabled={isAdded}
                    onClick={() => onAdd({ provider, fileId: f.id, name: f.name })}
                    className={`shrink-0 text-[12px] font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
                      isAdded ? "text-emerald-600 bg-emerald-50" : "text-zinc-600 bg-zinc-50 hover:bg-zinc-100"
                    }`}
                  >
                    <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12 }} /> {isAdded ? (en ? "Added" : "已加入") : (en ? "Add" : "加入")}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CloudFilePicker({ brandId, sources, onAdd, onRemove }: {
  brandId: number;
  sources: CloudFileSource[];
  onAdd: (f: CloudFileSource) => void;
  onRemove: (key: string) => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [tab, setTab] = useState<Provider>("google_drive");
  const added = new Set(sources.map((s) => `${s.provider}:${s.fileId}`));

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        {(["google_drive", "onedrive"] as Provider[]).map((p) => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition ${
              tab === p ? "border-default-900 bg-default-900 text-white" : "border-default-200 bg-white text-default-500 hover:border-default-400"
            }`}
          >
            <FontAwesomeIcon icon={PROVIDER_ICON[p]} style={{ color: tab === p ? "#fff" : PROVIDER_TONE[p], fontSize: 12 }} />
            {PROVIDER_LABEL[p]}
          </button>
        ))}
      </div>

      <ProviderPane brandId={brandId} provider={tab} onAdd={onAdd} added={added} />

      {sources.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {sources.map((s) => (
            <div key={`${s.provider}:${s.fileId}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-default-50 text-xs">
              <FontAwesomeIcon icon={PROVIDER_ICON[s.provider]} style={{ color: PROVIDER_TONE[s.provider], fontSize: 12 }} />
              <span className="flex-1 min-w-0 truncate text-default-700">{s.name}</span>
              <button onClick={() => onRemove(`${s.provider}:${s.fileId}`)} className="text-default-300 hover:text-danger-500 text-[12px]"><CloseIcon size={11} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12px] text-default-400 leading-relaxed flex items-start gap-1">
        <FontAwesomeIcon icon={faLink} style={{ fontSize: 12, marginTop: 2 }} />
        {en ? "Files stay private — only the ones you add here are downloaded, transcribed, then discarded. Size limit ~24MB per file." : "檔案維持私人 — 只有你在這裡加入的檔案會被下載、轉成逐字稿後即捨棄。單檔上限約 24MB。"}
      </p>
    </div>
  );
}
