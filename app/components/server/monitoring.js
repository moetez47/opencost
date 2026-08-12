/**
 * monitoring.js
 * Live cost source for the "Hetzner-monitoring" Cloud API project.
 * Fetches server list + hourly pricing from the Hetzner Cloud API and
 * computes running cost based on uptime.
 *
 * Requires env var: HETZNER_MONITORING_TOKEN
 */

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";

/**
 * Fetch all servers visible to the monitoring token.
 */
async function fetchServers(token) {
  const res = await fetch(`${HETZNER_API_BASE}/servers`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Hetzner API error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.servers ?? [];
}

/**
 * Compute the running cost for a single server since it was created.
 * Hetzner's server object already includes the hourly price for its
 * server_type + location, so we don't need a separate /pricing call.
 */
function computeServerCost(server, now = new Date()) {
  const created = new Date(server.created);
  const hoursRunning = Math.max(0, (now - created) / 1000 / 60 / 60);

  // Month-to-date hours: from whichever is later, server creation or the
  // start of this calendar month, up to now. Lets us report "cost this
  // month" alongside all-time running cost.
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartForServer = created > startOfMonth ? created : startOfMonth;
  const hoursThisMonth = Math.max(0, (now - monthStartForServer) / 1000 / 60 / 60);

  // server.server_type.prices is an array keyed by location; find the
  // price entry matching this server's location.
  const locationName = server?.location?.name;
  const priceEntry = server?.server_type?.prices?.find(
    (p) => p.location === locationName
  );

  const hourlyGross = priceEntry ? parseFloat(priceEntry.price_hourly.gross) : null;

  return {
    id: server.id,
    name: server.name,
    serverType: server?.server_type?.name ?? "unknown",
    location: locationName ?? "unknown", // e.g. "nbg1"
    status: server.status,
    createdAt: server.created,
    hoursRunning: Number(hoursRunning.toFixed(2)),
    hourlyRate: hourlyGross,
    runningCost:
      hourlyGross !== null ? Number((hourlyGross * hoursRunning).toFixed(4)) : null,
    hoursThisMonth: Number(hoursThisMonth.toFixed(2)),
    costThisMonth:
      hourlyGross !== null ? Number((hourlyGross * hoursThisMonth).toFixed(4)) : null,
    source: "hetzner-monitoring-live",
  };
}

/**
 * Public entry point: returns cost line items for every server in the
 * monitoring project.
 */
async function getMonitoringCosts(token = process.env.HETZNER_MONITORING_TOKEN) {
  if (!token) {
    throw new Error("Missing HETZNER_MONITORING_TOKEN");
  }

  const servers = await fetchServers(token);
  return servers.map((s) => computeServerCost(s));
}

module.exports = { getMonitoringCosts, computeServerCost, fetchServers };