const { Client } = require('pg');

// RDS synchronization Lambda function
exports.handler = async (event, context) => {
    console.log('RDS Sync Lambda triggered:', JSON.stringify(event, null, 2));
    
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('Connected to RDS database');

        // Check if this is an API Gateway event or EventBridge event
        let guestData = null;
        let operation = null;

        if (event.source === 'aws.apigateway') {
            // EventBridge event from API Gateway
            console.log('Processing EventBridge event from API Gateway');
            
            // Extract guest data from the event detail
            if (event.detail && event.detail.requestBody) {
                try {
                    guestData = JSON.parse(event.detail.requestBody);
                    operation = event.detail.httpMethod;
                } catch (e) {
                    console.error('Failed to parse request body:', e);
                }
            }
        } else if (event.Records) {
            // Direct invocation or other trigger
            console.log('Processing direct invocation');
            
            for (const record of event.Records) {
                if (record.eventSource === 'aws:s3' || record.body) {
                    // Handle S3 events or SQS messages if needed
                    console.log('Processing record:', record);
                }
            }
        } else if (event.guestData && event.operation) {
            // Direct invocation with guest data
            guestData = event.guestData;
            operation = event.operation;
        }

        // Perform database operations based on the event
        if (guestData && operation) {
            await processGuestOperation(client, guestData, operation);
        } else {
            // Perform general sync operations
            await performGeneralSync(client);
        }

        await client.end();
        console.log('RDS sync completed successfully');

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'RDS synchronization completed successfully',
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('RDS sync error:', error);
        
        try {
            await client.end();
        } catch (e) {
            console.error('Error closing database connection:', e);
        }

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'RDS synchronization failed',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};

async function processGuestOperation(client, guestData, operation) {
    console.log(`Processing ${operation} operation for guest:`, guestData);

    switch (operation.toLowerCase()) {
        case 'post':
            await insertGuest(client, guestData);
            break;
        case 'put':
            await updateGuest(client, guestData);
            break;
        case 'delete':
            await deleteGuest(client, guestData);
            break;
        default:
            console.log(`Unknown operation: ${operation}`);
    }
}

async function insertGuest(client, guestData) {
    const query = `
        INSERT INTO guests (
            token, guest_name, email, phone, guest_type, max_guests, 
            wedding_side, permissions, device_fingerprint, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (token) DO UPDATE SET
            guest_name = EXCLUDED.guest_name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            guest_type = EXCLUDED.guest_type,
            max_guests = EXCLUDED.max_guests,
            wedding_side = EXCLUDED.wedding_side,
            permissions = EXCLUDED.permissions,
            device_fingerprint = EXCLUDED.device_fingerprint,
            is_active = EXCLUDED.is_active,
            updated_at = CURRENT_TIMESTAMP
    `;

    const values = [
        guestData.accessCode || guestData.token,
        guestData.name || guestData.guest_name,
        guestData.email,
        guestData.phone,
        guestData.type || guestData.guest_type,
        guestData.maxGuests || guestData.max_guests || 2,
        guestData.side || guestData.wedding_side || 'both',
        JSON.stringify(guestData.permissions || ['guest']),
        guestData.deviceFingerprint || guestData.device_fingerprint,
        guestData.is_active !== undefined ? guestData.is_active : true,
        guestData.createdAt || guestData.created_at || new Date().toISOString()
    ];

    await client.query(query, values);
    console.log('Guest inserted/updated successfully');
}

async function updateGuest(client, guestData) {
    const query = `
        UPDATE guests SET
            guest_name = $2,
            email = $3,
            phone = $4,
            guest_type = $5,
            max_guests = $6,
            wedding_side = $7,
            permissions = $8,
            device_fingerprint = $9,
            is_active = $10,
            updated_at = CURRENT_TIMESTAMP
        WHERE token = $1
    `;

    const values = [
        guestData.accessCode || guestData.token,
        guestData.name || guestData.guest_name,
        guestData.email,
        guestData.phone,
        guestData.type || guestData.guest_type,
        guestData.maxGuests || guestData.max_guests,
        guestData.side || guestData.wedding_side,
        JSON.stringify(guestData.permissions || ['guest']),
        guestData.deviceFingerprint || guestData.device_fingerprint,
        guestData.is_active !== undefined ? guestData.is_active : true
    ];

    const result = await client.query(query, values);
    console.log(`Guest updated: ${result.rowCount} rows affected`);
}

async function deleteGuest(client, guestData) {
    const query = 'DELETE FROM guests WHERE token = $1';
    const values = [guestData.accessCode || guestData.token];

    const result = await client.query(query, values);
    console.log(`Guest deleted: ${result.rowCount} rows affected`);
}

async function performGeneralSync(client) {
    console.log('Performing general database sync operations');

    // Clean up inactive guests older than 30 days
    const cleanupQuery = `
        UPDATE guests 
        SET is_active = false 
        WHERE is_active = true 
        AND created_at < NOW() - INTERVAL '30 days'
        AND token NOT IN (
            SELECT DISTINCT guest_token 
            FROM rsvp_responses 
            WHERE guest_token IS NOT NULL
        )
    `;

    const cleanupResult = await client.query(cleanupQuery);
    console.log(`Cleaned up ${cleanupResult.rowCount} inactive guests`);

    // Update guest statistics
    const statsQuery = `
        INSERT INTO guest_stats (date, total_guests, active_guests, rsvp_responses)
        VALUES (
            CURRENT_DATE,
            (SELECT COUNT(*) FROM guests),
            (SELECT COUNT(*) FROM guests WHERE is_active = true),
            (SELECT COUNT(*) FROM rsvp_responses WHERE created_at::date = CURRENT_DATE)
        )
        ON CONFLICT (date) DO UPDATE SET
            total_guests = EXCLUDED.total_guests,
            active_guests = EXCLUDED.active_guests,
            rsvp_responses = EXCLUDED.rsvp_responses,
            updated_at = CURRENT_TIMESTAMP
    `;

    try {
        await client.query(statsQuery);
        console.log('Guest statistics updated');
    } catch (error) {
        // Table might not exist, create it
        if (error.code === '42P01') {
            await createStatsTable(client);
            await client.query(statsQuery);
            console.log('Guest statistics table created and updated');
        } else {
            throw error;
        }
    }
}

async function createStatsTable(client) {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS guest_stats (
            id SERIAL PRIMARY KEY,
            date DATE UNIQUE NOT NULL,
            total_guests INTEGER DEFAULT 0,
            active_guests INTEGER DEFAULT 0,
            rsvp_responses INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    await client.query(createTableQuery);
    console.log('Guest statistics table created');
}
