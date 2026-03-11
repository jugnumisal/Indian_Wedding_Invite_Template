const { Pool } = require('pg');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Database connection pool
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false
    } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Lambda client for invoking email sender
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Submit a new blessing
 */
async function submitBlessing(event) {
    let client;
    try {
        const body = JSON.parse(event.body);
        const { name, message, email, phone } = body;

        // Validate required fields
        if (!name || !message) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Name and message are required'
                })
            };
        }

        // Validate message length
        if (message.length < 10 || message.length > 1000) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Message must be between 10 and 1000 characters'
                })
            };
        }

        client = await pool.connect();

        // Insert blessing into database
        const insertQuery = `
            INSERT INTO blessings (name, message, email, phone, submitted_at, approved, display_order)
            VALUES ($1, $2, $3, $4, NOW(), false, 0)
            RETURNING id, name, message, submitted_at
        `;
        
        const result = await client.query(insertQuery, [name, message, email || null, phone || null]);
        const blessing = result.rows[0];

        console.log('Blessing submitted:', blessing);

        // Send email notification to admin
        try {
            await sendApprovalEmail(blessing);
            console.log('Approval email sent successfully');
        } catch (emailError) {
            console.error('Error sending approval email:', emailError);
            // Don't fail the blessing submission if email fails
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'Blessing submitted successfully. It will appear once approved.',
                blessing: {
                    id: blessing.id,
                    name: blessing.name,
                    submitted_at: blessing.submitted_at
                }
            })
        };

    } catch (error) {
        console.error('Error submitting blessing:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to submit blessing. Please try again later.'
            })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Get all approved blessings
 */
async function getApprovedBlessings(event) {
    let client;
    try {
        client = await pool.connect();

        const query = `
            SELECT id, name, message, email, phone, approved_at, display_order
            FROM blessings
            WHERE approved = true
            ORDER BY display_order ASC, approved_at DESC
        `;
        
        const result = await client.query(query);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(result.rows)
        };

    } catch (error) {
        console.error('Error fetching approved blessings:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to fetch blessings'
            })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Get pending blessings (admin only)
 */
async function getPendingBlessings(event) {
    let client;
    try {
        // TODO: Add admin authentication check here

        client = await pool.connect();

        const query = `
            SELECT id, name, message, email, phone, submitted_at
            FROM blessings
            WHERE approved = false
            ORDER BY submitted_at DESC
        `;
        
        const result = await client.query(query);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(result.rows)
        };

    } catch (error) {
        console.error('Error fetching pending blessings:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to fetch pending blessings'
            })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Approve a blessing (admin only)
 */
async function approveBlessing(event) {
    let client;
    try {
        // Check admin authentication
        let token = null;
        if (event.queryStringParameters?.token) {
            token = event.queryStringParameters.token;
        } else if (event.body) {
            try {
                const body = JSON.parse(event.body);
                token = body.token;
            } catch (e) {
                console.error('Error parsing body:', e);
            }
        }
        
        if (token !== 'admin') {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Unauthorized - Invalid admin token' })
            };
        }

        // Extract blessing ID from path or body
        const pathMatch = event.path?.match(/\/(\d+)\/approve/);
        let blessingId = null;
        let displayOrder = 0;
        
        if (pathMatch) {
            blessingId = parseInt(pathMatch[1]);
        } else if (event.body) {
            try {
                const body = JSON.parse(event.body);
                blessingId = body.blessingId;
                displayOrder = body.displayOrder || 0;
            } catch (e) {
                console.error('Error parsing body for blessing ID:', e);
            }
        }

        if (!blessingId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Blessing ID is required'
                })
            };
        }

        client = await pool.connect();

        const updateQuery = `
            UPDATE blessings
            SET approved = true,
                approved_at = NOW(),
                approved_by = 'admin',
                display_order = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, message, approved_at
        `;
        
        const result = await client.query(updateQuery, [blessingId, displayOrder || 0]);
        
        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Blessing not found'
                })
            };
        }

        // Return HTML for GET requests (email links), JSON for POST
        if (event.httpMethod === 'GET') {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/html' },
                body: `<html><body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1 style="color: #28a745;">✅ Blessing Approved!</h1>
                    <p>The blessing from <strong>${result.rows[0].name}</strong> has been approved and will appear on your website.</p>
                    <p style="margin-top: 30px;"><a href="https://www.yourdomain.com/admin-guests.html#blessings" style="color: #E0AFFF;">View Admin Panel</a></p>
                </body></html>`
            };
        }
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'Blessing approved successfully',
                blessing: result.rows[0]
            })
        };

    } catch (error) {
        console.error('Error approving blessing:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to approve blessing'
            })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Reject a blessing via email link (admin only)
 */
