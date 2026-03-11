const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 2
});

exports.handler = async () => {
  const client = await pool.connect();
  try {
    const invitations = await client.query('SELECT COUNT(*) FROM invitations');
    const rsvps = await client.query('SELECT COUNT(*) FROM rsvp_submissions');
    const logs = await client.query('SELECT COUNT(*) FROM access_logs');
    const queue = await client.query('SELECT COUNT(*) FROM wa_message_queue');

    return {
      statusCode: 200,
      body: JSON.stringify({
        invitations: invitations.rows[0].count,
        rsvp_submissions: rsvps.rows[0].count,
        access_logs: logs.rows[0].count,
        wa_message_queue: queue.rows[0].count
      })
    };
  } finally {
    client.release();
  }
};
