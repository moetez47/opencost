import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';

function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

async function bootstrapAdmin() {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      "SELECT user_id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existing.rows.length > 0) {
      console.log('An admin user already exists. Skipping bootstrap.');
      return;
    }

    const username = 'admin';
    const email = 'admin@opencost.local';
    const plainPassword = generatePassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    await client.query(
      `INSERT INTO users (username, email, password_hash, role, first_login)
       VALUES ($1, $2, $3, 'admin', TRUE)`,
      [username, email, passwordHash]
    );

    console.log('==================================================');
    console.log('Admin account created.');
    console.log('Username:', username);
    console.log('Password:', plainPassword);
    console.log('Save this password now — it will not be shown again.');
    console.log('==================================================');
  } catch (err) {
    console.error('Admin bootstrap failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

bootstrapAdmin();