async function rejectBlessing(event) {
    let client;
    try {
        // Check admin authentication
        const token = event.queryStringParameters?.token;
        if (token !== 'admin') {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'text/html' },
                body: '<html><body><h1>Unauthorized</h1><p>Invalid admin token</p></body></html>'
            };
        }

        // Extract blessing ID from path
        const pathMatch = event.path?.match(/\/(\d+)\/reject/);
        const blessingId = pathMatch ? parseInt(pathMatch[1]) : null;

        if (!blessingId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'text/html' },
                body: '<html><body><h1>Error</h1><p>Blessing ID is required</p></body></html>'
            };
        }

        client = await pool.connect();

        // Delete the blessing
        const deleteQuery = 'DELETE FROM blessings WHERE id = $1 AND approved = false RETURNING name';
        const result = await client.query(deleteQuery, [blessingId]);
        
        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'text/html' },
                body: '<html><body><h1>Not Found</h1><p>Blessing not found or already approved</p></body></html>'
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: `<html><body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: #dc3545;">❌ Blessing Rejected</h1>
                <p>The blessing from <strong>${result.rows[0].name}</strong> has been rejected and deleted.</p>
                <p style="margin-top: 30px;"><a href="https://www.yourdomain.com/admin-guests.html#blessings" style="color: #E0AFFF;">View Admin Panel</a></p>
            </body></html>`
        };

    } catch (error) {
        console.error('Error rejecting blessing:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'text/html' },
            body: '<html><body><h1>Error</h1><p>Failed to reject blessing</p></body></html>'
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Delete/reject a blessing (admin only)
 */
async function deleteBlessing(event) {
    let client;
    try {
        // Check admin authentication
        let token = null;
        if (event.body) {
            try {
                const body = JSON.parse(event.body);
                token = body.token;
            } catch (e) {
                console.error('Error parsing body:', e);
            }
        }
        
        if (token !== 'admin') {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Unauthorized - Invalid admin token' })
            };
        }

        const body = JSON.parse(event.body);
        const { blessingId } = body;

        if (!blessingId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Blessing ID is required'
                })
            };
        }

        client = await pool.connect();

        const deleteQuery = 'DELETE FROM blessings WHERE id = $1 RETURNING id';
        const result = await client.query(deleteQuery, [blessingId]);
        
        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Blessing not found'
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'Blessing deleted successfully'
            })
        };

    } catch (error) {
        console.error('Error deleting blessing:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to delete blessing'
            })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Delete an approved blessing (admin only)
 */
async function deleteApprovedBlessing(event) {
    let client;
    try {
        // Check admin authentication
        let token = null;
        if (event.body) {
            try {
                const body = JSON.parse(event.body);
                token = body.token;
            } catch (e) {
                console.error('Error parsing body:', e);
            }
        }
        
        if (token !== 'admin') {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Unauthorized - Invalid admin token' })
            };
        }

        const body = JSON.parse(event.body);
        const { blessingId } = body;

        if (!blessingId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Blessing ID is required'
                })
            };
        }

        client = await pool.connect();

        // Delete only approved blessings
        const deleteQuery = 'DELETE FROM blessings WHERE id = $1 AND approved = true RETURNING id, name';
        const result = await client.query(deleteQuery, [blessingId]);
        
        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Approved blessing not found'
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'Approved blessing deleted successfully'
            })
        };

    } catch (error) {
        console.error('Error deleting approved blessing:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to delete approved blessing'
            })
        };
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Send approval email to admin by invoking emailSender Lambda asynchronously
 */
