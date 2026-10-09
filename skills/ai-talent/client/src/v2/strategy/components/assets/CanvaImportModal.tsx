/**
 * CanvaImportModal — 從 Canva 匯入：連接帳號 → 挑一份設計 → 匯出成圖存進品牌素材庫。
 *
 * 2026-10-09（CJ「直接導入用戶在 CANVA 做好的圖…用戶就可以圖文一起送給客戶審查」）。
 *
 * 匯入的圖落在素材庫（asset_photos），所以素材庫、圖片卡、貼文換圖都直接看得到，
 * 這個視窗只負責「從 Canva 拿進來」這一段。授權開彈出視窗（跟 Google Drive 同一條路：
 * server/platform/routes/cloudOAuthRoute.ts 用 postMessage 把結果傳回來）。
 *
 * Canva 的縮圖網址 15 分鐘就失效——清單不長期快取，視窗重開就重抓。
 * 不是即時同步：在 Canva 改了圖，要再匯入一次。
 */
import React from "react";
import { Button, Input, Modal, ModalBody, ModalContent, ModalHeader, Spinner } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../platform/components/Toast";
import { Icon } from "../../../platform/components/icons";

export interface ImportedPhoto { id: string; url: string; filename: string }

interface CanvaDesign { id: string; title: string; thumbnailUrl: string | null; pageCount: number; updatedAt: string | null }

