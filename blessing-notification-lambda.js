const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

/**
 * Lambda function to send blessing notification emails to admin
 * This is a dedicated function separate from guest invitation emails
 */
exports.handler = async (event) => {
    console.log('💌 Blessing Notification Lambda received request:', JSON.stringify(event, null, 2));
    
    try {
        const { to, subject, html, text } = event;
        
        // Validate required fields
        if (!to || !subject || !html) {
            console.error('Missing required fields:', { to, subject, html: !!html });
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: to, subject, html'
                })
            };
        }
        
        console.log(`📤 Sending blessing notification to ${to}`);
        
        // Initialize SES client (outside VPC, has direct internet access)
        const ses = new SESClient({ 
            region: process.env.AWS_REGION || 'us-east-1'
        });
        
        const params = {
            Source: process.env.SES_FROM_EMAIL || 'invitations@yourdomain.com',
            Destination: { 
                ToAddresses: [to] 
            },
            Message: {
                Subject: { 
                    Data: subject 
                },
                Body: { 
                    Html: { 
                        Data: html 
                    },
                    ...(text && { 
                        Text: { 
                            Data: text 
                        } 
                    })
                }
            },
            ReplyToAddresses: [process.env.SES_REPLY_TO_EMAIL || 'invitations@yourdomain.com']
        };
        
        console.log('🚀 Sending blessing notification email via AWS SES...');
        const command = new SendEmailCommand(params);
        const result = await ses.send(command);
        
        console.log(`✅ Blessing notification email sent successfully! MessageId: ${result.MessageId}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                messageId: result.MessageId,
                message: `Notification email sent to ${to}`
            })
        };
        
    } catch (error) {
        console.error('❌ Blessing notification email error:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message,
                details: error.stack
            })
        };
    }
};
