"use client";

import type { AgentTraceEntry } from "@/lib/schemas";

const STATUS_STYLE: Record<AgentTraceEntry["status"], string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  running: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  pending: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABEL: Record<AgentTraceEntry["status"], string> = {
  success: "Done",
  running: "Running",
  error: "Failed",
  pending: "Pending",
};

export default function AgentTrace({ trace }: { trace: AgentTraceEntry[] }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm open:pb-2 dark:border-slate-800 dark:bg-ink-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-5 py-4 text-left sm:px-6">
        <span>
          <span className="block text-lg font-semibold text-slate-900 dark:text-white">
            🧭 How the AI Agents Worked
          </span>
          <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
            Coordinator → Context Analyzer → Exploration + Assumption Challenger → Mind-Map Architect → Critic → Human Review → Refinement
          </span>
        </span>
        <span className="flex-none text-slate-400 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ol className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
        {trace.map((entry, i) => (
          <li
            key={i}
            className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-ink-800/60 sm:flex-row sm:items-start sm:gap-4"
          >
            <div className="flex flex-none items-center gap-2 sm:w-56">
              <span className="font-medium text-slate-800 dark:text-slate-100">{entry.agent}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[entry.status]}`}
              >
                {STATUS_LABEL[entry.status]}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">{entry.purpose}</p>
              {entry.summary && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{entry.summary}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
