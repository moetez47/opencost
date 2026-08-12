require("dotenv").config();
/**
 * gcp.js
 * Live cost source for GCP, queried from the BigQuery billing export table.
 *
 * Requires env vars:
 *   GCP_SERVICE_ACCOUNT_KEY_PATH
 *   GCP_PROJECT_ID
 *   GCP_BQ_DATASET
 *   GCP_BQ_TABLE
 */

const { BigQuery } = require("@google-cloud/bigquery");

function getClient() {
  const keyFilename = process.env.GCP_SERVICE_ACCOUNT_KEY_PATH;
  const projectId = process.env.GCP_PROJECT_ID;

  if (!keyFilename) throw new Error("Missing GCP_SERVICE_ACCOUNT_KEY_PATH");
  if (!projectId) throw new Error("Missing GCP_PROJECT_ID");

  return new BigQuery({ projectId, keyFilename });
}

/**
 * Public entry point: returns cost line items for the current month,
 * grouped by service, from the GCP billing export table.
 */
async function getGcpCosts() {
  const dataset = process.env.GCP_BQ_DATASET;
  const table = process.env.GCP_BQ_TABLE;

  if (!dataset) throw new Error("Missing GCP_BQ_DATASET");
  if (!table) throw new Error("Missing GCP_BQ_TABLE");

  const bigquery = getClient();

  const query = `
    SELECT
      service.description AS service,
      DATE(usage_start_time) AS usageDate,
      SUM(cost) AS cost
    FROM \`${process.env.GCP_PROJECT_ID}.${dataset}.${table}\`
    WHERE DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    GROUP BY service, usageDate
    ORDER BY usageDate ASC
  `;

  const [rows] = await bigquery.query({ query });

  return rows.map((row) => ({
    service: row.service ?? "unknown",
    date: row.usageDate?.value ?? row.usageDate,
    costThisMonth: Number(Number(row.cost ?? 0).toFixed(4)),
    source: "gcp-billing-export",
  }));
}

module.exports = { getGcpCosts };

// Example standalone run: `node gcp.js`
if (require.main === module) {
  getGcpCosts()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error("Failed to build GCP cost report:", err);
      process.exit(1);
    });
}