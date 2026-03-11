const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.from = process.env.TWILIO_WHATSAPP_FROM;
    this.templateSid = 'HXd10936637ad69686d5f7e556f69825e0';
    this.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;
  }

  async sendWeddingInvitation(guest) {
    try {
      let e164 = String(guest.phone || '').trim();
      if (!e164.startsWith('+')) e164 = `+${e164}`;
      const to = `whatsapp:${e164}`;
      const name = guest.name || 'Guest';
      const code = guest.accessCode || guest.access_code || 'NA';

      const msg1Text = `Hi ${name}! 💕

You're invited to *{{Bride and Groom}}'s Wedding!*

🌸 Visit our wedding website: www.yourdomain.com

🔑 Use your Invite Code below to unlock event details and RSVP!

We can't wait to celebrate this beautiful day with your blessings and presence. 💐

With love,

- Bride ❤️ Groom`;

      const payload1 = { to, body: msg1Text };
      const payload2 = { to, body: code };
      
      if (this.messagingServiceSid) {
        payload1.messagingServiceSid = this.messagingServiceSid;
        payload2.messagingServiceSid = this.messagingServiceSid;
      } else {
        payload1.from = this.from;
        payload2.from = this.from;
      }

      const msg1 = await this.client.messages.create(payload1);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const msg2 = await this.client.messages.create(payload2);
      
      console.log(`✅ WhatsApp sent to ${guest.phone} — SID: ${msg1.sid}, ${msg2.sid}`);
      return { success: true, messageId: msg1.sid, status: msg1.status };
    } catch (err) {
      console.error('❌ WhatsApp send failed:', err.message, err.code);
      if (err.code === 63019 || err.code === 63016) {
        return { success: false, error: 'Recipient has not opted in. They need to message your WhatsApp number first.', code: err.code };
      }
      return { success: false, error: err.message, code: err.code };
    }
  }
}

module.exports = WhatsAppService;
