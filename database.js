const { Pool } = require('pg');
require('dotenv').config();

class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    // Initialize database connection pool
    async initialize() {
        try {
            const config = {
                host: process.env.DB_HOST,
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
                max: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
                idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 300000, // 5 minutes
                connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // 10 seconds
                acquireTimeoutMillis: 60000, // 60 seconds to acquire connection
                createTimeoutMillis: 30000, // 30 seconds to create connection
                destroyTimeoutMillis: 5000, // 5 seconds to destroy connection
                reapIntervalMillis: 1000, // Check for idle connections every second
                createRetryIntervalMillis: 200, // Retry connection creation every 200ms
            };

            this.pool = new Pool(config);

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            console.log('✅ Successfully connected to RDS database');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to RDS database:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    // Get a client from the pool
    async getClient() {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return await this.pool.connect();
    }

    // Execute a query with automatic client management
    async query(text, params = []) {
        if (!this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }

        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    // Execute a transaction
    async transaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Close all connections
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('🔌 Database connection pool closed');
        }
    }

    // Check if database is connected
    isReady() {
        return this.isConnected && this.pool;
    }

    // Health check
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as health_check');
            return result.rows[0].health_check === 1;
        } catch (error) {
            console.error('Database health check failed:', error.message);
            return false;
        }
    }
}

// Guest database operations
class GuestDatabase {
    constructor(dbConnection) {
        this.db = dbConnection;
    }

    // Create a new guest invitation
    async createGuest(guestData) {
        const query = `
            INSERT INTO invitations (
                token, guest_name, email, phone, permissions, 
                device_fingerprint, max_guests, event_access, created_at, guest_side
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, token, guest_name, email, created_at, guest_side
        `;

        const values = [
            guestData.accessCode,
            guestData.name,
            guestData.email,
            guestData.phone || null,
            guestData.permissions || ['guest'],
            guestData.deviceFingerprint,
            guestData.maxGuests || 2,
            guestData.eventAccess || ['wedding'],
            guestData.createdAt || new Date().toISOString(),
            guestData.guestSide || null
        ];

        try {
            const result = await this.db.query(query, values);
            console.log('✅ Guest saved to RDS database:', result.rows[0]);
            return { success: true, guest: result.rows[0] };
        } catch (error) {
            console.error('❌ Failed to save guest to database:', error.message);
            
            // Handle duplicate token error
            if (error.code === '23505' && error.constraint === 'invitations_token_key') {
                return { success: false, error: 'Access code already exists. Please generate a new one.' };
            }
            
            return { success: false, error: error.message };
        }
    }

