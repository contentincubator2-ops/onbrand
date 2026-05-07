/**
 * KnowledgeEditor — NotebookLM-style 知識 tab.
 *
 * User uploads their own successful FB posts / external reference texts.
 * Up to 50 items × 8K chars each. Items get injected into Theater +
 * 30s/60s/100s prompts as additional context.
 */
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Input, Textarea, Button, Card, CardBody } from "@heroui/react";
import { Plus, Trash2, BookOpen, ExternalLink } from "lucide-react";

interface Item {
  id: number;
  kind: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export default function KnowledgeEditor({ brandId }: { brandId: number | null }) {
  if (!brandId) {
    return <div className="p-8 text-center text-default-500">請先選擇品牌</div>;
  }

  const utils = trpc.useUtils();
  const list = (trpc as any).brandKnowledge?.list?.useQuery?.({ brandId }, { enabled: !!brandId });
  const items: Item[] = (list?.data as Item[] | undefined) ?? [];

  const createMut = (trpc as any).brandKnowledge?.create?.useMutation?.({
    onSuccess: () => utils.brandKnowledge?.list?.invalidate?.({ brandId }),
  });
  const deleteMut = (trpc as any).brandKnowledge?.delete?.useMutation?.({
    onSuccess: () => utils.brandKnowledge?.list?.invalidate?.({ brandId }),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setErr(null);
    try {
      const r = await createMut?.mutateAsync?.({
        brandId,
        kind: "reference",
        title: title.trim(),
        body: body.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        tags: [],
      });
      if (r?.ok === false) { setErr(r.error || "新增失敗"); return; }
      setTitle(""); setBody(""); setSourceUrl(""); setAdding(false);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const totalChars = items.reduce((s, it) => s + (it.body?.length ?? 0), 0);
  const charPct = Math.min(100, Math.round((totalChars / 400_000) * 100));

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
              <BookOpen size={18} color="#fff" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-semibold text-default-900">品牌知識庫</h1>
          </div>
          <p className="text-sm text-default-500">
            上傳您過去成功的貼文 / 外部參考文章 / 競品案例。Agent 產出時會參考這份知識庫的語氣、結構、案例。
          </p>
        </div>
        <Button
          color="success"
          startContent={<Plus size={16} />}
          onPress={() => setAdding(true)}
          isDisabled={items.length >= 50}
        >
          新增條目
        </Button>
      </div>

      {/* Capacity meter */}
      <div className="mb-6 bg-default-50 border border-default-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2 text-xs text-default-600">
          <span>{items.length} / 50 條 · {totalChars.toLocaleString()} / 400,000 字元</span>
          <span className="text-default-400">上限：50 條 × 每條 8,000 字</span>
        </div>
        <div className="h-1.5 bg-default-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${charPct}%` }} />
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <Card className="mb-6 border-2 border-emerald-200">
          <CardBody className="p-5 space-y-3">
            <Input
              label="標題"
              placeholder="例：去年端午節最高觸及貼文"
              value={title}
              onValueChange={setTitle}
              isRequired
            />
            <Input
              label="來源連結（可選）"
              placeholder="https://..."
              value={sourceUrl}
              onValueChange={setSourceUrl}
            />
            <Textarea
              label="內容（最多 8,000 字）"
              placeholder="貼上原文 / 摘要 / 觀察..."
              value={body}
              onValueChange={setBody}
              minRows={6}
              maxLength={8000}
              description={`${body.length} / 8,000 字`}
            />
            {err && <div className="text-sm text-danger">{err}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="light" onPress={() => { setAdding(false); setTitle(""); setBody(""); setSourceUrl(""); setErr(null); }}>取消</Button>
              <Button color="success" onPress={handleAdd} isLoading={createMut?.isPending}>儲存</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Items grid */}
      {items.length === 0 && !adding ? (
        <div className="text-center py-16 text-default-400">
          <BookOpen size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">還沒有知識條目 — 點右上「新增條目」開始</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it) => (
            <Card key={it.id} className="hover:shadow-md transition">
              <CardBody className="p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-medium text-default-900 leading-snug">{it.title}</h3>
                  <button
                    onClick={() => { if (confirm(`刪除「${it.title}」？`)) deleteMut?.mutate?.({ id: it.id }); }}
                    className="text-default-300 hover:text-danger transition shrink-0"
                    title="刪除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {it.body && (
                  <p className="text-xs text-default-600 mb-2 whitespace-pre-wrap line-clamp-4">{it.body}</p>
                )}
                <div className="flex items-center justify-between text-[10px] text-default-400">
                  <span>{(it.body ?? "").length.toLocaleString()} 字</span>
                  {it.sourceUrl && (
                    <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-default-700">
                      <ExternalLink size={10} /> 來源
                    </a>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
