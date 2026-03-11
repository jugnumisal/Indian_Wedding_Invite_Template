#!/usr/bin/env node

const http = require('http');
const url = require('url');
const { dbConnection, guestDB } = require('./database');
let ExcelExporter;
try {
    ExcelExporter = require('./excel-export').ExcelExporter;
} catch (e) {
    console.warn('⚠️ excel-export module not available');
}
require('dotenv').config();

class WeddingAPIServer {
    constructor() {
        this.port = process.env.PORT || 3001;
        this.dbInitialized = false;
    }

    // Initialize database connection
    async initializeDatabase() {
        if (!this.dbInitialized) {
            console.log('🔄 Initializing database connection...');
            const connected = await dbConnection.initialize();
            if (connected) {
                await guestDB.initializeTables();
                this.dbInitialized = true;
                console.log('✅ Database initialized successfully');
            } else {
                console.error('❌ Failed to initialize database');
            }
        }
        return this.dbInitialized;
    }

    // Handle CORS preflight requests
    handleCORS(req, res) {
        const origin = req.headers.origin;
        const allowedOrigins = [
            'https://www.yourdomain.com',
            'https://yourdomain.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'file://'
        ];

        // Set CORS origin (avoid duplicates by checking if already set)
        if (!res.headersSent && !res.getHeader('Access-Control-Allow-Origin')) {
            if (allowedOrigins.includes(origin) || origin?.startsWith('file://')) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            } else {
                res.setHeader('Access-Control-Allow-Origin', 'https://www.yourdomain.com');
            }
        }

        // Set other CORS headers only if not already set
        if (!res.getHeader('Access-Control-Allow-Methods')) {
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        }
        if (!res.getHeader('Access-Control-Allow-Headers')) {
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
        if (!res.getHeader('Access-Control-Allow-Credentials')) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        if (!res.getHeader('Access-Control-Max-Age')) {
            res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return true;
        }
        return false;
    }

    // Auth middleware - extract token from Bearer header
    extractToken(req) {
        const hdr = req.headers.authorization || '';
        return hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : null;
    }

