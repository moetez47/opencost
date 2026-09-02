const fs = require("fs");
const path = require("path");
const pool = require("../db");

async function migrate() {
  const schemaPath = path.join(__dirname, "..", "schema.sql");
  let sql = fs.readFileSync(schemaPath, "utf8");

  if (sql.charCodeAt(0) === 0xFEFF) {
    sql = sql.slice(1);
  }

  const client = await pool.connect();
  try {
    console.log("Running migration...");
    await client.query(sql);
    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();