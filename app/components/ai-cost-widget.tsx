import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectItem,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { ScaleTypes } from "@carbon/charts";
import { SwitchableChart } from "./switchable-chart";
import { ChartTypeToggle, type ChartMode } from "./chart-type-toggle";
import { useAppTheme } from "~/components/theme-context";
import { useSettings } from "~/components/settings-context";
import { toCurrency } from "~/lib/legacy-util";
import { primary } from "~/constants/colors";
import { CLOUD_WINDOW_OPTIONS } from "~/constants/cloud-cost-options";
import { FilterableWidgetHeader } from "./scoped-views";

const AI_BREAKDOWN_OPTIONS = [
  { name: "Model", value: "model" },
  { name: "Provider", value: "provider" },
  { name: "Account", value: "account" },
];

interface AiChartPoint {
  group: string;
  key: string;
  value: number;
  provider: string;
  account: string;
}

interface AiCostRow {
  model: string;
  tokens: number;
  cost: number;
}

interface ParsedAiData {
  chartData: AiChartPoint[];
  tableRows: AiCostRow[];
  totalCost: number;
  totalTokens: number;
}

// Approximates each window option as a lookback day-count, since the
// underlying /api/anthropic-costs and /api/openai-costs routes take a
// simple `days` parameter rather than explicit start/end dates.
function windowToDays(window: string): number {
  switch (window) {
    case "today":
      return 1;
    case "yesterday":
      return 2;
    case "24h":
      return 1;
    case "48h":
      return 2;
    case "week":
      return 7;
    case "lastweek":
      return 14;
    case "7d":
      return 7;
    case "14d":
      return 14;
    case "30d":
      return 30;
    default:
      return 7;
  }
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

// Anthropic /v1/organizations/cost_report response shape:
// { data: [ { starting_at, ending_at, results: [ { description, amount, currency, workspace_id? } ] } ] }
function parseAnthropicCosts(json: any): AiChartPoint[] {
  const points: AiChartPoint[] = [];
  const buckets = Array.isArray(json?.data) ? json.data : [];
  for (const bucket of buckets) {
    const label = formatDayLabel(bucket?.starting_at ?? bucket?.ending_at ?? "");
    const results = Array.isArray(bucket?.results) ? bucket.results : [];
    for (const r of results) {
      const key = r?.description ?? "Claude (unlabeled)";
      const value = Number(r?.amount ?? 0);
      if (!Number.isFinite(value)) continue;
      const account =
        r?.workspace_id ?? r?.account_id ?? r?.organization_id ?? "Anthropic account";
      points.push({ group: label, key, value, provider: "Anthropic", account });
    }
  }
  return points;
}

// OpenAI /v1/organization/costs response shape:
// { data: [ { start_time, end_time, results: [ { line_item, amount: { value, currency }, project_id? } ] } ] }
function parseOpenAiCosts(json: any): AiChartPoint[] {
  const points: AiChartPoint[] = [];
  const buckets = Array.isArray(json?.data) ? json.data : [];
  for (const bucket of buckets) {
    const startIso = bucket?.start_time
      ? new Date(bucket.start_time * 1000).toISOString()
      : "";
    const label = formatDayLabel(startIso);
    const results = Array.isArray(bucket?.results) ? bucket.results : [];
    for (const r of results) {
      const key = r?.line_item ?? "OpenAI (unlabeled)";
      const value = Number(r?.amount?.value ?? 0);
      if (!Number.isFinite(value)) continue;
      const account =
        r?.project_id ?? r?.organization_id ?? r?.account_id ?? "OpenAI account";
      points.push({ group: label, key, value, provider: "OpenAI", account });
    }
  }
  return points;
}

// /api/openrouter-costs response shape:
// { items: [ { date, model, provider, tokensUsed, cost, requests } ], totalCost, totalTokens }
// Filtered client-side to the selected window, since OpenRouter's Activity
// API always returns a fixed last-30-day range rather than accepting a
// day-count parameter.
function parseOpenRouterCosts(json: any, days: number): AiChartPoint[] {
  const points: AiChartPoint[] = [];
  const items = Array.isArray(json?.items) ? json.items : [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const item of items) {
    const itemTime = new Date(item?.date ?? "").getTime();
    if (Number.isFinite(itemTime) && itemTime < cutoff) continue;
    const label = formatDayLabel(item?.date ?? "");
    const key = item?.model ?? "OpenRouter (unlabeled)";
    const value = Number(item?.cost ?? 0);
    if (!Number.isFinite(value)) continue;
    const account = item?.provider ?? "OpenRouter account";
    points.push({ group: label, key, value, provider: "OpenRouter", account });
  }
  return points;
}

function buildAiData(chartData: AiChartPoint[], breakdown: string): ParsedAiData {
  const groupedChartData =
    breakdown === "provider"
      ? chartData.map((p) => ({ ...p, key: p.provider }))
      : breakdown === "account"
        ? chartData.map((p) => ({ ...p, key: p.account }))
        : chartData;

  const totals: Record<string, number> = {};
  for (const p of groupedChartData) {
    totals[p.key] = (totals[p.key] ?? 0) + p.value;
  }

  const tableRows: AiCostRow[] = Object.entries(totals)
    .map(([model, cost]) => ({ model, tokens: 0, cost }))
    .sort((a, b) => b.cost - a.cost);

  const totalCost = tableRows.reduce((sum, r) => sum + r.cost, 0);

  return { chartData: groupedChartData, tableRows, totalCost, totalTokens: 0 };
}

function buildColorScale(points: AiChartPoint[]): Record<string, string> {
  const scale: Record<string, string> = {};
  const keys = [...new Set(points.map((p) => p.key))];
  keys.forEach((key, index) => {
    scale[key] = primary[index % primary.length];
  });
  return scale;
}

const headers = [
  { key: "model", header: "Model", isSortable: true },
  { key: "tokens", header: "Tokens Used", isSortable: true },
  { key: "cost", header: "Total cost", isSortable: true },
];

const EMPTY_AI_DATA: ParsedAiData = {
  chartData: [],
  tableRows: [],
  totalCost: 0,
  totalTokens: 0,
};

export default function AiCostWidget() {
  const { defaultCurrency } = useSettings();
  const { theme } = useAppTheme();
  const [showFilters, setShowFilters] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("bar");
  const [window, setWindow] = useState("7d");
  const [breakdown, setBreakdown] = useState("model");
  const [aiData, setAiData] = useState<ParsedAiData>(EMPTY_AI_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currency = defaultCurrency;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const days = windowToDays(window);
        const [anthropicRes, openaiRes, openrouterRes] = await Promise.all([
          fetch(`/api/anthropic-costs?days=${days}`).then((r) => r.json()),
          fetch(`/api/openai-costs?days=${days}`).then((r) => r.json()),
          fetch(`/api/openrouter-costs`, { credentials: "include" }).then((r) => r.json()),
        ]);

        if (cancelled) return;

        if (anthropicRes?.error || openaiRes?.error || openrouterRes?.error) {
          setError(
            anthropicRes?.error?.message ??
              openaiRes?.error?.message ??
              (typeof openrouterRes?.error === "string"
                ? openrouterRes.error
                : openrouterRes?.error?.message) ??
              "Failed to load AI cost data",
          );
        }

        const combined = [
          ...parseAnthropicCosts(anthropicRes),
          ...parseOpenAiCosts(openaiRes),
          ...parseOpenRouterCosts(openrouterRes, days),
        ];
        setAiData(buildAiData(combined, breakdown));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAiData(EMPTY_AI_DATA);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [window, breakdown]);

  const { chartData, tableRows, totalCost, totalTokens } = aiData;

  const chartOptions = useMemo(() => {
    const colorScale = buildColorScale(chartData);
    return {
      theme,
      title: "",
      axes: {
        left: {
          mapsTo: "value",
          scaleType: ScaleTypes.LINEAR,
          ticks: {
            formatter: (v: number | Date) =>
              toCurrency(typeof v === "number" ? v : v.getTime(), currency),
          },
        },
        bottom: { mapsTo: "group", scaleType: ScaleTypes.LABELS },
      },
      data: { groupMapsTo: "key" },
      height: "300px",
      color: { scale: colorScale },
      bars: { maxWidth: 48, spacingFactor: 0.65 },
      tooltip: {
        totalLabel: "Total:",
        valueFormatter: (value: number) => toCurrency(value, currency),
        showTotal: true,
        groupLabel: "Date",
      },
    };
  }, [chartData, currency, theme]);

  const windowLabel =
    CLOUD_WINDOW_OPTIONS.find((o) => o.value === window)?.name ?? window;
  const breakdownLabel =
    AI_BREAKDOWN_OPTIONS.find((o) => o.value === breakdown)?.name ?? breakdown;

  return (
    <div id="ai-cost" className="w-full">
      <FilterableWidgetHeader
        title="AI Cost"
        description={`Cumulative LLM spend for ${windowLabel} by ${breakdownLabel.toLowerCase()}`}
        expanded={showFilters}
        onToggle={() => setShowFilters((s) => !s)}
        headerActions={
          <ChartTypeToggle mode={chartMode} onChange={setChartMode} />
        }
        filterContent={
          <div
            className="grid gap-3 mb-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
          >
            <Select
              id="ai-cost-window"
              labelText="Date range"
              value={window}
              size="sm"
              onChange={(e) => setWindow(e.target.value)}
            >
              {CLOUD_WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} text={o.name} />
              ))}
            </Select>
            <Select
              id="ai-cost-breakdown"
              labelText="Breakdown"
              value={breakdown}
              size="sm"
              onChange={(e) => setBreakdown(e.target.value)}
            >
              {AI_BREAKDOWN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} text={o.name} />
              ))}
            </Select>
          </div>
        }
      />

      {error && (
        <InlineNotification
          kind="error"
          title="Failed to load AI cost data"
          subtitle={error}
          lowContrast
          hideCloseButton
          className="mb-3"
        />
      )}

      <div id="ai-cost-graph" className="mb-6">
        <div className="w-full h-[300px] relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <InlineLoading description="Loading AI cost data..." />
            </div>
          )}
          {!loading && chartData.length === 0 && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60">
              No AI usage recorded for {windowLabel.toLowerCase()}.
            </div>
          )}
          <SwitchableChart
            data={chartData}
            options={chartOptions}
            mode={chartMode}
            stacked
          />
        </div>
      </div>

      <div id="ai-cost-table">
        <TableContainer className="v2-sticky-header">
          <Table size="md" useZebraStyles>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader key={header.key} isSortable={header.isSortable}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow
                className="font-semibold"
                style={{ borderBottom: "2px solid var(--cds-border-strong)" }}
              >
                <TableCell>Totals</TableCell>
                <TableCell className="v2-table-numeric">—</TableCell>
                <TableCell className="v2-table-numeric">
                  {toCurrency(totalCost, currency)}
                </TableCell>
              </TableRow>
              {tableRows.map((row) => (
                <TableRow key={row.model} className="v2-table-row-hover">
                  <TableCell>{row.model}</TableCell>
                  <TableCell className="v2-table-numeric">—</TableCell>
                  <TableCell className="v2-table-numeric">
                    {toCurrency(row.cost, currency)}
                  </TableCell>
                </TableRow>
              ))}
              {tableRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center opacity-60">
                    No cost data yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
}