    // Parse JSON body
    async parseBody(req) {
        // Handle Lambda requests
        if (req._isLambda) {
            try {
                const body = req._lambdaBody;
                return body ? JSON.parse(body) : {};
            } catch (error) {
                throw error;
            }
        }
        
        // Handle regular HTTP requests
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // Parse URL-encoded body (for Twilio webhooks)
    async parseUrlEncodedBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const params = new URLSearchParams(body);
                    const result = {};
                    for (const [key, value] of params) {
                        result[key] = value;
                    }
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // Send JSON response
    sendJSON(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    // Validate invitation token
    async validateToken(req, res) {
        try {
            const body = await this.parseBody(req);
            const { token } = body;

            if (!token) {
                return this.sendJSON(res, 400, { 
                    success: false, 
                    error: 'Token is required' 
                });
            }

            // admin is the only token that uses local authentication
            if (token === 'admin') {
                console.log('🔄 Using local authentication for admin');
                const fallbackResult = this.validateTokenFallback(token);
                
                if (fallbackResult.success) {
                    console.log(`✅ Admin token validated locally`);
                    return this.sendJSON(res, 200, fallbackResult);
                }
            }

            // All other tokens MUST authenticate through RDS database
            if (await this.initializeDatabase()) {
                try {
                    // Get guest by token from database
                    const result = await guestDB.getGuestByToken(token);

                    if (result.success) {
                        const guest = result.guest;
                        
                        // Convert database format to frontend format
                        const userData = {
                            token: guest.token,
                            guestId: guest.id,
                            guestName: guest.guest_name,
                            email: guest.email,
                            permissions: guest.permissions,
                            eventAccess: guest.event_access || [],
                            maxGuests: guest.max_guests,
                            side: guest.guest_side || 'guest',
                            canRSVP: !guest.rsvp_submitted,
                            rsvp_submitted: !!guest.rsvp_submitted
                        };

                        console.log(`✅ Token validated from RDS database for: ${guest.guest_name}`);
                        return this.sendJSON(res, 200, { 
                            success: true, 
                            user: userData 
                        });
                    } else {
                        console.log(`❌ Token not found in RDS database: ${token}`);
                        return this.sendJSON(res, 401, { 
                            success: false, 
                            error: 'Invalid invitation token' 
                        });
                    }
                } catch (dbError) {
                    console.error('❌ Database query failed:', dbError.message);
                    return this.sendJSON(res, 500, { 
                        success: false, 
                        error: 'Authentication service unavailable. Please try again later.' 
                    });
                }
            } else {
                console.error('❌ Database connection failed');
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: 'Authentication service unavailable. Please try again later.' 
                });
            }

        } catch (error) {
            console.error('❌ Error validating token:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Local token validation (admin only)
    validateTokenFallback(token) {
        // Only admin is allowed for local authentication
        if (token === 'admin') {
            return {
                success: true,
                user: {
                    token: 'admin',
                    guestId: 'admin-1',
                    guestName: 'Wedding Admin',
                    email: 'admin@wedding.com',
                    permissions: ['guest', 'family', 'friends', 'admin'],
                    side: 'admin',
                    familyGroup: null,
                    maxGuests: 10,
                    canRSVP: false,
                    rsvp_submitted: false
                }
            };
        }

        return { 
            success: false, 
            error: 'Invalid invitation token' 
        };
    }

    // Submit RSVP
    async submitRSVP(req, res) {
        try {
            const body = await this.parseBody(req) || {};
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

            let token = body.token || bearerToken;
            if (!token) {
                return this.sendJSON(res, 400, { success: false, error: 'Missing token' });
            }

            // New minimal fields from floating modal
            const hasMinimal = typeof body.attending !== 'undefined' || typeof body.guestCount !== 'undefined';
            let {
                guestName, email, phone, attending, guestCount, dietaryRestrictions,
                songRequest, specialRequests, mealChoices
            } = body;

            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            // Look up invitation by token
            const inviteResult = await guestDB.getGuestByToken(token);
            if (!inviteResult.success || !inviteResult.guest) {
                return this.sendJSON(res, 401, { success: false, error: 'Invalid or expired token' });
            }
            const inv = inviteResult.guest;

            // If minimal flow, derive the rest
            if (hasMinimal) {
                guestName = guestName || inv.guest_name;
                email = email || inv.email || 'no-email@guest.local';
                phone = phone || null;
                attending = (attending === true || attending === 'yes' || attending === 'true');
                guestCount = attending ? parseInt(guestCount || 1, 10) : 0;
                dietaryRestrictions = dietaryRestrictions || '';
                songRequest = songRequest || '';
                specialRequests = specialRequests || '';
                mealChoices = mealChoices || {};
            }

            // Validate minimal requirements
            if (typeof attending === 'undefined') {
                return this.sendJSON(res, 400, { success: false, error: 'attending is required' });
            }
            if (attending && (!guestCount || guestCount < 1)) {
                return this.sendJSON(res, 400, { success: false, error: 'guestCount must be >= 1 when attending' });
            }
            if (attending && guestCount > (inv.max_guests || 1)) {
                return this.sendJSON(res, 400, { success: false, error: 'guestCount exceeds your allowed maximum' });
            }

            // One-time enforcement
            if (inv.rsvp_submitted) {
                return this.sendJSON(res, 409, { success: false, error: 'RSVP already submitted for this invitation' });
            }

            // Persist RSVP
            const saveResult = await guestDB.saveRSVP({
                token,
                guest_name: guestName,
                email,
                phone,
                attending,
                guest_count: attending ? guestCount : 0,
                dietary_restrictions: dietaryRestrictions,
                song_request: songRequest,
                special_requests: specialRequests,
                meal_choices: mealChoices,
                guest_side: inv.guest_side || 'guest'
            });

            if (!saveResult.success) {
                return this.sendJSON(res, 500, { success: false, error: saveResult.error || 'Failed to save RSVP' });
            }

            // Mark invitation as submitted (prevents re-RSVP)
            await guestDB.markRSVPSubmitted(token);

            return this.sendJSON(res, 200, {
                success: true,
                message: attending
                    ? `Thanks ${guestName}! We look forward to celebrating with you.`
                    : `Thanks ${guestName}! We're sad you can't make it — the home page will have a livestream link.`,
                confirmationId: saveResult.confirmationId || null
            });
        } catch (err) {
            console.error('submitRSVP error', err);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Get all RSVPs (admin only)
    async getAllRSVPs(req, res) {
        try {
            // Simple admin check - in production, implement proper authentication
            const authHeader = req.headers.authorization;
            if (!authHeader || authHeader !== 'Bearer admin') {
                return this.sendJSON(res, 401, { 
                    success: false, 
                    error: 'Unauthorized' 
                });
            }

            // Ensure database is initialized
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: 'Database connection failed' 
                });
            }

            const result = await guestDB.getAllRSVPs();

            if (result.success) {
                return this.sendJSON(res, 200, { 
                    success: true, 
                    rsvps: result.rsvps 
                });
            } else {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: result.error || 'Failed to retrieve RSVPs' 
                });
            }
        } catch (error) {
            console.error('❌ Error retrieving RSVPs:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Export RSVPs as Excel
    async exportRSVPsExcel(req, res) {
        try {
            // Simple admin check
            const token = this.extractToken(req);
            if (token !== 'admin') {
                return this.sendJSON(res, 403, { success: false, error: 'Forbidden' });
            }

            // Check if ExcelExporter is available
            if (!ExcelExporter) {
                return this.sendJSON(res, 503, { success: false, error: 'Excel export not available in this environment' });
            }

            // Build workbook
            const exporter = new ExcelExporter();
            await exporter.exportRSVPs();
            const buffer = await exporter.getBuffer();

            const date = new Date().toISOString().split('T')[0];
            res.writeHead(200, {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="wedding-rsvps-${date}.xlsx"`,
                'Cache-Control': 'no-store'
            });
            res.end(buffer);
        } catch (err) {
            console.error('❌ RSVP export failed:', err.message);
            return this.sendJSON(res, 500, { success: false, error: 'Export failed' });
        }
    }

    // Check admin authentication
    checkAdminAuth(req) {
        const authHeader = req.headers.authorization;
        return authHeader === 'Bearer admin';
    }

    // Add guest (admin only)
    async addGuest(req, res) {
        try {
            // Check admin authentication
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { 
                    success: false, 
                    error: 'Unauthorized - Admin access required' 
                });
            }

            const body = await this.parseBody(req);
            const { 
                accessCode, 
                name, 
                email, 
                phone, 
                eventAccess,
                maxGuests, 
                permissions,
                deviceFingerprint,
                sendInvitations,
                guestSide
            } = body;
            
            // Basic sanitize to known values or null
            const normalizedSide = (guestSide === 'bride' || guestSide === 'groom') ? guestSide : null;

            if (!accessCode || !name || !eventAccess || eventAccess.length === 0) {
                return this.sendJSON(res, 400, { 
                    success: false, 
                    error: 'Access code, name, and at least one event are required' 
                });
            }

            // Ensure database is initialized
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: 'Database connection failed' 
                });
            }

            // Prepare guest data for database
            const guestData = {
                accessCode: accessCode,
                name: name,
                email: email || null,
                phone: phone || null,
                permissions: permissions || ['guest'],
                deviceFingerprint: deviceFingerprint || null,
                maxGuests: maxGuests || 2,
                eventAccess: Array.isArray(eventAccess) ? eventAccess : [eventAccess],
                createdAt: new Date().toISOString(),
                guestSide: normalizedSide
            };

            // Add guest to database
            const result = await guestDB.createGuest(guestData);

            if (result.success) {
                console.log(`✅ Guest added to database: ${name} (${accessCode})`);
                
                // Send invitations synchronously
                const invitationResults = { email: false, whatsapp: false };
                
                if (sendInvitations) {
                    console.log(`📤 Sending invitations for ${name}...`);
                    const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
                    const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
                    
                    if (email) {
                        try {
                            const result = await lambda.send(new InvokeCommand({
                                FunctionName: 'your-email-sender-function',
                                Payload: JSON.stringify({
                                    guestData: { name, email, accessCode, guestSide: normalizedSide, eventAccess: Array.isArray(eventAccess) ? eventAccess : [eventAccess] }
                                })
                            }));
                            const response = JSON.parse(new TextDecoder().decode(result.Payload));
                            invitationResults.email = response.statusCode === 200;
                            console.log(`${invitationResults.email ? '✅' : '❌'} Email: ${invitationResults.email ? 'sent' : 'failed'}`);
                        } catch (e) { 
                            console.log(`❌ Email error: ${e.message}`);
                            invitationResults.email = false;
                        }
                    }
                    
                    if (phone) {
                        try {
                            const { enqueueInvite } = require('./database');
                            let e164 = phone.startsWith('+') ? phone : `+${phone}`;
                            await enqueueInvite({
                                invitationId: result.guest.id,
                                phone: e164,
                                payload: { name, accessCode, phone: e164 }
                            });
                            invitationResults.whatsapp = 'queued';
                            console.log(`📦 WhatsApp queued for ${phone}`);
                        } catch (e) { 
                            console.log(`❌ WhatsApp queue error: ${e.message}`);
                            invitationResults.whatsapp = false;
                        }
                    }
                }
                
                return this.sendJSON(res, 201, { 
                    success: true, 
                    guest: result.guest,
                    invitationsSent: invitationResults,
                    message: 'Guest added successfully' 
                });
            } else {
                return this.sendJSON(res, 400, { 
                    success: false, 
                    error: result.error || 'Failed to add guest' 
                });
            }
        } catch (error) {
            console.error('❌ Error adding guest:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Get WhatsApp queue (admin only)
    async getWAQueue(req, res) {
        if (!this.checkAdminAuth(req)) {
            return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
        }
        if (!await this.initializeDatabase()) {
            return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
        }
        try {
            const parsedUrl = url.parse(req.url, true);
            const status = parsedUrl.query.status || 'pending';
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
            const result = await dbConnection.query(query, [status]);
            return this.sendJSON(res, 200, { items: result.rows });
        } catch (error) {
            console.error('❌ Error fetching queue:', error.message);
            return this.sendJSON(res, 500, { success: false, error: error.message });
        }
    }

    // Get paginated invitations (admin only)
    async getPaginatedInvitations(req, res) {
        if (!this.checkAdminAuth(req)) {
            return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
        }
        if (!await this.initializeDatabase()) {
            return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
        }
        try {
            const parsedUrl = url.parse(req.url, true);
            const limit = Math.max(1, Math.min(500, parseInt(parsedUrl.query.limit, 10) || 25));
            const page = Math.max(1, parseInt(parsedUrl.query.page, 10) || 1);
            const sort = (parsedUrl.query.sort || 'name_asc').toLowerCase();
            
            let orderBy = 'guest_name ASC';
            if (sort === 'name_desc') orderBy = 'guest_name DESC';
            
            const offset = (page - 1) * limit;
            
            const [itemsResult, countResult] = await Promise.all([
                dbConnection.query(`
                    SELECT id, guest_name AS name, email, phone, guest_side AS type,
                           token AS "accessCode", COALESCE(whatsapp_opt_in, FALSE) AS whatsapp_opt_in,
                           event_access AS "eventAccess", max_guests AS "maxGuests"
                    FROM invitations
                    ORDER BY ${orderBy}
                    LIMIT $1 OFFSET $2
                `, [limit, offset]),
                dbConnection.query('SELECT COUNT(*)::int AS total FROM invitations')
            ]);
            
            return this.sendJSON(res, 200, {
                items: itemsResult.rows,
                total: countResult.rows[0].total || 0,
                page,
                limit
            });
        } catch (error) {
            console.error('❌ Error fetching paginated invitations:', error.message);
            return this.sendJSON(res, 500, { success: false, error: error.message });
        }
    }

    // Get all guests (admin only)
    async getAllGuests(req, res) {
        try {
            // Check admin authentication
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { 
                    success: false, 
                    error: 'Unauthorized - Admin access required' 
                });
            }

            // Ensure database is initialized
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: 'Database connection failed' 
                });
            }

            const result = await guestDB.getAllGuests();

            if (result.success) {
                return this.sendJSON(res, 200, { 
                    success: true, 
                    guests: result.guests 
                });
            } else {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: result.error || 'Failed to retrieve guests' 
                });
            }
        } catch (error) {
            console.error('❌ Error retrieving guests:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Update guest (admin only)
    async updateGuest(req, res, token) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!token) {
                return this.sendJSON(res, 400, { success: false, error: 'Token is required' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const body = await this.parseBody(req);
            const { name, email, phone, maxGuests, eventAccess } = body;

            if (!name || !eventAccess || eventAccess.length === 0) {
                return this.sendJSON(res, 400, { success: false, error: 'Name and at least one event required' });
            }

            const query = `
                UPDATE invitations
                SET guest_name = $1, email = $2, phone = $3, max_guests = $4, event_access = $5, updated_at = NOW()
                WHERE token = $6
                RETURNING id, token, guest_name, email, phone, max_guests, event_access
            `;
            const result = await dbConnection.query(query, [name, email, phone, maxGuests, eventAccess, token]);

            if (result.rows.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Guest not found' });
            }

            console.log(`✅ Guest updated: ${token}`);
            return this.sendJSON(res, 200, { success: true, guest: result.rows[0], message: 'Guest updated successfully' });
        } catch (error) {
            console.error('❌ Error updating guest:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Delete guest (admin only)
    async deleteGuest(req, res, token) {
        try {
            // Check admin authentication
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { 
                    success: false, 
                    error: 'Unauthorized - Admin access required' 
                });
            }

            if (!token) {
                return this.sendJSON(res, 400, { 
                    success: false, 
                    error: 'Token is required' 
                });
            }

            // Ensure database is initialized
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: 'Database connection failed' 
                });
            }

            const result = await guestDB.deleteGuest(token);

            if (result.success) {
                console.log(`✅ Guest completely deleted: ${token}`);
                return this.sendJSON(res, 200, { 
                    success: true, 
                    message: 'Guest deleted successfully' 
                });
            } else {
                return this.sendJSON(res, 404, { 
                    success: false, 
                    error: result.error || 'Guest not found' 
                });
            }
        } catch (error) {
            console.error('❌ Error deleting guest:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Send invites for new guest (admin only)
    async sendInvites(req, res) {
        try {
            // Check admin authentication
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { 
                    success: false, 
                    error: 'Unauthorized - Admin access required' 
                });
            }

            const body = await this.parseBody(req);
            const { accessCode, name, email, phone, eventAccess, guestSide } = body;

            if (!accessCode || !name) {
                return this.sendJSON(res, 400, { 
                    success: false, 
                    error: 'Access code and name are required' 
                });
            }

            const guestData = {
                accessCode: accessCode,
                name: name,
                email: email,
                phone: phone,
                eventAccess: eventAccess || ['wedding'],
                guestSide: guestSide || null
            };

            // Send invitations
            const invitationResults = { email: false, whatsapp: false };

            // Initialize invitation services
            const { AWSEmailService } = require('./aws-services');
            const WhatsAppService = require('./whatsapp-service');
            
            const emailService = new AWSEmailService();
            const whatsappService = new WhatsAppService();
            
            // Send email invitation if email provided
            if (email) {
                try {
                    const emailResult = await emailService.sendInvitationEmail(guestData);
                    invitationResults.email = emailResult.success;
                    if (emailResult.success) {
                        console.log(`✅ Email invitation sent to ${email}`);
                    } else {
                        console.log(`❌ Email invitation failed: ${emailResult.error}`);
                    }
                } catch (error) {
                    console.log(`❌ Email invitation error: ${error.message}`);
                }
            }
            
            // Send WhatsApp invitation if phone provided
            if (phone) {
                try {
                    const whatsappResult = await whatsappService.sendWeddingInvitation(guestData);
                    invitationResults.whatsapp = whatsappResult.success;
                    if (whatsappResult.success) {
                        console.log(`✅ WhatsApp invitation sent to ${phone}`);
                    } else {
                        console.log(`❌ WhatsApp invitation failed: ${whatsappResult.error}`);
                    }
                } catch (error) {
                    console.log(`❌ WhatsApp invitation error: ${error.message}`);
                }
            }

            let message = 'Invitations sent: ';
            if (invitationResults.email) message += 'Email ✅ ';
            if (invitationResults.whatsapp) message += 'WhatsApp ✅';
            if (!invitationResults.email && !invitationResults.whatsapp) {
                message = 'No invitations sent (no email/phone provided)';
            }

            return this.sendJSON(res, 200, { 
                success: true, 
                invitationsSent: invitationResults,
                message: message
            });

        } catch (error) {
            console.error('❌ Error sending invites:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }



    // Resend invitation (admin only) - matches npm start logic
    async resendInvitation(req, res, token) {
        try {
            // Check admin authentication
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { 
                    success: false, 
                    error: 'Unauthorized - Admin access required' 
                });
            }

            if (!token) {
                return this.sendJSON(res, 400, { 
                    success: false, 
                    error: 'Token is required' 
                });
            }

            // Ensure database is initialized
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { 
                    success: false, 
                    error: 'Database connection failed' 
                });
            }

            // Get guest information from database
            const guestResult = await guestDB.getGuestByToken(token);
            if (!guestResult.success) {
                return this.sendJSON(res, 404, { 
                    success: false, 
                    error: 'Guest not found' 
                });
            }

            const guest = guestResult.guest;
            
            // Convert to npm start format
            const guestData = {
                accessCode: guest.token,
                name: guest.guest_name,
                email: guest.email,
                phone: guest.phone,
                eventAccess: guest.event_access || [],
                maxGuests: guest.max_guests,
                guestSide: guest.guest_side
            };

            console.log(`📤 Resending invitation to ${guest.guest_name}...`);

            const invitationResults = { email: false, whatsapp: false };
            const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
            
            if (guestData.email) {
                try {
                    const result = await lambda.send(new InvokeCommand({
                        FunctionName: 'your-email-sender-function',
                        Payload: JSON.stringify({
                            guestData: {
                                name: guestData.name,
                                email: guestData.email,
                                accessCode: guestData.accessCode,
                                guestSide: guestData.guestSide,
                                eventAccess: guestData.eventAccess
                            }
                        })
                    }));
                    const response = JSON.parse(new TextDecoder().decode(result.Payload));
                    invitationResults.email = response.statusCode === 200;
                    console.log(`${invitationResults.email ? '✅' : '❌'} Email: ${invitationResults.email ? 'sent' : 'failed'}`);
                } catch (e) { 
                    console.log(`❌ Email error: ${e.message}`);
                    invitationResults.email = false;
                }
            }
            
            if (guestData.phone) {
                try {
                    const result = await lambda.send(new InvokeCommand({
                        FunctionName: 'your-whatsapp-sender-function',
                        Payload: JSON.stringify({
                            guestData: {
                                name: guestData.name,
                                phone: guestData.phone,
                                accessCode: guestData.accessCode
                            }
                        })
                    }));
                    const response = JSON.parse(new TextDecoder().decode(result.Payload));
                    invitationResults.whatsapp = response.statusCode === 200;
                    console.log(`${invitationResults.whatsapp ? '✅' : '❌'} WhatsApp: ${invitationResults.whatsapp ? 'sent' : 'failed'}`);
                } catch (e) { 
                    console.log(`❌ WhatsApp error: ${e.message}`);
                    invitationResults.whatsapp = false;
                }
            }

            let message = 'Invitation resent: ';
            if (invitationResults.email) message += 'Email ✅ ';
            if (invitationResults.whatsapp) message += 'WhatsApp ✅';
            if (!invitationResults.email && !invitationResults.whatsapp) {
                message = 'Failed to send invitations';
            }

            return this.sendJSON(res, 200, { 
                success: true,
                invitationsSent: invitationResults,
                message: message
            });

        } catch (error) {
            console.error('❌ Error resending invitation:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Bulk add guests from Excel (admin only)
    async bulkAddGuests(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }

            const body = await this.parseBody(req);
            const { fileData, guests } = body;

            let guestList = [];

            // Parse Excel file if provided
            if (fileData) {
                try {
                    const XLSX = require('xlsx');
                    const buffer = Buffer.from(fileData, 'base64');
                    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: false, cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
                    console.log('📋 Excel columns:', rows.length > 0 ? Object.keys(rows[0]) : 'No data');
                    console.log('📋 Sample row:', rows.length > 0 ? JSON.stringify(rows[0]) : 'No data');

                    guestList = rows.map(row => {
                        let phone = row["phone with '+' Country code"] || row.phone || row.Phone || null;
                        if (phone) {
                            phone = String(phone).trim().replace(/\s+/g, '');
                            if (phone && !phone.startsWith('+')) phone = '+' + phone;
                        }
                        return {
                            name: (row.name || row.Name || '').trim(),
                            email: (row.email || row.Email || '').trim() || null,
                            phone: phone,
                            maxGuests: parseInt(row.maxGuests || row.MaxGuests || 2),
                            eventAccess: (row.eventAccess || row.EventAccess || 'wedding').toString().split(',').map(e => e.trim()),
                            guestSide: (row.guestSide || row.GuestSide || '').trim() || null
                        };
                    });
                    console.log(`📊 Parsed ${guestList.length} guests from Excel`);
                } catch (e) {
                    console.error('Excel parse error:', e);
                    return this.sendJSON(res, 400, { success: false, error: `Excel parse error: ${e.message}` });
                }
            } else if (guests && Array.isArray(guests)) {
                guestList = guests;
            } else {
                return this.sendJSON(res, 400, { success: false, error: 'fileData or guests array required' });
            }

            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            let addedCount = 0;
            const errors = [];
            const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

            for (const guest of guestList) {
                try {
                    const accessCode = this.generateAccessCode();
                    const normalizedSide = (guest.guestSide === 'bride' || guest.guestSide === 'groom') ? guest.guestSide : null;
                    
                    const guestData = {
                        accessCode,
                        name: guest.name,
                        email: guest.email || null,
                        phone: guest.phone || null,
                        permissions: ['guest'],
                        deviceFingerprint: null,
                        maxGuests: guest.maxGuests || 2,
                        eventAccess: guest.eventAccess || ['wedding'],
                        createdAt: new Date().toISOString(),
                        guestSide: normalizedSide
                    };

                    const result = await guestDB.createGuest(guestData);
                    
                    if (result.success) {
                        addedCount++;
                        console.log(`✅ Bulk added: ${guest.name} (${accessCode})`);

                        // Send invitations
                        if (guest.email) {
                            try {
                                await lambda.send(new InvokeCommand({
                                    FunctionName: 'your-email-sender-function',
                                    Payload: JSON.stringify({ guestData: { name: guest.name, email: guest.email, accessCode, guestSide: normalizedSide, eventAccess: guestData.eventAccess } })
                                }));
                                console.log(`📧 Email sent to ${guest.email}`);
                            } catch (e) { console.log(`❌ Email error: ${e.message}`); }
                        }
                        
                        if (guest.phone) {
                            try {
                                const { enqueueInvite } = require('./database');
                                let e164 = guest.phone.startsWith('+') ? guest.phone : `+${guest.phone}`;
                                await enqueueInvite({ invitationId: result.guest.id, phone: e164, payload: { name: guest.name, accessCode, phone: e164 } });
                                console.log(`📦 WhatsApp queued for ${guest.phone}`);
                            } catch (e) { console.log(`❌ WhatsApp queue error: ${e.message}`); }
                        }
                    } else {
                        errors.push(`${guest.name}: ${result.error}`);
                    }
                } catch (error) {
                    errors.push(`${guest.name}: ${error.message}`);
                }
            }

            return this.sendJSON(res, 200, { 
                success: true, 
                added: addedCount,
                total: guestList.length,
                errors: errors.length > 0 ? errors : null,
                message: `Added ${addedCount}/${guestList.length} guests`
            });
        } catch (error) {
            console.error('❌ Bulk add error:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // GET /rsvp/status - Check if guest can submit RSVP
    async getRSVPStatus(req, res) {
        const token = this.extractToken(req);
        if (!token) return this.sendJSON(res, 401, { error: 'Missing token' });

        if (!await this.initializeDatabase()) {
            return this.sendJSON(res, 500, { error: 'Database connection failed' });
        }

        const g = await guestDB.getGuestByToken(token);
        if (!g.success || !g.guest) return this.sendJSON(res, 404, { error: 'Guest not found' });

        const guest = g.guest;
        return this.sendJSON(res, 200, {
            canRSVP: !guest.rsvp_submitted,
            rsvpSubmitted: !!guest.rsvp_submitted,
            maxGuests: guest.max_guests || 1,
            side: guest.guest_side || 'guest'
        });
    }

    // POST /rsvp/submit - Submit RSVP to partitioned table
    async submitRSVPPartitioned(req, res) {
        try {
            const token = this.extractToken(req);
            if (!token) return this.sendJSON(res, 401, { error: 'Missing token' });

            const body = await this.parseBody(req);
            const { attending, guestCount } = body;

            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { error: 'Database connection failed' });
            }

            const g = await guestDB.getGuestByToken(token);
            if (!g.success || !g.guest) return this.sendJSON(res, 404, { error: 'Guest not found' });

            const guest = g.guest;
            if (guest.rsvp_submitted) {
                return this.sendJSON(res, 409, { error: 'RSVP already submitted for this code' });
            }

            const maxGuests = guest.max_guests || 1;
            if (attending) {
                if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > maxGuests) {
                    return this.sendJSON(res, 400, { error: `guestCount must be between 1 and ${maxGuests}` });
                }
            }

            const side = (guest.guest_side || '').toLowerCase() === 'bride' ? 'bride' : 'groom';
            const count = attending ? guestCount : 0;

            const rsvp = await guestDB.submitRSVP({
                token,
                guestName: guest.guest_name,
                side,
                attending: !!attending,
                guestCount: count
            });
            if (!rsvp.success) {
                if (rsvp.error && rsvp.error.includes('duplicate') || rsvp.error && rsvp.error.includes('unique')) {
                    return this.sendJSON(res, 409, { error: 'RSVP already submitted for this invitation' });
                }
                return this.sendJSON(res, 500, { error: rsvp.error || 'Insert failed' });
            }

            await guestDB.markRSVPSubmitted(token);

            return this.sendJSON(res, 200, {
                success: true,
                confirmationId: rsvp.rsvp.confirmation_id,
                attending: !!attending,
                guestCount: count,
                message: attending
                    ? "We're so excited to see you at the wedding!"
                    : "We're sad you can't make it — you can watch the live telecast on the home page during the event."
            });
        } catch (e) {
            console.error(e);
            if (e.code === '23505') {
                return this.sendJSON(res, 409, { error: 'RSVP already submitted for this invitation' });
            }
            return this.sendJSON(res, 500, { error: 'Unexpected error' });
        }
    }

    // Bulk fix events from CSV data
    async bulkFixEvents(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            
            const body = await this.parseBody(req);
            const { guestEvents } = body; // { "Guest Name": ["haldi", "sangeet", "wedding"] }
            
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }
            
            let fixed = 0;
            const changes = [];
            
            for (const [name, events] of Object.entries(guestEvents)) {
                try {
                    const result = await dbConnection.query(
                        'UPDATE invitations SET event_access = $1, updated_at = NOW() WHERE LOWER(guest_name) = LOWER($2) RETURNING guest_name, token, event_access',
                        [events, name]
                    );
                    if (result.rows.length > 0) {
                        fixed++;
                        changes.push({ name: result.rows[0].guest_name, token: result.rows[0].token, events });
                    }
                } catch (error) {
                    console.error(`Error updating ${name}:`, error.message);
                }
            }
            
            return this.sendJSON(res, 200, { success: true, fixed, total: Object.keys(guestEvents).length, changes });
        } catch (error) {
            console.error('Bulk fix error:', error);
            return this.sendJSON(res, 500, { success: false, error: error.message });
        }
    }

    // Bulk resend WhatsApp to all guests
    async bulkResendWhatsApp(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const result = await dbConnection.query('SELECT id, guest_name, phone, token, event_access, guest_side FROM invitations WHERE phone IS NOT NULL AND phone != \'\'');
            const guests = result.rows;
            
            const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
            
            let sent = 0;
            for (const guest of guests) {
                try {
                    await lambda.send(new InvokeCommand({
                        FunctionName: 'your-whatsapp-sender-function',
                        Payload: JSON.stringify({
                            guestData: {
                                name: guest.guest_name,
                                phone: guest.phone,
                                accessCode: guest.token
                            }
                        })
                    }));
                    sent++;
                    console.log(`📱 WhatsApp sent to ${guest.guest_name}`);
                } catch (e) {
                    console.error(`❌ WhatsApp failed for ${guest.guest_name}:`, e.message);
                }
            }
            
            return this.sendJSON(res, 200, { success: true, sent, total: guests.length });
        } catch (error) {
            console.error('Bulk WhatsApp error:', error);
            return this.sendJSON(res, 500, { success: false, error: error.message });
        }
    }

    // Bulk resend email to all guests
    async bulkResendEmail(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const result = await dbConnection.query('SELECT id, guest_name, email, token, event_access, guest_side FROM invitations WHERE email IS NOT NULL AND email != \'\'');
            const guests = result.rows;
            
            const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
            
            let sent = 0;
            for (const guest of guests) {
                try {
                    await lambda.send(new InvokeCommand({
                        FunctionName: 'your-email-sender-function',
                        Payload: JSON.stringify({
                            guestData: {
                                name: guest.guest_name,
                                email: guest.email,
                                accessCode: guest.token,
                                guestSide: guest.guest_side,
                                eventAccess: guest.event_access
                            }
                        })
                    }));
                    sent++;
                    console.log(`📧 Email sent to ${guest.guest_name}`);
                } catch (e) {
                    console.error(`❌ Email failed for ${guest.guest_name}:`, e.message);
                }
            }
            
            return this.sendJSON(res, 200, { success: true, sent, total: guests.length });
        } catch (error) {
            console.error('Bulk email error:', error);
            return this.sendJSON(res, 500, { success: false, error: error.message });
        }
    }

    // Resend email only to specific guest
    async resendEmailOnly(req, res, token) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const guestResult = await guestDB.getGuestByToken(token);
            if (!guestResult.success) {
                return this.sendJSON(res, 404, { success: false, error: 'Guest not found' });
            }

            const guest = guestResult.guest;
            if (!guest.email) {
                return this.sendJSON(res, 400, { success: false, error: 'Guest has no email' });
            }

            const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
            
            try {
                const result = await lambda.send(new InvokeCommand({
                    FunctionName: 'your-email-sender-function',
                    Payload: JSON.stringify({
                        guestData: {
                            name: guest.guest_name,
                            email: guest.email,
                            accessCode: guest.token,
                            guestSide: guest.guest_side,
                            eventAccess: guest.event_access
                        }
                    })
                }));
                const response = JSON.parse(new TextDecoder().decode(result.Payload));
                if (response.statusCode === 200) {
                    console.log(`✅ Email sent to ${guest.guest_name}`);
                    return this.sendJSON(res, 200, { success: true, message: 'Email sent successfully' });
                } else {
                    return this.sendJSON(res, 500, { success: false, error: 'Failed to send email' });
                }
            } catch (e) {
                console.error(`❌ Email error:`, e.message);
                return this.sendJSON(res, 500, { success: false, error: e.message });
            }
        } catch (error) {
            console.error('❌ Error resending email:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Resend WhatsApp only to specific guest
    async resendWhatsAppOnly(req, res, token) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const guestResult = await guestDB.getGuestByToken(token);
            if (!guestResult.success) {
                return this.sendJSON(res, 404, { success: false, error: 'Guest not found' });
            }

            const guest = guestResult.guest;
            if (!guest.phone) {
                return this.sendJSON(res, 400, { success: false, error: 'Guest has no phone' });
            }

            const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
            const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
            
            try {
                const result = await lambda.send(new InvokeCommand({
                    FunctionName: 'your-whatsapp-sender-function',
                    Payload: JSON.stringify({
                        guestData: {
                            name: guest.guest_name,
                            phone: guest.phone,
                            accessCode: guest.token
                        }
                    })
                }));
                const response = JSON.parse(new TextDecoder().decode(result.Payload));
                if (response.statusCode === 200) {
                    console.log(`✅ WhatsApp sent to ${guest.guest_name}`);
                    return this.sendJSON(res, 200, { success: true, message: 'WhatsApp sent successfully' });
                } else {
                    return this.sendJSON(res, 500, { success: false, error: 'Failed to send WhatsApp' });
                }
            } catch (e) {
                console.error(`❌ WhatsApp error:`, e.message);
                return this.sendJSON(res, 500, { success: false, error: e.message });
            }
        } catch (error) {
            console.error('❌ Error resending WhatsApp:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Mark guest as WhatsApp opted-in
    async markGuestOptIn(req, res, token) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const query = 'UPDATE invitations SET whatsapp_opt_in = TRUE, updated_at = NOW() WHERE token = $1 RETURNING token';
            const result = await dbConnection.query(query, [token]);

            if (result.rows.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Guest not found' });
            }

            console.log(`✅ Guest ${token} marked as opted-in`);
            return this.sendJSON(res, 200, { success: true, message: 'Guest marked as opted-in' });
        } catch (error) {
            console.error('❌ Error marking opt-in:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Generate access code
    generateAccessCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // ========== BLESSING ENDPOINTS ==========

    // Get pending blessings (admin only)
    async getBlessings(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            // First ensure blessings table exists
            await this.ensureBlessingsTable();

            const query = `
                SELECT id, name, message, email, phone, submitted_at
                FROM blessings
                WHERE approved = false
                ORDER BY submitted_at DESC
            `;
            const result = await dbConnection.query(query);
            return this.sendJSON(res, 200, result.rows);
        } catch (error) {
            console.error('❌ Error fetching pending blessings:', error.message);
            if (error.message.includes('relation "blessings" does not exist')) {
                return this.sendJSON(res, 500, { success: false, error: 'Blessings table not found. Please contact administrator.' });
            }
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Get approved blessings
    async getApprovedBlessings(req, res) {
        try {
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const query = `
                SELECT id, name, message, email, phone, approved_at, display_order
                FROM blessings
                WHERE approved = true
                ORDER BY display_order ASC, approved_at DESC
            `;
            const result = await dbConnection.query(query);
            return this.sendJSON(res, 200, result.rows);
        } catch (error) {
            console.error('❌ Error fetching approved blessings:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Approve blessing (admin only)
    async approveBlessing(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const body = await this.parseBody(req);
            const { blessingId, displayOrder } = body;

            if (!blessingId) {
                return this.sendJSON(res, 400, { success: false, error: 'Blessing ID is required' });
            }

            const query = `
                UPDATE blessings
                SET approved = true,
                    approved_at = NOW(),
                    approved_by = 'admin',
                    display_order = $2
                WHERE id = $1
                RETURNING id, name, message, approved_at
            `;
            const result = await dbConnection.query(query, [blessingId, displayOrder || 0]);

            if (result.rows.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Blessing not found' });
            }

            console.log(`✅ Blessing approved: ${blessingId}`);
            return this.sendJSON(res, 200, {
                success: true,
                message: 'Blessing approved successfully',
                blessing: result.rows[0]
            });
        } catch (error) {
            console.error('❌ Error approving blessing:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Delete blessing (admin only)
    async deleteBlessing(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const body = await this.parseBody(req);
            const { blessingId } = body;

            if (!blessingId) {
                return this.sendJSON(res, 400, { success: false, error: 'Blessing ID is required' });
            }

            const query = 'DELETE FROM blessings WHERE id = $1 RETURNING id, name';
            const result = await dbConnection.query(query, [blessingId]);

            if (result.rows.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Blessing not found' });
            }

            console.log(`✅ Blessing deleted: ${blessingId}`);
            return this.sendJSON(res, 200, {
                success: true,
                message: 'Blessing deleted successfully'
            });
        } catch (error) {
            console.error('❌ Error deleting blessing:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // Delete approved blessing (admin only)
    async deleteApprovedBlessing(req, res) {
        try {
            if (!this.checkAdminAuth(req)) {
                return this.sendJSON(res, 401, { success: false, error: 'Unauthorized' });
            }
            if (!await this.initializeDatabase()) {
                return this.sendJSON(res, 500, { success: false, error: 'Database connection failed' });
            }

            const body = await this.parseBody(req);
            const { blessingId } = body;

            if (!blessingId) {
                return this.sendJSON(res, 400, { success: false, error: 'Blessing ID is required' });
            }

            const query = 'DELETE FROM blessings WHERE id = $1 AND approved = true RETURNING id, name';
            const result = await dbConnection.query(query, [blessingId]);

            if (result.rows.length === 0) {
                return this.sendJSON(res, 404, { success: false, error: 'Approved blessing not found' });
            }

            console.log(`✅ Approved blessing deleted: ${blessingId}`);
            return this.sendJSON(res, 200, {
                success: true,
                message: 'Approved blessing deleted successfully'
            });
        } catch (error) {
            console.error('❌ Error deleting approved blessing:', error.message);
            return this.sendJSON(res, 500, { success: false, error: 'Internal server error' });
        }
    }

    // WhatsApp webhook handler (Twilio inbound)
    async handleWhatsAppWebhook(req, res) {
        try {
            const body = await this.parseUrlEncodedBody(req);
            const fromE164 = (body.From || '').replace('whatsapp:', '');
            const text = (body.Body || '').trim();

            console.log(`📱 WhatsApp inbound from ${fromE164}: ${text}`);

            if (!await this.initializeDatabase()) {
                console.error('❌ Database connection failed for webhook');
                return res.writeHead(200, { 'Content-Type': 'text/xml' }).end('<Response/>');
            }

            const db = require('./database');

            // 1) STOP handling
            if (/^(stop|unsubscribe|opt\s*out)$/i.test(text)) {
                await db.markWhatsappOptOut(fromE164, { text, source: 'inbound' });
                console.log(`🚫 Opt-out recorded for ${fromE164}`);
                return res.writeHead(200, { 'Content-Type': 'text/xml' }).end('<Response/>');
            }

            // 2) Treat any inbound as consent
            await db.markWhatsappOptIn(fromE164, { text, source: 'inbound' });
            console.log(`✅ Opt-in recorded for ${fromE164}`);

            // 3) Flush queue for this phone (with cooldown)
            const pending = await db.getPendingForPhone(fromE164);
            if (pending.length) {
                console.log(`📦 Flushing ${pending.length} queued messages for ${fromE164}`);
                const WhatsAppService = require('./whatsapp-service');
                const svc = new WhatsAppService();

                for (const msg of pending) {
                    try {
                        // Check cooldown (48 hours)
                        const last = await db.getLastSendForTemplate(fromE164, msg.template_code || 'INVITE_V1');
                        if (last && (Date.now() - new Date(last.sent_at).getTime() < 48 * 60 * 60 * 1000)) {
                            console.log(`⏱️ Cooldown active for ${fromE164}, skipping queue message ${msg.id}`);
                            continue;
                        }

                        const { name, accessCode, phone } = msg.payload || {};
                        await svc.sendWeddingInvitation({
                            name: name || 'Guest',
                            phone: (fromE164 || phone || '').replace('+', ''),
                            accessCode: accessCode || ''
                        });
                        await db.markQueueSent(msg.id);
                        console.log(`✅ Queue message ${msg.id} sent`);
                    } catch (e) {
                        console.error(`❌ Queue send failed for ${msg.id}:`, e.message);
                        await db.markQueueFailed(msg.id, e.message);
                    }
                }
            }

            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end('<Response/>');
        } catch (e) {
            console.error('❌ Twilio inbound error:', e);
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end('<Response/>');
        }
    }

    // Twilio status callback handler
    async handleTwilioStatus(req, res) {
        try {
            const body = await this.parseUrlEncodedBody(req);
            console.log('📞 Twilio status callback:', JSON.stringify(body, null, 2));
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end('<Response/>');
        } catch (e) {
            console.error('❌ Twilio status error:', e);
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end('<Response/>');
        }
    }

    // Health check endpoint
    async healthCheck(req, res) {
        const dbHealthy = this.dbInitialized && await dbConnection.healthCheck();
        
        return this.sendJSON(res, 200, {
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: dbHealthy ? 'connected' : 'disconnected'
        });
    }

    // Main request handler
    async handleRequest(req, res) {
        // Handle CORS
        if (this.handleCORS(req, res)) {
            return; // CORS preflight handled
        }

        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname;
        const method = req.method;

        console.log(`${method} ${path}`);

        try {
            // Route handling
            if (path === '/health' && method === 'GET') {
                return await this.healthCheck(req, res);
            } else if (path === '/webhooks/twilio/whatsapp' && method === 'POST') {
                return await this.handleWhatsAppWebhook(req, res);
            } else if (path === '/twilio/status' && method === 'POST') {
                return await this.handleTwilioStatus(req, res);
            } else if (path === '/auth/validate-token' && method === 'POST') {
                return await this.validateToken(req, res);
            } else if (path === '/admin/rsvps' && method === 'GET') {
                return await this.getAllRSVPs(req, res);
            } else if (path === '/admin/export/rsvps.xlsx' && method === 'GET') {
                return await this.exportRSVPsExcel(req, res);
            } else if (path === '/admin/guests' && method === 'POST') {
                return await this.addGuest(req, res);
            } else if (path === '/admin/guests' && method === 'GET') {
                // Check if pagination params exist
                const parsedUrl = url.parse(req.url, true);
                if (parsedUrl.query.page || parsedUrl.query.limit) {
                    return await this.getPaginatedInvitations(req, res);
                }
                return await this.getAllGuests(req, res);
            } else if (path === '/admin/wa-queue' && method === 'GET') {
                return await this.getWAQueue(req, res);
            } else if (path === '/admin/invitations' && method === 'GET') {
                return await this.getPaginatedInvitations(req, res);
            } else if (path.startsWith('/admin/guests/') && method === 'PUT') {
                const token = path.split('/')[3];
                return await this.updateGuest(req, res, token);
            } else if (path.startsWith('/admin/guests/') && method === 'DELETE') {
                const token = path.split('/')[3];
                return await this.deleteGuest(req, res, token);
            } else if (path.startsWith('/admin/guests/') && path.endsWith('/resend') && method === 'POST') {
                const token = path.split('/')[3];
                return await this.resendInvitation(req, res, token);
            } else if (path.startsWith('/admin/guests/') && path.endsWith('/resend-email') && method === 'POST') {
                const token = path.split('/')[3];
                return await this.resendEmailOnly(req, res, token);
            } else if (path.startsWith('/admin/guests/') && path.endsWith('/resend-whatsapp') && method === 'POST') {
                const token = path.split('/')[3];
                return await this.resendWhatsAppOnly(req, res, token);
            } else if (path === '/admin/send-invites' && method === 'POST') {
                return await this.sendInvites(req, res);
            } else if (path === '/admin/guests/bulk' && method === 'POST') {
                return await this.bulkAddGuests(req, res);
            } else if (path === '/rsvp/status' && method === 'GET') {
                return await this.getRSVPStatus(req, res);
            } else if (path === '/rsvp/submit' && method === 'POST') {
                return await this.submitRSVPPartitioned(req, res);
            } else if (path === '/admin/bulk-fix-events' && method === 'POST') {
                return await this.bulkFixEvents(req, res);
            } else if (path === '/admin/bulk-resend-whatsapp' && method === 'POST') {
                return await this.bulkResendWhatsApp(req, res);
            } else if (path === '/admin/bulk-resend-email' && method === 'POST') {
                return await this.bulkResendEmail(req, res);
            } else if (path.startsWith('/admin/guests/') && path.endsWith('/opt-in') && method === 'POST') {
                const token = path.split('/')[3];
                return await this.markGuestOptIn(req, res, token);
            } else if (path === '/blessings/pending' && method === 'GET') {
                return await this.getBlessings(req, res);
            } else if (path === '/blessings/approved' && method === 'GET') {
                return await this.getApprovedBlessings(req, res);
            } else if (path === '/blessings/approve' && method === 'POST') {
                return await this.approveBlessing(req, res);
            } else if (path === '/blessings/delete' && method === 'POST') {
                return await this.deleteBlessing(req, res);
            } else if (path === '/blessings/delete-approved' && method === 'POST') {
                return await this.deleteApprovedBlessing(req, res);
            } else {
                return this.sendJSON(res, 404, { 
                    success: false, 
                    error: 'Endpoint not found' 
                });
            }
        } catch (error) {
            console.error('❌ Request handling error:', error.message);
            return this.sendJSON(res, 500, { 
                success: false, 
                error: 'Internal server error' 
            });
        }
    }

    // Start the server
    async start() {
        // Initialize database
        await this.initializeDatabase();

        // Create HTTP server
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res).catch(error => {
                console.error('❌ Unhandled request error:', error.message);
                if (!res.headersSent) {
                    this.sendJSON(res, 500, { 
                        success: false, 
                        error: 'Internal server error' 
                    });
                }
            });
        });

        // Start listening
        server.listen(this.port, () => {
            console.log('🚀 Wedding API Server started');
            console.log('═'.repeat(50));
            console.log(`🌐 Server running on port ${this.port}`);
            console.log(`📡 Health check: http://localhost:${this.port}/health`);
            console.log(`🔐 Auth endpoint: http://localhost:${this.port}/auth/validate-token`);
            console.log(`📝 RSVP endpoint: http://localhost:${this.port}/rsvp/submit`);
            console.log(`👑 Admin endpoint: http://localhost:${this.port}/admin/rsvps`);
            console.log('═'.repeat(50));
        });

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🔄 Shutting down server...');
            server.close(() => {
                console.log('✅ Server closed');
                dbConnection.close().then(() => {
                    process.exit(0);
                });
            });
        });

        return server;
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const apiServer = new WeddingAPIServer();
    apiServer.start().catch(error => {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    });
}

module.exports = WeddingAPIServer;
