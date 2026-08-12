/**
 * backup.js
 * Static cost source for "Hetzner-Backup" resources.
 * These are not exposed via a live pricing endpoint (Robot / Storage Box
 * contracts don't return current billing data), so cost is set manually.
 *
 * Preferred: HETZNER_BACKUP_SERVERS_JSON — a JSON array giving each
 * server its own real monthly cost and description, e.g.:
 *   [{"name":"Enclaive-R","description":"AX162-R, +128GB RAM","costUsd":343.49}, ...]
 *
 * Legacy fallback (still supported): a flat total split evenly —
 *   HETZNER_BACKUP_MONTHLY_TOTAL_USD  e.g. "1000"
 *   HETZNER_BACKUP_SERVER_NAMES       comma-separated, e.g. "srv-a,srv-b,srv-c"
 */

const DAYS_PER_MONTH = 30; // approximation; swap for calendar-accurate if needed
const HOURS_PER_DAY = 24;

function parseServerNames(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getBackupConfig(env = process.env) {
  // Preferred path: per-server JSON with real costs + descriptions
  if (env.HETZNER_BACKUP_SERVERS_JSON) {
    let parsed;
    try {
      parsed = JSON.parse(env.HETZNER_BACKUP_SERVERS_JSON);
    } catch (e) {
      throw new Error(
        `HETZNER_BACKUP_SERVERS_JSON is set but is not valid JSON: ${e.message}`
      );
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("HETZNER_BACKUP_SERVERS_JSON must be a non-empty JSON array.");
    }
    const servers = parsed.map((s) => ({
      name: s.name,
      description: s.description || "",
      monthlyRate: Number(s.costUsd),
    }));
    if (servers.some((s) => !s.name || !Number.isFinite(s.monthlyRate))) {
      throw new Error(
        "Each entry in HETZNER_BACKUP_SERVERS_JSON needs a valid 'name' and numeric 'costUsd'."
      );
    }
    return { servers };
  }

  // Legacy fallback: flat total split evenly
  const monthlyTotal = Number(env.HETZNER_BACKUP_MONTHLY_TOTAL_USD);
  const serverNames = parseServerNames(env.HETZNER_BACKUP_SERVER_NAMES);

  if (!Number.isFinite(monthlyTotal) || monthlyTotal <= 0) {
    throw new Error(
      "Set HETZNER_BACKUP_SERVERS_JSON (preferred), or HETZNER_BACKUP_MONTHLY_TOTAL_USD + HETZNER_BACKUP_SERVER_NAMES."
    );
  }
  if (serverNames.length === 0) {
    throw new Error(
      "HETZNER_BACKUP_SERVER_NAMES is missing or empty. Set it as a comma-separated list in the environment."
    );
  }

  const perServerMonthly = monthlyTotal / serverNames.length;
  return {
    servers: serverNames.map((name) => ({
      name,
      description: "",
      monthlyRate: perServerMonthly,
    })),
  };
}

function getBackupCosts({ now = new Date(), env = process.env } = {}) {
  const { servers } = getBackupConfig(env);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const hoursElapsedThisMonth = (now - startOfMonth) / 1000 / 60 / 60;

  return servers.map(({ name, description, monthlyRate }) => {
    const hourlyRate = monthlyRate / DAYS_PER_MONTH / HOURS_PER_DAY;
    return {
      id: `backup-${name}`,
      name,
      description,
      serverType: "fixed-contract",
      location: "unknown",
      status: "static",
      monthlyRate: Number(monthlyRate.toFixed(2)),
      hourlyRate: Number(hourlyRate.toFixed(6)),
      hoursElapsedThisMonth: Number(hoursElapsedThisMonth.toFixed(2)),
      hoursThisMonth: Number(hoursElapsedThisMonth.toFixed(2)),
      runningCost: Number((hourlyRate * hoursElapsedThisMonth).toFixed(4)),
      costThisMonth: Number((hourlyRate * hoursElapsedThisMonth).toFixed(4)),
      source: "hetzner-backup-fixed",
    };
  });
}

module.exports = { getBackupCosts, getBackupConfig, parseServerNames };