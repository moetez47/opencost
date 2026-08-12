import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  let sql = fs.readFileSync(schemaPath, 'utf8');

  // Strip UTF-8 BOM if present (PowerShell's Out-File -Encoding utf8 adds one)
  if (sql.charCodeAt(0) === 0xFEFF) {
    sql = sql.slice(1);
  }

  const client = await pool.connect();
  try {
    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
