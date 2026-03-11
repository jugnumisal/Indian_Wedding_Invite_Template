#!/usr/bin/env node
const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function createTemplate() {
    try {
        const content = await client.content.v1.contents.create({
            friendlyName: 'wedding_invite_no_media',
            language: 'en',
            variables: {
                '1': 'Guest Name',
                '2': 'Access Code'
            },
            types: {
                'twilio/text': {
                    body: `Hi {{1}}! 💕

You're invited to *{{Bride}} & {{Groom}}'s Wedding!*

🌐 Visit: https://www.yourdomain.com
💌 Your invite code: {{2}}

Enter it on our website to view Event details and RSVP.

We look forward to your blessings and presence on our special day.

- {{Groom}} ❤️ {{Bride}}`
                }
            }
        });

        console.log('✅ Template created!');
        console.log('Template SID:', content.sid);
        console.log('Name:', content.friendlyName);
        console.log('\nUpdate whatsapp-service.js with this SID:');
        console.log(`this.templateSid = '${content.sid}';`);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

createTemplate();
