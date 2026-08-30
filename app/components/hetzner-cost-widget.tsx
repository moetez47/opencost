import { useEffect, useState } from "react";
import {
  DataTable,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";

interface HetznerCostItem {
  id: string | number;
  name: string;
  serverType: string;
  location: string;
  status: string;
  description?: string;
  hourlyRate: number | null;
  runningCost: number | null;
  costThisMonth: number | null;
  source: "hetzner-monitoring-live" | "hetzner-backup-fixed";
}


interface HetznerCostResponse {
  items: HetznerCostItem[];
  totalRunningCost: number;
  totalMonthCost: number;
  monthLabel: string;
  generatedAt: string;
}

const headers = [
  { key: "name", header: "Server" },
  { key: "description", header: "Description" },
  { key: "serverType", header: "Type" },
  { key: "location", header: "Location" },
  { key: "source", header: "Source" },
  { key: "hourlyRate", header: "Hourly" },
  { key: "runningCost", header: "Running cost" },
];

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(2)}`;
}

interface HetznerCostWidgetProps {
  title?: string;
  description?: string;
}

export default function HetznerCostWidget({
  title = "Hetzner Cost",
  description = "Monitoring VM live pricing + fixed-rate backup servers",
}: HetznerCostWidgetProps) {
  const [data, setData] = useState<HetznerCostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCosts() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/hetzner-costs`, {
  credentials: "include",
});
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load Hetzner costs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCosts();
    const interval = setInterval(fetchCosts, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const rows =
    data?.items.map((item) => ({
      id: String(item.id),
      name: item.name,
      description: item.description ?? "",
      serverType: item.serverType,
      location: item.location,
      source: item.source,
      hourlyRate: item.hourlyRate,
      runningCost: item.runningCost,
    })) ?? [];

  return (
    <div>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm" style={{ color: "var(--cds-text-secondary)" }}>
            {description}
          </p>
        </div>
        {data && (
          <span className="text-base font-semibold" style={{ color: "var(--cds-text-secondary)" }}>
            {formatUsd(data.totalRunningCost)}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <InlineLoading description="Loading Hetzner costs..." />
        </div>
      )}

      {error && !loading && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      )}

      {data && !loading && !error && (
        <div
          className="flex items-center justify-between mb-4 px-4 py-3 rounded"
          style={{
            background: "var(--cds-layer-accent, #f4f4f4)",
            border: "1px solid var(--cds-border-subtle)",
          }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--cds-text-secondary)" }}>
            Total spent in {data.monthLabel}
          </span>
          <span className="text-xl font-semibold">{formatUsd(data.totalMonthCost)}</span>
        </div>
      )}

      {data && !loading && !error && (
        <DataTable rows={rows} headers={headers}>
          {({ rows, headers, getHeaderProps, getRowProps, getTableProps }: any) => (
            <TableContainer>
              <Table {...getTableProps()} size="sm">
                <TableHead>
                  <TableRow>
                    {headers.map((header: any) => (
                      <TableHeader {...getHeaderProps({ header })} key={header.key}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row: any) => {
                    const original = data.items.find((i) => String(i.id) === row.id)!;
                    return (
                      <TableRow {...getRowProps({ row })} key={row.id}>
                        {row.cells.map((cell: any) => {
                          if (cell.info.header === "source") {
                            return (
                              <TableCell key={cell.id}>
                                <Tag
                                  type={original.source === "hetzner-monitoring-live" ? "green" : "gray"}
                                  size="sm"
                                >
                                  {original.source === "hetzner-monitoring-live" ? "Live" : "Fixed"}
                                </Tag>
                              </TableCell>
                            );
                          }
                          if (cell.info.header === "hourlyRate") {
                            return (
                              <TableCell key={cell.id}>
                                {original.hourlyRate !== null
                                  ? `$${original.hourlyRate.toFixed(4)}`
                                  : "—"}
                              </TableCell>
                            );
                          }
                          if (cell.info.header === "runningCost") {
                            return (
                              <TableCell key={cell.id}>{formatUsd(original.runningCost)}</TableCell>
                            );
                          }
                          return <TableCell key={cell.id}>{cell.value}</TableCell>;
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}

      {data && (
        <p className="text-xs mt-2" style={{ color: "var(--cds-text-helper)" }}>
          Updated {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}


