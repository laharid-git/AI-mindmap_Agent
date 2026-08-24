import type { ReactNode } from "react";

export default function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-ink-900 sm:p-6">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function ListBlock({
  heading,
  items,
  emptyLabel = "None identified.",
  tone = "default",
}: {
  heading: string;
  items: string[];
  emptyLabel?: string;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  const dot = {
    default: "bg-slate-400",
    positive: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  }[tone];

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{heading}</h3>
      {items.length === 0 ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${dot}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
