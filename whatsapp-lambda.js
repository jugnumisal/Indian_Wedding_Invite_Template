const WhatsAppService = require('./whatsapp-service');

exports.handler = async (event) => {
    console.log('📱 WhatsApp Lambda received request:', JSON.stringify(event, null, 2));
    
    try {
        const { guestData } = event;
        
        if (!guestData || !guestData.phone || !guestData.name || !guestData.accessCode) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: phone, name, accessCode'
                })
            };
        }
        
        console.log(`📤 Sending WhatsApp invitation to ${guestData.name} (${guestData.phone})`);
        const svc = new WhatsAppService();
        const result = await svc.sendWeddingInvitation({
            name: guestData.name,
            phone: String(guestData.phone || '').replace('+', ''),
            accessCode: guestData.accessCode
        });
        
        if (result.success) {
            console.log(`✅ WhatsApp sent successfully! SID: ${result.messageId}`);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    sid: result.messageId,
                    message: `WhatsApp sent to ${guestData.phone}`
                })
            };
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('❌ WhatsApp sending error:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
