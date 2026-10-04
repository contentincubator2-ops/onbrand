"""
gen_exam_inputs.py — 替每張任務卡出「這張卡真的會收到的輸入」當考題。

2026-10-04。第一輪評測 305 張卡都用同一句「這次主打某產品，想吸引第一次購買的人」當輸入，
對留言回覆卡（要有一則留言）、命名卡（要有命名需求）、分析卡（要有數據）都不公平——卡片寫不出
它該寫的東西，分數低不是卡片的問題。別人養 agent 的第一步是「考題貼近真實使用」，這支就是在補這一步。

每張卡出 N 組輸入（預設 2），每組都把這張卡的必填欄位填好。規則：
  - 像台灣中小品牌的行銷人會打的字：一到三句、口語、不寫成簡報。
  - 卡片要使用者貼東西（留言、原文、數據、對方的貼文）就把那個東西寫出來，不要寫「（貼上留言）」。
  - 不放網址（評測環境不抓網頁）。
  - 品牌事實只能用下面品牌摘要裡有的；使用者自己這次要講的事（哪個檔期、想推哪支產品）可以自由設定，
    但不要編價格、折扣數字、銷量。

輸出：scripts/eval/data/exam-inputs.<brandKey>.json  { taskId: [ {fieldKey: text, ...}, ... ] }
產出後是可以人工審的——覺得哪一題不像真的，直接改檔案。

用法：
  az login
  FOUNDRY_PROJECT_ENDPOINT=... FOUNDRY_MODEL_NAME=gpt-5.4-mini \
    python gen_exam_inputs.py --meta card-meta.json --brand brand.json --out data/exam-inputs.tom.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

SYSTEM = """你在替一個行銷 AI 產品出考題。每張「任務卡」會問使用者一兩個問題，使用者回答後 AI 就寫出成品。
請你扮演這個品牌的行銷負責人，替這張卡寫出 {n} 組不同的回答（每組都要能讓這張卡寫出它該寫的東西）。

規則：
- 像真人打的字：一到三句、口語。不要寫成簡報或條列大綱。
- {n} 組要明顯不同（不同產品、不同情境或不同目的）。
- 卡片要使用者「貼上」東西時（一則留言、一篇原文、對方的貼文內容、一組數據、一段逐字稿），
  直接把那個東西寫出來當回答的一部分，寫得像真的。不要寫「（貼上留言）」這種佔位。
- 不要放任何網址。
- 品牌事實（產品、產地、價格帶、特色）只能用「品牌摘要」裡有的。使用者這次想做的事可以自由設定
  （哪個節日、想推哪支產品、想達到什麼目的），但不要編造具體售價、折扣數字、銷量、得獎。
- 每個必填欄位都要有內容；選填欄位可以有一組填、一組不填。
- 用繁體中文、台灣用語。

只輸出 JSON：{{"inputs": [ {{"<欄位 key>": "<回答>", ...}}, ... ]}}，欄位 key 照題目給的原樣。"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", required=True, type=Path)
    ap.add_argument("--brand", required=True, type=Path, help='{"key","name","summary"}')
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("-n", default=2, type=int)
    ap.add_argument("--workers", default=6, type=int)
    args = ap.parse_args()

    cards = json.loads(args.meta.read_text(encoding="utf-8"))
    brand = json.loads(args.brand.read_text(encoding="utf-8"))
    done: dict[str, list] = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else {}
    model = os.environ["FOUNDRY_MODEL_NAME"]

    with (
        DefaultAzureCredential(process_timeout=90) as cred,
        AIProjectClient(endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"], credential=cred) as project,
        project.get_openai_client() as oai,
    ):
        def one(card: dict) -> tuple[str, list | None, str]:
            fields = card.get("inputs") or [{"key": card["primaryKey"], "label": card["primaryQuestion"], "required": True, "placeholder": card.get("placeholder", "")}]
            user = (
                f"# 品牌摘要\n{brand['summary']}\n\n"
                f"# 任務卡\n名稱：{card['label']}\n通路：{card['platform']}（形式 {card['postType']}）\n"
                f"說明：{card.get('description') or '（無）'}\n"
                f"卡片問使用者的問題：{card.get('primaryQuestion') or '（無）'}\n"
                f"輸入框裡的範例提示：{card.get('placeholder') or '（無）'}\n\n"
                "# 要填的欄位\n"
                + "\n".join(f"- key=`{f['key']}`｜{f.get('label') or f['key']}｜{'必填' if f.get('required') else '選填'}"
                            + (f"｜提示：{f['placeholder']}" if f.get("placeholder") else "") for f in fields)
            )
            try:
                r = oai.chat.completions.create(
                    model=model,
                    messages=[{"role": "system", "content": SYSTEM.format(n=args.n)}, {"role": "user", "content": user}],
                    response_format={"type": "json_object"},
                )
                data = json.loads(r.choices[0].message.content or "{}")
                keys = {f["key"] for f in fields}
                required = {f["key"] for f in fields if f.get("required")} or {card["primaryKey"]}
                rows = []
                for row in data.get("inputs") or []:
                    clean = {k: str(v).strip() for k, v in row.items() if k in keys and str(v).strip()}
                    if required <= set(clean) and not any("http" in v for v in clean.values()):
                        rows.append(clean)
                if len(rows) < args.n:
                    return card["id"], None, f"只拿到 {len(rows)} 組合格的輸入"
                return card["id"], rows[: args.n], ""
            except Exception as e:  # 一張卡失敗不拖垮整批；重跑會補
                return card["id"], None, str(e)[:160]

        todo = [c for c in cards if c["id"] not in done]
        print(f"{len(done)} 張已有，還要出 {len(todo)} 張")
        failed = 0
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for i, (cid, rows, err) in enumerate(pool.map(one, todo), 1):
                if rows:
                    done[cid] = rows
                else:
                    failed += 1
                    print(f"  FAIL {cid}: {err}")
                if i % 25 == 0:
                    args.out.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
                    print(f"  {i}/{len(todo)}", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"完成：{len(done)}/{len(cards)} 張有考題，{failed} 張失敗")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
