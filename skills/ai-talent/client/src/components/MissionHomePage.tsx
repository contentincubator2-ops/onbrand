'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { BriefcaseIcon, Search, SparklesIcon } from 'lucide-react';

interface MissionHomePageProps {
    workspace?: string;
    onTaskSelect?: (task: string) => void;
}

const SUGGESTED_TASKS = [
  { id: 1, label: '品牌定位報告', description: '品牌定位、市場分析、競爭策略' },
  { id: 2, label: '廣告文案組合', description: '文案創意、視覺概念、投放策略' },
  { id: 3, label: '市場調研分析', description: '市場規模、消費者洞察、趨勢預測' },
  { id: 4, label: '社群內容規劃', description: '內容日曆、互動策略、成長計畫' },
];

export function MissionHomePage({ workspace = 'strategy', onTaskSelect }: MissionHomePageProps) {
    const [searchInput, setSearchInput] = useState('');

  // Fetch resource summary from tRPC
  const { data: resourceSummary } = trpc.resource.summary.useQuery(
    { workspace },
    { staleTime: 1000 * 60 * 5 } // 5 minutes cache
  );

  const handleTaskClick = (taskLabel: string) => {
        if (onTaskSelect) {
                onTaskSelect(`製作做一份${taskLabel}`);
        }
  };

  const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchInput.trim() && onTaskSelect) {
                onTaskSelect(searchInput);
        }
  };

  return (
        <div className="w-full h-full flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-50 to-slate-100">
          {/* Header Section */}
              <div className="max-w-2xl w-full space-y-6">
                {/* Icon */}
                      <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center">
                                            <BriefcaseIcon className="w-8 h-8 text-slate-600" />
                                </div>
                      </div>

                {/* Title */}
                      <div className="text-center space-y-3">
                                <h1 className="text-3xl font-bold text-slate-900">啟動自主代理任務</h1>
                                <p className="text-base text-slate-600">
                                            輸入任務後，系統會先提案團隊與執行計劃，再接力式自動完成。
                                </p>
                      </div>

                {/* Resource Summary */}
                {resourceSummary && (
                    <div className="bg-white rounded-lg shadow-sm p-4 border border-slate-200">
                                <div className="grid grid-cols-3 gap-4">
                                              <div className="text-center">
                                                              <div className="text-2xl font-bold text-slate-900">{resourceSummary.agentCount || 0}</div>
                                                              <div className="text-xs text-slate-600 mt-1">Agents</div>
                                              </div>
                                              <div className="text-center">
                                                              <div className="text-2xl font-bold text-slate-900">{resourceSummary.skillCount || 0}</div>
                                                              <div className="text-xs text-slate-600 mt-1">Skills</div>
                                              </div>
                                              <div className="text-center">
                                                              <div className="text-2xl font-bold text-slate-900">{resourceSummary.modelCount || 0}</div>
                                                              <div className="text-xs text-slate-600 mt-1">Models</div>
                                              </div>
                                </div>
                    </div>
                      )}

                {/* Search Input */}
                      <form onSubmit={handleSearch} className="w-full">
                                <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input
                                                            type="text"
                                                            placeholder="選擇品牌後開始輸入任務…"
                                                            value={searchInput}
                                                            onChange={(e) => setSearchInput(e.target.value)}
                                                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-500"
                                                          />
                                </div>
                      </form>

                {/* Suggested Tasks */}
                      <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                            <SparklesIcon className="w-4 h-4 text-amber-500" />
                                            <span className="text-sm font-medium text-slate-700">建議任務</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  {SUGGESTED_TASKS.map((task) => (
                        <button
                                          key={task.id}
                                          onClick={() => handleTaskClick(task.label)}
                                          className="p-4 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left hover:shadow-md"
                                        >
                                        <div className="font-medium text-slate-900 text-sm">{task.label}</div>
                                        <div className="text-xs text-slate-500 mt-1">{task.description}</div>
                        </button>
                      ))}
                                </div>
                      </div>
              </div>
        </div>
      );
}
