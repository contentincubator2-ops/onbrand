/**
 * cloudDriveClient.ts — thin wrappers over the Google Drive v3 and
 * Microsoft Graph (OneDrive) file-listing/download APIs. Auth is always a
 * caller-supplied bearer access token (see cloudTokens.ts) — this module
 * has no knowledge of brands/users/token storage.
 */
import type { CloudProvider } from "./cloudTokens";

export interface CloudFileEntry {
  id: string;
  name: string;
  isFolder: boolean;
  isMedia: boolean; // video or audio — the only kind persona training can use
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface CloudFileMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export async function listCloudFiles(
  provider: CloudProvider, accessToken: string, folderId: string | null,
): Promise<CloudFileEntry[]> {
  return provider === "google_drive"
    ? listGoogleDriveFiles(accessToken, folderId)
    : listOneDriveFiles(accessToken, folderId);
}

export async function getCloudFileMeta(
  provider: CloudProvider, accessToken: string, fileId: string,
): Promise<CloudFileMeta> {
  return provider === "google_drive"
    ? getGoogleDriveFileMeta(accessToken, fileId)
    : getOneDriveFileMeta(accessToken, fileId);
}

export async function downloadCloudFile(
  provider: CloudProvider, accessToken: string, fileId: string,
): Promise<Buffer> {
  return provider === "google_drive"
    ? downloadGoogleDriveFile(accessToken, fileId)
    : downloadOneDriveFile(accessToken, fileId);
}

// ─── Google Drive ────────────────────────────────────────────────────────────

async function listGoogleDriveFiles(accessToken: string, folderId: string | null): Promise<CloudFileEntry[]> {
  const q = folderId
    ? `'${folderId}' in parents and trashed=false`
    : `trashed=false and (sharedWithMe=true or 'root' in parents)`;
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,mimeType,size)");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("orderBy", "folder,name");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`Google Drive list failed: HTTP ${resp.status}`);
  const data = await resp.json() as { files?: any[] };
  return (data.files ?? []).map((f) => ({
    id: f.id, name: f.name,
    isFolder: f.mimeType === "application/vnd.google-apps.folder",
    isMedia: /^(video|audio)\//.test(f.mimeType ?? ""),
    mimeType: f.mimeType ?? null,
    sizeBytes: f.size ? Number(f.size) : null,
  }));
}

async function getGoogleDriveFileMeta(accessToken: string, fileId: string): Promise<CloudFileMeta> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "name,mimeType,size");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`Google Drive metadata failed: HTTP ${resp.status}`);
  const data = await resp.json() as { name: string; mimeType: string; size?: string };
  return { name: data.name, mimeType: data.mimeType, sizeBytes: data.size ? Number(data.size) : 0 };
}

async function downloadGoogleDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`Google Drive download failed: HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ─── OneDrive (Microsoft Graph) ──────────────────────────────────────────────

function oneDriveChildrenUrl(folderId: string | null): string {
  return folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;
}

async function listOneDriveFiles(accessToken: string, folderId: string | null): Promise<CloudFileEntry[]> {
  const url = new URL(oneDriveChildrenUrl(folderId));
  url.searchParams.set("$select", "id,name,folder,file,size");
  url.searchParams.set("$top", "200");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`OneDrive list failed: HTTP ${resp.status}`);
  const data = await resp.json() as { value?: any[] };
  return (data.value ?? []).map((f) => {
    const mimeType: string | null = f.file?.mimeType ?? null;
    return {
      id: f.id, name: f.name,
      isFolder: !!f.folder,
      isMedia: /^(video|audio)\//.test(mimeType ?? ""),
      mimeType,
      sizeBytes: typeof f.size === "number" ? f.size : null,
    };
  });
}

async function getOneDriveFileMeta(accessToken: string, fileId: string): Promise<CloudFileMeta> {
  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`);
  url.searchParams.set("$select", "name,file,size");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`OneDrive metadata failed: HTTP ${resp.status}`);
  const data = await resp.json() as { name: string; file?: { mimeType?: string }; size?: number };
  return { name: data.name, mimeType: data.file?.mimeType ?? "application/octet-stream", sizeBytes: data.size ?? 0 };
}

async function downloadOneDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`OneDrive download failed: HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}
