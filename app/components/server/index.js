/**
 * index.js
 * Merges the live "Hetzner-monitoring" costs and the static
 * "Hetzner-Backup" costs into one array with a consistent shape,
 * ready to plug into a dashboard panel or an OpenCost custom cost plugin.
 */

const { getMonitoringCosts } = require("./monitoring");
const { getBackupCosts } = require("./backup");

async function getHetznerCosts() {
  const [monitoring, backup] = await Promise.all([
    getMonitoringCosts().catch((err) => {
      console.error("Failed to fetch monitoring costs:", err.message);
      return [];
    }),
    Promise.resolve(getBackupCosts()),
  ]);

  const items = [...monitoring, ...backup];

  const totalRunningCost = items.reduce(
    (sum, item) => sum + (item.runningCost ?? 0),
    0
  );

  const totalMonthCost = items.reduce(
    (sum, item) => sum + (item.costThisMonth ?? 0),
    0
  );

  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  return {
    items,
    totalRunningCost: Number(totalRunningCost.toFixed(4)),
    totalMonthCost: Number(totalMonthCost.toFixed(4)),
    monthLabel,
    generatedAt: now.toISOString(),
  };
}

module.exports = { getHetznerCosts };

// Example standalone run: `node index.js`
if (require.main === module) {
  getHetznerCosts()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error("Failed to build Hetzner cost report:", err);
      process.exit(1);
    });
}