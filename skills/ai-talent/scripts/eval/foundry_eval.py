"""
foundry_eval.py — 用 Microsoft Foundry 的評分表評估器（rubric evaluator）替 onBrand 的產出打分。

2026-10-04（CJ「第一步，我選擇 microsoft foundry」「我要你幫我執行」）。

做什麼
    讀一份 JSONL（每行一題：query＝任務＋品牌資料，response＝onBrand 實際寫出來的內容），
    在 Foundry 專案裡建一個評分表評估器，跑一次雲端評估，把每題每個面向的分數與理由
    寫回本機 JSON，並印出通過率。

    我們的 agent 不在 Foundry 上，所以走「query-response 資料集評估」：Foundry 只負責評分，
    不負責產生回應。產生回應是 export-cases.ts 的事（在 dev VM 上跑真的任務卡）。

誰在評分
    評分表（rubric.json）是我們自己訂的；評審是我們 Azure 訂閱裡的 GPT 部署。微軟提供的是
    工具，不是第三方評審——對外只能說「以 Microsoft Foundry 評估工具測試」。

用法
    az login          # 走 DefaultAzureCredential，不存任何金鑰
    python foundry_eval.py --cases cases.jsonl --out results.json
    環境變數：
      FOUNDRY_PROJECT_ENDPOINT  例 https://<account>.services.ai.azure.com/api/projects/<project>
      FOUNDRY_MODEL_NAME        評審用的部署名稱（建議 gpt-5.4-mini；rubric 文件列為最佳性價比）

需要
    pip install "azure-ai-projects>=2.7.0" azure-identity
    Foundry 專案上的 Foundry User 角色。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import TestingCriterionAzureAIEvaluator
from azure.identity import DefaultAzureCredential
from openai.types.eval_create_params import DataSourceConfigCustom
from openai.types.evals.create_eval_jsonl_run_data_source_param import (
    CreateEvalJSONLRunDataSourceParam,
    SourceFileContent,
    SourceFileContentContent,
)

HERE = Path(__file__).resolve().parent
TERMINAL = {"completed", "failed", "canceled"}


def load_cases(path: Path) -> list[dict]:
    cases = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if not row.get("query") or not row.get("response"):
            # 空回應不能默默略過：那正是要被抓出來的失敗（任務顯示成功、產出空白）。
            raise SystemExit(f"{path}:{n} 缺 query 或 response（id={row.get('id')}）")
        cases.append(row)
    if not cases:
        raise SystemExit(f"{path} 沒有任何題目")
    return cases


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", required=True, type=Path)
    ap.add_argument("--rubric", default=HERE / "rubric.json", type=Path)
    ap.add_argument("--out", default=Path("eval-results.json"), type=Path)
    ap.add_argument("--suite", default="", help="只評考卷裡 suite 欄位等於這個值的題目（cards／advisors／rewrite）")
    ap.add_argument("--batch", default=40, type=int, help="每批幾題")
    ap.add_argument("--keep", action="store_true", help="跑完不刪 Foundry 上的評估與評估器（要在入口網站看報表時用）")
    args = ap.parse_args()

    endpoint = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
    model = os.environ["FOUNDRY_MODEL_NAME"]
    rubric = json.loads(args.rubric.read_text(encoding="utf-8"))
    cases = load_cases(args.cases)
    if args.suite:
        cases = [c for c in cases if c.get("suite") == args.suite]
        if not cases:
            raise SystemExit(f"考卷裡沒有 suite={args.suite} 的題目")

    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S")
    evaluator_name = f"{rubric['name']}-{ts}-{uuid.uuid4().hex[:6]}"

    with (
        # process_timeout：本機走 az CLI 取 token，預設 10 秒在 Windows 上常常不夠。
        DefaultAzureCredential(process_timeout=90) as credential,
        AIProjectClient(endpoint=endpoint, credential=credential) as project,
        project.get_openai_client() as oai,
    ):
        evaluators = getattr(project, "evaluators", None) or project.beta.evaluators
        evaluator = evaluators.create_version(
            name=evaluator_name,
            evaluator_version={
                "name": evaluator_name,
                "categories": ["quality"],
                "display_name": rubric["display_name"],
                "description": rubric["description"],
                "definition": {
                    "type": "rubric",
                    "dimensions": rubric["dimensions"],
                    "pass_threshold": rubric["pass_threshold"],
                },
            },
        )
        print(f"評估器 {evaluator.name} v{evaluator.version}（門檻 {rubric['pass_threshold']}，評審 {model}）")

        ev = oai.evals.create(
            name=f"{evaluator_name}-eval",
            data_source_config=DataSourceConfigCustom(
                type="custom",
                item_schema={
                    "type": "object",
                    "properties": {"id": {"type": "string"}, "query": {"type": "string"}, "response": {"type": "string"}},
                    "required": ["query", "response"],
                },
                include_sample_schema=True,
            ),
            testing_criteria=[
                TestingCriterionAzureAIEvaluator(
                    type="azure_ai_evaluator",
                    name="content_quality",
                    evaluator_name=evaluator_name,
                    initialization_parameters={"deployment_name": model},
                    data_mapping={"query": "{{item.query}}", "response": "{{item.response}}"},
                )
            ],
        )
        # 分批送：題目連同品牌資料一題就好幾 KB，289 題一次內嵌會被服務以 413 拒收。
        by_id = {str(c.get("id")): c for c in cases}
        items = []
        report_urls = []
        run_statuses = []
        batches = [cases[i:i + args.batch] for i in range(0, len(cases), args.batch)]
        for bi, batch in enumerate(batches, 1):
            run = oai.evals.runs.create(
                eval_id=ev.id,
                name=f"{evaluator_name}-run-{bi}",
                data_source=CreateEvalJSONLRunDataSourceParam(
                    type="jsonl",
                    source=SourceFileContent(
                        type="file_content",
                        content=[
                            SourceFileContentContent(item={"id": str(c.get("id", i)), "query": c["query"], "response": c["response"]})
                            for i, c in enumerate(batch)
                        ],
                    ),
                ),
            )
            print(f"第 {bi}/{len(batches)} 批：{run.id}，{len(batch)} 題…", flush=True)
            while run.status not in TERMINAL:
                time.sleep(8)
                run = oai.evals.runs.retrieve(run_id=run.id, eval_id=ev.id)
            url = getattr(run, "report_url", None)
            print(f"狀態 {run.status}；報表 {url}", flush=True)
            report_urls.append(url)
            run_statuses.append(run.status)
            for it in oai.evals.runs.output_items.list(run_id=run.id, eval_id=ev.id):
                d = it.model_dump() if hasattr(it, "model_dump") else dict(it)
                src = d.get("datasource_item") or {}
                res = (d.get("results") or [{}])[0]
                sample = res.get("sample")
                meta = by_id.get(str(src.get("id")), {})
                items.append({
                    "id": src.get("id"),
                    "suite": meta.get("suite"), "agent": meta.get("agent"), "agentId": meta.get("agentId"),
                    "taskId": meta.get("taskId"), "roleId": meta.get("roleId"), "scope": meta.get("scope"),
                    "channel": meta.get("channel"), "empty": meta.get("empty"),
                    "score": res.get("score"),
                    "passed": res.get("passed"),
                    "label": res.get("label"),
                    "reason": res.get("reason"),
                    "dimensions": [
                        {k: ds.get(k) for k in ("id", "score", "applicable", "weight", "reason")}
                        for ds in ((res.get("properties") or {}).get("dimension_scores") or [])
                    ],
                    # 評審自己出錯（逾時、內容過濾）時這裡會有訊息——跟「產出不及格」是兩回事，要分開看。
                    "error": (sample or {}).get("error") if isinstance(sample, dict) else None,
                })
        all_completed = all(st == "completed" for st in run_statuses)

        if not args.keep:
            try:
                oai.evals.delete(eval_id=ev.id)
                evaluators.delete_version(name=evaluator.name, version=evaluator.version)
            except Exception as e:  # 清不掉不影響結果，講一聲就好
                print(f"（清理失敗，可到入口網站手動刪：{e}）")

    scored = [x for x in items if isinstance(x["score"], (int, float))]
    passed = [x for x in scored if x["passed"]]
    summary = {
        "ranAt": ts,
        "judgeModel": model,
        "passThreshold": rubric["pass_threshold"],
        "total": len(cases),
        "scored": len(scored),
        "passed": len(passed),
        "passRate": round(len(passed) / len(scored), 3) if scored else None,
        "meanScore": round(sum(x["score"] for x in scored) / len(scored), 3) if scored else None,
        "runStatus": "completed" if all_completed else ",".join(run_statuses),
        "reportUrls": report_urls,
    }
    by_dim: dict[str, list[float]] = {}
    for x in scored:
        for ds in x["dimensions"]:
            if ds.get("applicable") and isinstance(ds.get("score"), (int, float)):
                by_dim.setdefault(ds["id"], []).append(ds["score"])
    summary["dimensionMeans"] = {k: round(sum(v) / len(v), 2) for k, v in by_dim.items()}

    args.out.write_text(json.dumps({"summary": summary, "items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    # 評審沒評到的題目不算通過也不算失敗，但要讓呼叫端知道這次結果不完整。
    return 0 if all_completed and len(scored) == len(cases) else 2


if __name__ == "__main__":
    sys.exit(main())
