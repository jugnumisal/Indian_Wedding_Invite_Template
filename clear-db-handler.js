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

exports.handler = async (event) => {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE TABLE access_logs CASCADE');
    await client.query('TRUNCATE TABLE rsvp_submissions CASCADE');
    await client.query('TRUNCATE TABLE wa_message_queue CASCADE');
    await client.query('TRUNCATE TABLE invitations CASCADE');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Database cleared successfully' })
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  } finally {
    client.release();
  }
};
