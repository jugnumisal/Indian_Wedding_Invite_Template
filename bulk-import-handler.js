const { Client } = require('pg');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({ region: 'us-east-1' });

function generateCode() {
  return Array(6).fill(0).map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}

exports.handler = async (event) => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  
  const guests = event.guests || [];
  let success = 0;
  
  for (const g of guests) {
    const code = generateCode();
    
    try {
      await client.query(
        'INSERT INTO invitations (token, guest_name, email, phone, max_guests, guest_side, event_access, permissions, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())',
        [code, g.name, g.email, g.phone, g.maxGuests, g.guestSide, g.eventAccess, ['guest']]
      );
      
      if (g.email) {
        await lambda.send(new InvokeCommand({
          FunctionName: 'your-email-sender-function',
          InvocationType: 'Event',
          Payload: JSON.stringify({ guestData: { name: g.name, email: g.email, accessCode: code, guestSide: g.guestSide, eventAccess: g.eventAccess } })
        }));
      }
      
      if (g.phone) {
        await lambda.send(new InvokeCommand({
          FunctionName: 'your-whatsapp-sender-function',
          InvocationType: 'Event',
          Payload: JSON.stringify({ guestData: { name: g.name, phone: g.phone, accessCode: code } })
        }));
      }
      
      success++;
    } catch (err) {
      console.error(`Failed ${g.name}:`, err.message);
    }
  }
  
  await client.end();
  
  return { statusCode: 200, body: JSON.stringify({ success, total: guests.length }) };
};
