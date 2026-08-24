"use client";

import { useState } from "react";
import type { MindMapNode } from "@/lib/schemas";

export default function MindMapView({ root }: { root: MindMapNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        <RootNode node={root} />
      </div>
    </div>
  );
}

function RootNode({ node }: { node: MindMapNode }) {
  return (
    <div>
      <div className="inline-flex flex-col gap-1 rounded-2xl bg-brand-600 px-5 py-3 text-white shadow-lg shadow-brand-600/20 dark:shadow-brand-900/40">
        <span className="text-xs font-medium uppercase tracking-wide text-brand-100">
          Root topic
        </span>
        <span className="text-lg font-semibold leading-tight">{node.label}</span>
        {node.description && (
          <span className="max-w-md text-sm text-brand-50/90">{node.description}</span>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-l-2 border-brand-200 pl-5 dark:border-brand-800">
          {node.children.map((child, i) => (
            <BranchNode key={child.id + i} node={child} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchNode({ node, depth }: { node: MindMapNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  const depthStyles = [
    "border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100",
    "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-ink-800 dark:text-slate-100",
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-ink-900 dark:text-slate-300",
  ];
  const style = depthStyles[Math.min(depth - 1, depthStyles.length - 1)];

  return (
    <div>
      <button
        type="button"
        onClick={() => hasChildren && setExpanded((e) => !e)}
        className={`group flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${style} ${
          hasChildren ? "cursor-pointer hover:brightness-95 dark:hover:brightness-125" : "cursor-default"
        }`}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {hasChildren ? (
          <span
            className={`mt-0.5 inline-block h-4 w-4 flex-none select-none text-center text-xs leading-4 text-current/60 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
        ) : (
          <span className="mt-0.5 inline-block h-4 w-4 flex-none text-center text-xs leading-4 text-current/30">
            •
          </span>
        )}
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{node.label}</span>
          {node.description && (
            <span className="text-xs text-current/70">{node.description}</span>
          )}
        </span>
        {hasChildren && (
          <span className="ml-auto flex-none self-center rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-medium">
            {node.children.length}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div className="mt-2 flex flex-col gap-2 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
          {node.children.map((child, i) => (
            <BranchNode key={child.id + i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