    // Get guest by access token
    async getGuestByToken(token) {
        const query = `
            SELECT id, token, guest_name, email, phone, permissions, 
                   device_fingerprint, max_guests, event_access, created_at,
                   expires_at, is_active, guest_side
            FROM invitations 
            WHERE token = $1 AND is_active = true
        `;

        try {
            const result = await this.db.query(query, [token]);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Invalid access token' };
            }

            const guest = result.rows[0];
            
            // Check if token has expired
            if (guest.expires_at && new Date() > new Date(guest.expires_at)) {
                return { success: false, error: 'Access token has expired' };
            }

            return { success: true, guest };
        } catch (error) {
            console.error('❌ Failed to retrieve guest from database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get guest by ID
    async getGuestById(guestId) {
        const query = `
            SELECT id, token, guest_name, email, phone, permissions, 
                   device_fingerprint, max_guests, event_access, created_at,
                   expires_at, is_active, guest_side
            FROM invitations 
            WHERE id = $1 AND is_active = true
        `;

        try {
            const result = await this.db.query(query, [guestId]);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Guest not found' };
            }

            const guest = result.rows[0];
            
            // Check if token has expired
            if (guest.expires_at && new Date() > new Date(guest.expires_at)) {
                return { success: false, error: 'Guest access has expired' };
            }

            return { success: true, guest };
        } catch (error) {
            console.error('❌ Failed to retrieve guest by ID from database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get all guests
    async getAllGuests() {
        const query = `
            SELECT id, token, guest_name, email, phone, permissions, 
                   max_guests, event_access, created_at, is_active, guest_side
            FROM invitations 
            ORDER BY created_at DESC
        `;

        try {
            const result = await this.db.query(query);
            return { success: true, guests: result.rows };
        } catch (error) {
            console.error('❌ Failed to retrieve guests from database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Update guest information
    async updateGuest(token, updateData) {
        const allowedFields = ['guest_name', 'email', 'phone', 'max_guests', 'event_access'];
        const updates = [];
        const values = [];
        let paramIndex = 1;

        // Build dynamic update query
        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return { success: false, error: 'No valid fields to update' };
        }

        const query = `
            UPDATE invitations 
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE token = $${paramIndex} AND is_active = true
            RETURNING id, token, guest_name, email, updated_at
        `;
        values.push(token);

        try {
            const result = await this.db.query(query, values);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Guest not found or inactive' };
            }

            // If max_guests was updated, also update existing RSVP submissions
            if (updateData.max_guests !== undefined) {
                const updateRSVPQuery = `
                    UPDATE rsvp_submissions
                    SET guest_count = $1
                    WHERE invitation_id = $2 AND attending = true
                `;
                await this.db.query(updateRSVPQuery, [updateData.max_guests, result.rows[0].id]);
            }

            return { success: true, guest: result.rows[0] };
        } catch (error) {
            console.error('❌ Failed to update guest in database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Deactivate guest (soft delete)
    async deactivateGuest(token) {
        const query = `
            UPDATE invitations 
            SET is_active = false, updated_at = NOW()
            WHERE token = $1
            RETURNING id, token, guest_name
        `;

        try {
            const result = await this.db.query(query, [token]);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'Guest not found' };
            }

            return { success: true, guest: result.rows[0] };
        } catch (error) {
            console.error('❌ Failed to deactivate guest in database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Completely delete guest (hard delete)
    async deleteGuest(token) {
        try {
            // Use transaction to ensure data consistency
            return await this.db.transaction(async (client) => {
                // First, delete any RSVPs associated with this guest
                const deleteRSVPsQuery = `
                    DELETE FROM rsvp_submissions 
                    WHERE invitation_id = (
                        SELECT id FROM invitations WHERE token = $1
                    )
                `;
                await client.query(deleteRSVPsQuery, [token]);

                // Delete access logs
                const deleteLogsQuery = `
                    DELETE FROM access_logs 
                    WHERE invitation_id = (
                        SELECT id FROM invitations WHERE token = $1
                    )
                `;
                await client.query(deleteLogsQuery, [token]);

                // Finally, delete the guest invitation
                const deleteGuestQuery = `
                    DELETE FROM invitations 
                    WHERE token = $1
                    RETURNING id, token, guest_name
                `;
                const result = await client.query(deleteGuestQuery, [token]);

                if (result.rows.length === 0) {
                    return { success: false, error: 'Guest not found' };
                }

                return { success: true, guest: result.rows[0] };
            });
        } catch (error) {
            console.error('❌ Failed to delete guest from database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Save RSVP submission
    async saveRSVP(rsvpData) {
        const query = `
            INSERT INTO rsvp_submissions (
                invitation_id, guest_name, email, phone, attending, 
                guest_count, meal_choices, dietary_restrictions, 
                song_requests, special_requests, confirmation_id,
                ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, confirmation_id, submitted_at
        `;

        const values = [
            rsvpData.invitation_id,
            rsvpData.guest_name,
            rsvpData.email,
            rsvpData.phone || null,
            rsvpData.attending,
            rsvpData.guest_count || 1,
            JSON.stringify(rsvpData.meal_choices || {}),
            rsvpData.dietary_restrictions || null,
            rsvpData.song_requests || null,
            rsvpData.special_requests || null,
            rsvpData.confirmation_id,
            rsvpData.ip_address || null,
            rsvpData.user_agent || null
        ];

        try {
            const result = await this.db.query(query, values);
            console.log('✅ RSVP saved to RDS database:', result.rows[0]);
            return { success: true, rsvp: result.rows[0] };
        } catch (error) {
            console.error('❌ Failed to save RSVP to database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get RSVP by confirmation ID
    async getRSVPByConfirmation(confirmationId) {
        const query = `
            SELECT r.*, i.guest_name as invitation_guest_name, i.token
            FROM rsvp_submissions r
            JOIN invitations i ON r.invitation_id = i.id
            WHERE r.confirmation_id = $1
        `;

        try {
            const result = await this.db.query(query, [confirmationId]);
            
            if (result.rows.length === 0) {
                return { success: false, error: 'RSVP not found' };
            }

            return { success: true, rsvp: result.rows[0] };
        } catch (error) {
            console.error('❌ Failed to retrieve RSVP from database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get all RSVPs
    async getAllRSVPs() {
        const query = `
            SELECT r.*, i.guest_name as invitation_guest_name, i.token, i.event_access, i.max_guests
            FROM rsvp_submissions r
            JOIN invitations i ON r.invitation_id = i.id
            ORDER BY r.submitted_at DESC
        `;

        try {
            const result = await this.db.query(query);
            return { success: true, rsvps: result.rows };
        } catch (error) {
            console.error('❌ Failed to retrieve RSVPs from database:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Submit RSVP to rsvp_submissions table
    async submitRSVP(data) {
        let confirmationId = `RSVP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        if (!confirmationId || confirmationId.length < 10) {
            confirmationId = `RSVP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        }
        
        // Get invitation_id from token
        const invQuery = `SELECT id FROM invitations WHERE token = $1`;
        const invResult = await this.db.query(invQuery, [data.token]);
        if (invResult.rows.length === 0) {
            return { success: false, error: 'Invalid token' };
        }
        const invitationId = invResult.rows[0].id;
        
        const query = `
            INSERT INTO rsvp_submissions (
                invitation_id, guest_name, email, attending, guest_count, confirmation_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, confirmation_id, submitted_at
        `;
        const values = [invitationId, data.guestName, 'no-email@guest.local', data.attending, data.guestCount, confirmationId];

        try {
            const result = await this.db.query(query, values);
            return { success: true, rsvp: result.rows[0] };
        } catch (error) {
            console.error('❌ Failed to submit RSVP:', error.message);
            if (error.code === '23505') {
                return { success: false, error: 'duplicate key violation - RSVP already exists' };
            }
            return { success: false, error: error.message };
        }
    }

    // Mark RSVP as submitted in invitations table
    async markRSVPSubmitted(token) {
        const query = `
            UPDATE invitations
            SET rsvp_submitted = true, rsvp_submitted_at = NOW()
            WHERE token = $1
        `;

        try {
            await this.db.query(query, [token]);
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to mark RSVP submitted:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Initialize database tables (run this once to set up the schema)
    async initializeTables() {
        const createInvitationsTable = `
            CREATE TABLE IF NOT EXISTS invitations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token VARCHAR(64) UNIQUE NOT NULL,
                guest_name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(20),
                permissions TEXT[] DEFAULT ARRAY['guest'],
                device_fingerprint VARCHAR(32),
                max_guests INTEGER DEFAULT 2,
                event_access TEXT[] DEFAULT ARRAY['wedding'],
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '6 months'),
                is_active BOOLEAN DEFAULT TRUE,
                first_access_at TIMESTAMP,
                first_access_ip VARCHAR(45),
                first_access_user_agent TEXT,
                access_count INTEGER DEFAULT 0,
                last_access_at TIMESTAMP,
                is_device_locked BOOLEAN DEFAULT FALSE,
                guest_side TEXT CHECK (guest_side IN ('bride','groom')),
                rsvp_submitted BOOLEAN DEFAULT FALSE,
                rsvp_submitted_at TIMESTAMP,
                whatsapp_opt_in BOOLEAN DEFAULT FALSE,
                whatsapp_opt_in_at TIMESTAMP,
                whatsapp_opt_in_meta JSONB,
                whatsapp_opt_out_at TIMESTAMP,
                whatsapp_opt_out_meta JSONB
            );
        `;

        const createRSVPTable = `
            CREATE TABLE IF NOT EXISTS rsvp_submissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                invitation_id UUID REFERENCES invitations(id),
                guest_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                attending BOOLEAN NOT NULL,
                guest_count INTEGER,
                meal_choices JSONB,
                dietary_restrictions TEXT,
                song_requests TEXT,
                special_requests TEXT,
                submitted_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                confirmation_id VARCHAR(50) UNIQUE NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT
            );
        `;

        const createAccessLogsTable = `
            CREATE TABLE IF NOT EXISTS access_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                invitation_id UUID REFERENCES invitations(id),
                access_time TIMESTAMP DEFAULT NOW(),
                ip_address VARCHAR(45),
                user_agent TEXT,
                device_fingerprint VARCHAR(32),
                access_granted BOOLEAN,
                denial_reason VARCHAR(255)
            );
        `;

        const createBlessingsTable = `
            CREATE TABLE IF NOT EXISTS blessings (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approved BOOLEAN DEFAULT FALSE,
                approved_at TIMESTAMP,
                approved_by VARCHAR(255),
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        const createBlessingsIndexes = `
            CREATE INDEX IF NOT EXISTS idx_blessings_approved ON blessings(approved, display_order);
            CREATE INDEX IF NOT EXISTS idx_blessings_submitted_at ON blessings(submitted_at DESC);
        `;

        const createWAQueueTable = `
            CREATE TABLE IF NOT EXISTS wa_message_queue (
                id SERIAL PRIMARY KEY,
                phone_e164 VARCHAR(20) NOT NULL,
                invitation_id UUID REFERENCES invitations(id),
                template_code VARCHAR(50) DEFAULT 'INVITE_V1',
                payload JSONB,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                sent_at TIMESTAMP,
                last_error TEXT
            );
        `;

        const createWAQueueIndexes = `
            CREATE INDEX IF NOT EXISTS idx_wa_queue_phone_status ON wa_message_queue(phone_e164, status);
            CREATE INDEX IF NOT EXISTS idx_wa_queue_status_created ON wa_message_queue(status, created_at);
        `;

        try {
            await this.db.query(createInvitationsTable);
            await this.db.query(createRSVPTable);
            await this.db.query(createAccessLogsTable);
            await this.db.query(createBlessingsTable);
            await this.db.query(createBlessingsIndexes);
            await this.db.query(createWAQueueTable);
            await this.db.query(createWAQueueIndexes);
            console.log('✅ Database tables initialized successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to initialize database tables:', error.message);
            return { success: false, error: error.message };
        }
    }

    // WhatsApp consent helpers (updated for queue pattern)
    async markWhatsappOptIn(e164Phone, meta = {}) {
        const p = this.normPhone(e164Phone);
        try {
            const query = `
                UPDATE invitations
                SET whatsapp_opt_in = true,
                    whatsapp_opt_in_at = NOW(),
                    whatsapp_opt_in_meta = COALESCE(whatsapp_opt_in_meta, '{}'::jsonb) || $2::jsonb,
                    updated_at = NOW()
                WHERE phone IN ($1, REPLACE($1, '+', ''))
                RETURNING id, guest_name, phone
            `;
            const result = await this.db.query(query, [p, JSON.stringify(meta)]);
            if (result.rows.length > 0) {
                console.log(`✅ WhatsApp opt-in recorded for ${p}`);
                return { success: true, guest: result.rows[0] };
            }
            return { success: false, error: 'Guest not found' };
        } catch (error) {
            console.error('❌ markWhatsappOptIn error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async markWhatsappOptOut(e164Phone, meta = {}) {
        const p = this.normPhone(e164Phone);
        try {
            const query = `
                UPDATE invitations
                SET whatsapp_opt_in = false,
                    whatsapp_opt_out_at = NOW(),
                    whatsapp_opt_out_meta = COALESCE(whatsapp_opt_out_meta, '{}'::jsonb) || $2::jsonb,
                    updated_at = NOW()
                WHERE phone IN ($1, REPLACE($1, '+', ''))
                RETURNING id, guest_name, phone
            `;
            const result = await this.db.query(query, [p, JSON.stringify(meta)]);
            if (result.rows.length > 0) {
                console.log(`✅ WhatsApp opt-out recorded for ${p}`);
                return { success: true, guest: result.rows[0] };
            }
            return { success: false, error: 'Guest not found' };
        } catch (error) {
            console.error('❌ markWhatsappOptOut error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async findGuestByPhone(e164Phone) {
        try {
            const query = `
                SELECT * FROM invitations
                WHERE phone IN ($1, REPLACE($1, '+', ''))
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            const result = await this.db.query(query, [e164Phone]);
            if (result.rows.length > 0) {
                return result.rows[0];
            }
            return null;
        } catch (error) {
            console.error('❌ findGuestByPhone error:', error.message);
            return null;
        }
    }

    // Queue-based WhatsApp helpers
    normPhone(phone) {
        const p = String(phone || '').trim();
        return p.startsWith('+') ? p : `+${p}`;
    }

    async enqueueInvite({ invitationId, phone, payload }) {
        const p = this.normPhone(phone);
        const query = `
            INSERT INTO wa_message_queue (phone_e164, invitation_id, template_code, payload)
            VALUES ($1, $2, 'INVITE_V1', $3::jsonb)
        `;
        await this.db.query(query, [p, invitationId || null, JSON.stringify(payload)]);
    }

    async getLastSendForTemplate(phone, templateCode) {
        const p = this.normPhone(phone);
        const query = `
            SELECT * FROM wa_message_queue
            WHERE phone_e164 = $1 AND template_code = $2 AND status = 'sent'
            ORDER BY sent_at DESC
            LIMIT 1
        `;
        const result = await this.db.query(query, [p, templateCode]);
        return result.rows[0] || null;
    }

    async getPendingForPhone(phone) {
        const p = this.normPhone(phone);
        const query = `
            SELECT * FROM wa_message_queue
            WHERE phone_e164 = $1 AND status = 'pending'
            ORDER BY id ASC
        `;
        const result = await this.db.query(query, [p]);
        return result.rows;
    }

    async markQueueSent(id) {
        const query = `
            UPDATE wa_message_queue
            SET status = 'sent', sent_at = NOW(), last_error = NULL
            WHERE id = $1
        `;
        await this.db.query(query, [id]);
    }

    async markQueueFailed(id, err) {
        const query = `
            UPDATE wa_message_queue
            SET status = 'failed', last_error = $2
            WHERE id = $1
        `;
        await this.db.query(query, [id, String(err).slice(0, 1000)]);
    }

    // Paginated invitations list
    async listInvitations({ limit, offset, orderBy }) {
        const query = `
            SELECT id, guest_name AS name, email, phone, guest_side AS type,
                   token AS "accessCode", COALESCE(whatsapp_opt_in, FALSE) AS whatsapp_opt_in
            FROM invitations
            ORDER BY ${orderBy}
            LIMIT $1 OFFSET $2
        `;
        const result = await this.db.query(query, [limit, offset]);
        return result.rows;
    }

    async countInvitations() {
        const result = await this.db.query('SELECT COUNT(*)::int AS n FROM invitations');
        return result.rows[0].n || 0;
    }

    // WhatsApp queue listing
    async listWAQueue({ status = 'pending' }) {
        const query = `
            SELECT q.id, q.phone_e164, q.status, q.created_at, q.last_error,
                   q.payload, i.guest_name AS name, i.token AS access_code
            FROM wa_message_queue q
            LEFT JOIN invitations i ON i.phone = REPLACE(q.phone_e164, '+', '')
               OR i.phone = q.phone_e164
            WHERE q.status = $1
            ORDER BY q.created_at ASC
            LIMIT 500
        `;
        const result = await this.db.query(query, [status]);
        return result.rows.map(r => ({
            id: r.id,
            phone_e164: r.phone_e164,
            status: r.status,
            created_at: r.created_at,
            last_error: r.last_error,
            payload: r.payload,
            name: r.name,
            access_code: r.access_code
        }));
    }
}

// Create singleton instances
const dbConnection = new DatabaseConnection();
const guestDB = new GuestDatabase(dbConnection);

module.exports = {
    DatabaseConnection,
    GuestDatabase,
    dbConnection,
    guestDB,
    // Queue helpers
    enqueueInvite: (args) => guestDB.enqueueInvite(args),
    markWhatsappOptIn: (phone, meta) => guestDB.markWhatsappOptIn(phone, meta),
    markWhatsappOptOut: (phone, meta) => guestDB.markWhatsappOptOut(phone, meta),
    getPendingForPhone: (phone) => guestDB.getPendingForPhone(phone),
    markQueueSent: (id) => guestDB.markQueueSent(id),
    markQueueFailed: (id, err) => guestDB.markQueueFailed(id, err),
    getLastSendForTemplate: (phone, code) => guestDB.getLastSendForTemplate(phone, code),
    // Pagination helpers
    listInvitations: (args) => guestDB.listInvitations(args),
    countInvitations: () => guestDB.countInvitations(),
    listWAQueue: (args) => guestDB.listWAQueue(args)
};
