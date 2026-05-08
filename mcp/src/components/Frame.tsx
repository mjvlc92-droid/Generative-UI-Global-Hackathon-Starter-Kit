import React from "react";
import type { Lead } from "../lib/leads/types";
import { optInRate, topWorkshop, toolUsage, workshopClass } from "../lib/leads/derive";

interface FrameProps {
  leads: Lead[];
  children: React.ReactNode;
}

/**
 * Shared chrome around each lead view: title, subtitle, and the four KPI
 * tiles. Mirrors the surface shown in the Next.js app so the widgets read as
 * the same product when surfaced inside Claude/ChatGPT.
 */
export function Frame({ leads, children }: FrameProps) {
  const opt = optInRate(leads);
  const top = topWorkshop(leads);
  const tools = toolUsage(leads);
  const topTool = tools[0]?.label ?? "—";
  const topToolCount = tools[0]?.count ?? 0;
  const subtitle = top
    ? `${leads.length} leads from Notion · top demand: ${top}`
    : `${leads.length} leads from Notion`;

  return (
    <div className="w-full p-4 text-neutral-900 dark:text-neutral-50">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Workshop Lead Triage</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {subtitle}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              {leads.length} leads
            </span>
            {" · "}
            Notion: AI Workshop Provider Community
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Total leads" value={String(leads.length)} />
          <Metric
            label="Opt-in rate"
            value={`${opt.pct}%`}
            sub={`${opt.yes} of ${leads.length}`}
            accentWidth={`${opt.pct}%`}
          />
          <Metric
            label="Top workshop demand"
            value={top ?? "—"}
            valueClass={
              top
                ? `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${workshopClass(top)}`
                : ""
            }
          />
          <Metric
            label="Most-used tool"
            value={topTool}
            sub={topToolCount ? `${topToolCount} signups` : undefined}
          />
        </div>

        {children}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  valueClass,
  accentWidth,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  accentWidth?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 truncate">
        {valueClass ? (
          <span className={valueClass}>{value}</span>
        ) : (
          <span className="text-lg font-semibold tabular-nums">{value}</span>
        )}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
          {sub}
        </div>
      ) : null}
      {accentWidth ? (
        <div className="mt-2 h-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: accentWidth }}
          />
        </div>
      ) : null}
    </div>
  );
}