function openCanvaConnectPopup(): Promise<boolean> {
  return new Promise((resolve) => {
    const popup = window.open("/api/oauth/canva/install", "canvaConnect", "width=560,height=720");
    if (!popup) { resolve(false); return; }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e?.data?.type !== "cloud-oauth-result" || e.data.provider !== "canva") return;
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

export default function CanvaImportModal({
  brandId, lang, isOpen, onClose, onImported,
}: {
  brandId: number;
  lang: "zh-TW" | "en";
  isOpen: boolean;
  onClose: () => void;
  /** 匯入成功的圖（依頁序）。多頁設計會有好幾張。 */
  onImported?: (photos: ImportedPhoto[]) => void;
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const utils = (trpc as any).useUtils();

  const statusQ = (trpc as any).canva.status.useQuery(undefined, { enabled: isOpen, staleTime: 0 });
  const configured = statusQ.data?.configured !== false;
  const connected = !!statusQ.data?.connected;

  const [typed, setTyped] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [continuation, setContinuation] = React.useState<string | undefined>(undefined);
  const [designs, setDesigns] = React.useState<CanvaDesign[]>([]);
  const [connecting, setConnecting] = React.useState(false);
  const [importingId, setImportingId] = React.useState<string | null>(null);

  // 打字停 400ms 才搜尋——Canva 的清單一分鐘 100 次，逐字打會白白用掉。
  React.useEffect(() => {
    const t = setTimeout(() => { setQuery(typed.trim()); setContinuation(undefined); setDesigns([]); }, 400);
    return () => clearTimeout(t);
  }, [typed]);
  React.useEffect(() => { if (!isOpen) { setTyped(""); setQuery(""); setContinuation(undefined); setDesigns([]); } }, [isOpen]);

  const listQ = (trpc as any).canva.listDesigns.useQuery(
    { ...(query ? { query } : {}), ...(continuation ? { continuation } : {}), lang },
    { enabled: isOpen && connected, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
  );
  React.useEffect(() => {
    const d = listQ.data;
    if (!isOpen || !d?.ok) return;
    // 已經在清單裡的換成新抓到的那一筆（縮圖網址會過期，舊的不能留），沒看過的接在後面。
    setDesigns((cur) => {
      const fresh = new Map((d.designs as CanvaDesign[]).map((x) => [x.id, x]));
      const seen = new Set(cur.map((x) => x.id));
      return [...cur.map((x) => fresh.get(x.id) ?? x), ...(d.designs as CanvaDesign[]).filter((x) => !seen.has(x.id))];
    });
  }, [listQ.data, listQ.dataUpdatedAt, isOpen]);
  const lostConnection = listQ.data?.ok === false && listQ.data.error === "not-connected";
  const listError = listQ.data?.ok === false && listQ.data.error === "failed" ? String(listQ.data.message || "") : "";
  const nextContinuation = listQ.data?.ok ? (listQ.data.continuation as string | null) : null;

  const importMut = (trpc as any).assetPhoto.importCanvaDesign.useMutation();
  const disconnectMut = (trpc as any).canva.disconnect.useMutation();

  const connect = async () => {
    setConnecting(true);
    try {
      const ok = await openCanvaConnectPopup();
      // 不管彈出視窗回報什麼都重讀一次狀態：訊息沒傳回來（視窗被擋、被手動關掉）時，連接其實可能已經成功。
      setDesigns([]);
      await utils.canva.invalidate();
      if (ok) showToastGlobal(L("已連接 Canva", "Canva connected"), "success");
    } finally { setConnecting(false); }
  };

  const disconnect = async () => {
    try { await disconnectMut.mutateAsync(); } catch { /* 下面重新讀狀態就知道結果 */ }
    setDesigns([]);
    await utils.canva.invalidate();
  };

  const importDesign = async (d: CanvaDesign) => {
    if (importingId) return;
    setImportingId(d.id);
    try {
      const r = await importMut.mutateAsync({ brandId, designId: d.id, title: d.title, lang });
      const photos = (r?.photos ?? []) as ImportedPhoto[];
      utils.assetPhoto?.library?.invalidate?.();
      utils.assetPhoto?.list?.invalidate?.();
      const notes: string[] = [L(`已匯入 ${photos.length} 張到素材庫`, `Imported ${photos.length} into your library`)];
      if (r?.truncated) notes.push(L("這份設計頁數較多，只匯入前 10 頁", "Only the first 10 pages were imported"));
      if (r?.skipped) notes.push(L(`${r.skipped} 頁沒存成功：${r.skippedReason ?? ""}`, `${r.skipped} page(s) weren't saved: ${r.skippedReason ?? ""}`));
      showToastGlobal(notes.join(L("；", "; ")), "success");
      onImported?.(photos);
      onClose();
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 240), "error");
    } finally { setImportingId(null); }
  };

  const showConnect = !connected || lostConnection;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <span className="text-medium font-semibold">{L("從 Canva 匯入", "Import from Canva")}</span>
          {connected && !lostConnection && (
            <span className="ml-auto mr-6 flex items-center gap-2 text-tiny font-normal text-default-500">
              {statusQ.data?.accountName ? L(`已連接：${statusQ.data.accountName}`, `Connected: ${statusQ.data.accountName}`) : L("已連接", "Connected")}
              <button type="button" className="underline hover:text-foreground" onClick={() => void disconnect()}>
                {L("中斷連接", "Disconnect")}
              </button>
            </span>
          )}
        </ModalHeader>
        <ModalBody className="pb-6">
          {statusQ.isLoading ? (
            <div className="flex justify-center py-10"><Spinner size="sm" /></div>
          ) : !configured ? (
            <p className="py-8 text-center text-small text-default-500">
              {L("Canva 連接還沒開放。現在可以先在 Canva 下載圖片，再用「上傳圖片」放進來。",
                 "Canva import isn't available yet. For now, download from Canva and use Upload.")}
            </p>
          ) : showConnect ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-small text-default-600 max-w-md">
                {L("連接你的 Canva 帳號後，可以直接挑做好的設計匯入，不用先下載再上傳。我們只讀取你的設計，不會修改或刪除。",
                   "Connect your Canva account to import finished designs directly. We only read your designs — nothing is changed or deleted.")}
              </p>
              <Button color="primary" radius="md" isLoading={connecting} onPress={() => void connect()}
                startContent={!connecting && <Icon name="link" size={14} />}>
                {L("連接 Canva", "Connect Canva")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Input size="sm" value={typed} onValueChange={setTyped} isClearable
                startContent={<Icon name="search" size={13} className="text-default-400" />}
                placeholder={L("搜尋設計名稱", "Search your designs")} aria-label={L("搜尋設計名稱", "Search your designs")} />
              <p className="text-tiny text-default-500">
                {L("點一份設計就匯入。多頁設計每一頁存成一張（最多 10 頁）。在 Canva 改過圖之後，要再匯入一次才會更新。",
                   "Click a design to import it. Each page becomes one image (up to 10). After editing in Canva, import again to update.")}
              </p>
              {listError && <p className="text-tiny text-danger">{listError}</p>}
              {designs.length === 0 && listQ.isFetching ? (
                <div className="flex justify-center py-10"><Spinner size="sm" /></div>
              ) : designs.length === 0 && !listError ? (
                <p className="py-8 text-center text-small text-default-500">
                  {query ? L("找不到符合的設計", "No designs match") : L("這個 Canva 帳號裡還沒有設計", "No designs in this Canva account yet")}
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {designs.map((d) => {
                    const busy = importingId === d.id;
                    return (
                      <button key={d.id} type="button" onClick={() => void importDesign(d)} disabled={!!importingId}
                        title={d.title || L("未命名設計", "Untitled design")}
                        className="group flex flex-col gap-1.5 text-left disabled:opacity-60">
                        <span className="relative block aspect-square w-full overflow-hidden rounded-lg border border-divider bg-default-50 group-hover:border-default-500 transition">
                          {d.thumbnailUrl
                            ? <img src={d.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                            : <span className="flex h-full w-full items-center justify-center text-default-300"><Icon name="image" size={22} /></span>}
                          {d.pageCount > 1 && (
                            <span className="absolute right-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                              {L(`${d.pageCount} 頁`, `${d.pageCount} pages`)}
                            </span>
                          )}
                          {busy && (
                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-tiny text-default-700">
                              <Spinner size="sm" />{L("匯入中…", "Importing…")}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-tiny text-default-700">{d.title || L("未命名設計", "Untitled design")}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {nextContinuation && designs.length > 0 && (
                <Button size="sm" variant="flat" radius="md" className="self-center" isLoading={listQ.isFetching}
                  onPress={() => setContinuation(nextContinuation)}>
                  {L("載入更多", "Load more")}
                </Button>
              )}
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
