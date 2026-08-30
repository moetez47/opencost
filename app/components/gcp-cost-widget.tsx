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
  InlineLoading,
  InlineNotification,
} from "@carbon/react";

interface GcpCostItem {
  service: string;
  date: string;
  costThisMonth: number;
  source: string;
}

const headers = [
  { key: "service", header: "Service" },
  { key: "date", header: "Date" },
  { key: "costThisMonth", header: "Cost" },
];

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return "$" + value.toFixed(4);
}

interface GcpCostWidgetProps {
  title?: string;
  description?: string;
}

export default function GcpCostWidget({
  title = "GCP Cost",
  description = "GCP billing export costs by service",
}: GcpCostWidgetProps) {
  const [items, setItems] = useState<GcpCostItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCosts() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/gcp-costs", {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Request failed (" + res.status + ")");
        if (!cancelled) setItems(json);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load GCP costs");
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
    items?.map((item, idx) => ({
      id: String(idx),
      service: item.service,
      date: item.date,
      costThisMonth: item.costThisMonth,
    })) ?? [];

  const total = items?.reduce((sum, item) => sum + (item.costThisMonth ?? 0), 0) ?? 0;

  return (
    <div>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm" style={{ color: "var(--cds-text-secondary)" }}>
            {description}
          </p>
        </div>
        {items && (
          <span className="text-base font-semibold" style={{ color: "var(--cds-text-secondary)" }}>
            {formatUsd(total)}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <InlineLoading description="Loading GCP costs..." />
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

      {items && !loading && !error && (
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
                  {rows.map((row: any) => (
                    <TableRow {...getRowProps({ row })} key={row.id}>
                      {row.cells.map((cell: any) => {
                        if (cell.info.header === "costThisMonth") {
                          return <TableCell key={cell.id}>{formatUsd(cell.value)}</TableCell>;
                        }
                        return <TableCell key={cell.id}>{cell.value}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </div>
  );
}