async function sendApprovalEmail(blessing) {
    const approveLink = `https://your-api-gateway-url.execute-api.region.amazonaws.com/prod/blessings/${blessing.id}/approve?token=admin`;
    const rejectLink = `https://your-api-gateway-url.execute-api.region.amazonaws.com/prod/blessings/${blessing.id}/reject?token=admin`;
    
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #E0AFFF, #d090ff); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .blessing-box { background: white; padding: 20px; border-left: 5px solid #E0AFFF; margin: 20px 0; border-radius: 5px; }
                .blessing-name { font-weight: bold; color: #E0AFFF; margin-bottom: 10px; }
                .blessing-message { font-style: italic; color: #555; line-height: 1.8; word-wrap: break-word; }
                .button-container { text-align: center; margin: 30px 0; }
                .button { display: inline-block; color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; margin: 10px 5px; font-weight: bold; min-width: 120px; text-align: center; }
                .button-approve { background: linear-gradient(135deg, #28a745, #20c997); }
                .button-reject { background: linear-gradient(135deg, #dc3545, #c82333); }
                .info { color: #666; font-size: 14px; margin-top: 10px; }
                @media only screen and (max-width: 600px) {
                    .container { padding: 10px; }
                    .header { padding: 20px; }
                    .content { padding: 20px; }
                    .button { display: block; width: 100%; margin: 10px 0; box-sizing: border-box; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💕 New Blessing Received!</h1>
                </div>
                <div class="content">
                    <p>A new blessing has been submitted for your wedding website.</p>
                    
                    <div class="blessing-box">
                        <div class="blessing-name">From: ${blessing.name}</div>
                        <div class="blessing-message">"${blessing.message}"</div>
                        <div class="info">Submitted: ${new Date(blessing.submitted_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</div>
                    </div>
                    
                    <p style="text-align: center; font-weight: bold;">Take action directly from this email:</p>
                    
                    <div class="button-container">
                        <a href="${approveLink}" class="button button-approve">✅ Accept</a>
                        <a href="${rejectLink}" class="button button-reject">❌ Reject</a>
                    </div>
                    
                    <p style="margin-top: 30px; color: #999; font-size: 14px; text-align: center;">
                        This is an automated notification from your wedding website.<br>
                        Blessing ID: ${blessing.id}
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;

    // Invoke emailSender Lambda asynchronously (Event invocation type)
    const payload = {
        to: 'admin@yourdomain.com',
        subject: '💕 New Blessing Submitted - Approval Required',
        html: htmlContent
    };

    const command = new InvokeCommand({
        FunctionName: process.env.EMAIL_SENDER_FUNCTION || 'your-email-sender-function',
        InvocationType: 'Event', // Async invocation - don't wait for response
        Payload: JSON.stringify(payload)
    });

    await lambdaClient.send(command);
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Blessings Lambda invoked:', JSON.stringify(event, null, 2));

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,Origin,Accept,X-Requested-With',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
            },
            body: ''
        };
    }

    const path = event.path || event.rawPath || '';
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';

    console.log(`Processing ${method} ${path}`);

    try {
        // Route to appropriate handler
        // Note: API Gateway strips /blessings prefix, so we check for /submit, /approved, etc.
        if ((path.includes('/submit') || path === '/submit') && method === 'POST') {
            return await submitBlessing(event);
        } else if ((path.includes('/approved') || path === '/approved') && method === 'GET') {
            return await getApprovedBlessings(event);
        } else if ((path.includes('/pending') || path === '/pending') && method === 'GET') {
            return await getPendingBlessings(event);
        } else if ((path.includes('/approve') || path === '/approve') && (method === 'POST' || method === 'GET')) {
            return await approveBlessing(event);
        } else if ((path.includes('/reject') || path === '/reject') && (method === 'POST' || method === 'GET')) {
            return await rejectBlessing(event);
        } else if ((path.includes('/delete-approved') || path === '/delete-approved') && method === 'POST') {
            return await deleteApprovedBlessing(event);
        } else if ((path.includes('/delete') || path === '/delete') && method === 'POST') {
            return await deleteBlessing(event);
        } else {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Endpoint not found'
                })
            };
        }
    } catch (error) {
        console.error('Unhandled error in blessings lambda:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal server error'
            })
        };
    }
};
