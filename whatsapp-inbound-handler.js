const { dbConnection, markWhatsappOptIn, getPendingForPhone, markQueueSent, markQueueFailed, getLastSendForTemplate } = require('./database');

// Initialize DB connection outside handler for reuse
let dbInitialized = false;

exports.handler = async (event) => {
    // Parse Twilio webhook body
    const body = event.body ? parseUrlEncoded(event.body) : {};
    const from = (body.From || '').replace('whatsapp:', '').trim();
    const text = (body.Body || '').trim();

    console.log(`📱 WhatsApp inbound from ${from}: ${text}`);

    // Return 200 immediately to Twilio
    const response = {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: '<Response/>'
    };

    if (!from) {
        console.log('⚠️ No sender phone number');
        return response;
    }

    // Process async (don't await - fire and forget)
    processInbound(from, text).catch(err => 
        console.error('❌ Background processing error:', err.message)
    );

    return response;
};

async function processInbound(from, text) {
    try {
        // Initialize DB once and reuse
        if (!dbInitialized) {
            await dbConnection.initialize();
            dbInitialized = true;
        }

        // Mark opt-in
        const result = await markWhatsappOptIn(from, { text, source: 'inbound_wa', timestamp: new Date().toISOString() });
        if (result.success) {
            console.log(`✅ Opt-in recorded for ${from}`);
        } else {
            console.log(`⚠️ Opt-in update failed for ${from}: ${result.error}`);
        }

        // Check for queued messages
        const pending = await getPendingForPhone(from);
        if (pending.length > 0) {
            console.log(`📦 Found ${pending.length} queued messages for ${from}`);
            
            const WhatsAppService = require('./whatsapp-service');
            const whatsappService = new WhatsAppService();

            for (const msg of pending) {
                try {
                    // Check 48-hour cooldown
                    const last = await getLastSendForTemplate(from, msg.template_code || 'INVITE_V1');
                    if (last && (Date.now() - new Date(last.sent_at).getTime() < 48 * 60 * 60 * 1000)) {
                        console.log(`⏱️ Cooldown active for ${from}, skipping message ${msg.id}`);
                        continue;
                    }

                    const { name, accessCode, phone } = msg.payload || {};
                    const result = await whatsappService.sendWeddingInvitation({
                        name: name || 'Guest',
                        phone: (from || phone || '').replace('+', ''),
                        accessCode: accessCode || ''
                    });

                    if (result.success) {
                        await markQueueSent(msg.id);
                        console.log(`✅ Queue message ${msg.id} sent`);
                    } else {
                        await markQueueFailed(msg.id, result.error || 'Send failed');
                        console.log(`❌ Queue message ${msg.id} failed: ${result.error}`);
                    }
                } catch (e) {
                    console.error(`❌ Error sending queue message ${msg.id}:`, e.message);
                    await markQueueFailed(msg.id, e.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ processInbound error:', error.message);
    }
}

// Parse URL-encoded body
function parseUrlEncoded(body) {
    const params = new URLSearchParams(body);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}
