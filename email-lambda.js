const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// Bride-side template (Bride name first)
function brideEmailHTML({ guest, siteUrl, eventsText = "" }) {
    const primary = "#7A4988";
    const accent = "#B65FCF";
    const code = guest.token || guest.accessCode || "XXXXXX";
    const name = guest.name || guest.guest_name || "Guest";

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Wedding Invitation</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#f6f2fb; }
    img { border:0; outline:none; text-decoration:none; display:block; max-width:100%; }
    a { color:${primary}; text-decoration:none; }
    .btn { background:${primary}; color:#fff !important; padding:14px 22px; border-radius:999px; display:inline-block; font-weight:700; }
    .muted { color:#6b6b6b; font-size:12px; }
    .pill { display:inline-block; padding:6px 12px; border-radius:999px; background:#eee0f6; color:${primary}; font-weight:700; margin:0 4px 8px 0; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing:2px; background:#fff; border:2px dashed ${accent}; padding:12px 16px; border-radius:12px; display:inline-block; }
    .card { background:#ffffff; border-radius:20px; box-shadow:0 12px 40px rgba(122,73,136,.18); overflow:hidden; }
    .script { font-family:'Dancing Script', 'Brush Script MT', 'Segoe Script', 'Comic Sans MS', cursive; }
    .body { font-family:'Open Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b2b2b; }
    .divider { height:1px; background:linear-gradient(90deg, transparent, ${accent}, transparent); width:100%; }
    @media (max-width:600px){
      .wrap { padding:18px !important; }
      .h1 { font-size:28px !important; }
      .names { font-size:26px !important; }
    }
  </style>
</head>
<body class="body">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f2fb;">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" class="card">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#F3E7FF,#E6D5F0); padding:28px 24px;">
              <div style="height:12px"></div>
              <div class="script" style="color:${primary}; font-size:34px; font-weight:700;">
                Jane <span style="color:#444;">&</span> John
              </div>
              <div style="height:10px"></div>
              <div class="muted">#LoremIpsum • 15 June, 2026</div>
            </td>
          </tr>

          <tr>
            <td class="wrap" style="padding:28px 32px 8px;">
            <div style="font-size:18px; font-weight:600; color:#7a4998; font-style:italic; margin-bottom:16px; line-height:1.6;">
                “सपनों की डोरी अब सजी है सच्चे प्यार से,
                 नए रिश्तों की महक आई है हमारे द्वार से।” 💖
              </div>
              <div style="font-size:14px; color:#7a7a7a;">Dear ${name},</div>
              <div style="height:12px"></div>

              <div class="h1" style="font-size:30px; font-weight:800; color:${primary};">
                You're warmly invited to celebrate the union of,
              </div>
              <div style="height:10px"></div>

              <div class="names script" style="font-size:30px; color:${accent};">
                <strong>Jane</strong> & <span style="color:${primary}">John</span>
              </div>

              <div style="height:16px"></div>
              <div style="line-height:1.7">
                We're delighted to have you join the celebrations on the <strong>bride's side</strong>. Your presence means the world to us!
              </div>

              ${eventsText ? `
              <div style="height:18px"></div>
              <div style="font-weight:700; color:#333; margin-bottom:6px;">We look forward to welcoming you to:</div>
              <div>${eventsText}</div>
              ` : ""}

              <div style="height:22px"></div>
              <div>Use your personal invite code to view event details & RSVP:</div>
              <div style="height:10px"></div>
              <div class="code">${code}</div>

              <div style="height:22px"></div>
              <a class="btn" href="${siteUrl}" target="_blank" rel="noopener">Open Wedding Site</a>

              <div style="height:26px"></div>
              <div class="divider"></div>

              <div style="height:18px"></div>
              <div style="font-size:14px; color:#5a5a5a;">
                With love,<br>
                <strong>Jane &amp; John</strong>
              </div>

              <div style="height:24px"></div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 24px 26px; background:#fff;">
              <div class="muted">
                Need help with your code? Reply to this email.
              </div>
              <div style="height:12px"></div>
              <div class="muted">© 2025 Jane &amp; John's Wedding</div>
            </td>
          </tr>
        </table>

        <div style="height:18px"></div>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

// Groom-side template (Groom name first)
function groomEmailHTML({ guest, siteUrl, eventsText = "" }) {
    const primary = "#7A4988";
    const accent = "#B65FCF";
    const code = guest.token || guest.accessCode || "XXXXXX";
    const name = guest.name || guest.guest_name || "Guest";

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Wedding Invitation</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#f4f7ff; }
    img { border:0; outline:none; text-decoration:none; display:block; max-width:100%; }
    a { color:${primary}; text-decoration:none; }
    .btn { background:${primary}; color:#fff !important; padding:14px 22px; border-radius:999px; display:inline-block; font-weight:700; }
    .muted { color:#6b6b6b; font-size:12px; }
    .pill { display:inline-block; padding:6px 12px; border-radius:999px; background:#e0e9ff; color:#1b2250; font-weight:700; margin:0 4px 8px 0; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing:2px; background:#fff; border:2px dashed ${primary}; padding:12px 16px; border-radius:12px; display:inline-block; }
    .card { background:#ffffff; border-radius:20px; box-shadow:0 12px 40px rgba(30,58,138,.18); overflow:hidden; }
    .script { font-family:'Dancing Script', 'Brush Script MT', 'Segoe Script', 'Comic Sans MS', cursive; }
    .body { font-family:'Open Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#2b2b2b; }
    .divider { height:1px; background:linear-gradient(90deg, transparent, ${primary}, transparent); width:100%; }
    @media (max-width:600px){
      .wrap { padding:18px !important; }
      .h1 { font-size:28px !important; }
      .names { font-size:26px !important; }
    }
  </style>
</head>
<body class="body">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7ff;">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" class="card">
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#E6F0FF,#CCE0FF); padding:28px 24px;">
              <div style="height:12px"></div>
              <div class="script" style="color:#1b2250; font-size:34px; font-weight:700;">
                John <span style="color:#444;">&</span> Jane
              </div>
              <div style="height:10px"></div>
              <div class="muted">#LoremIpsum • 15 June, 2026</div>
            </td>
          </tr>

          <tr>
            <td class="wrap" style="padding:28px 32px 8px;">
            <div style="font-size:18px; font-weight:600; color:#7a4998; font-style:italic; margin-bottom:16px; line-height:1.6; text-align:center;">
                "नया सफ़र, नई मंज़िल, नई कहानी होगी,<br>
                आपके साथ से हमारी खुशियाँ दोगुनी होगी।"
              </div>
              <div style="font-size:14px; color:#7a7a7a;">Dear ${name},</div>
              <div style="height:12px"></div>

              <div class="h1" style="font-size:30px; font-weight:800; color:#1b2250;">
                We Can't Wait To Celebrate With You The Joyous Moments of...
              </div>
              <div style="height:10px"></div>

              <div class="names script" style="font-size:30px; color:${primary}; text-align:center;">
                <strong>John</strong> & <span style="color:${accent}">Jane</span>
              </div>

              <div style="height:16px"></div>
              <div style="line-height:1.7">
                You're invited on the <strong>groom's side</strong>, and your blessings will mean the world to us!
              </div>

              ${eventsText ? `
              <div style="height:18px"></div>
              <div style="font-weight:700; color:#333; margin-bottom:6px;">We would love to have your gracious presence at the following event(s):</div>
              <div>${eventsText}</div>
              ` : ""}

              <div style="height:22px"></div>
              <div>Here's your personal invite code to view event details & RSVP:</div>
              <div style="height:10px"></div>
              <div class="code">${code}</div>

              <div style="height:22px"></div>
              <a class="btn" href="${siteUrl}" target="_blank" rel="noopener">Open Wedding Site</a>

              <div style="height:26px"></div>
              <div class="divider"></div>

              <div style="height:18px"></div>
              <div class="muted">
                If the button doesn't work, open <a href="${siteUrl}" target="_blank">${siteUrl}</a> and enter your code.
              </div>

              <div style="height:24px"></div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 24px 26px; background:#fff;">
              <div class="muted">© 2025 John &amp; Jane's Wedding</div>
            </td>
          </tr>
        </table>

        <div style="height:18px"></div>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

exports.handler = async (event) => {
    console.log('📧 Email Lambda received request:', JSON.stringify(event, null, 2));
    
    try {
        const payload = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || event);
        const guest = payload.guestData || payload.guest || payload;
        
        if (!guest || !guest.email || !(guest.name || guest.guest_name) || !(guest.accessCode || guest.token)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: email, name, accessCode/token'
                })
            };
        }
        
        console.log(`📤 Sending email invitation to ${guest.name || guest.guest_name} (${guest.email})`);
        
        const siteUrl = process.env.SITE_URL || "https://www.yourdomain.com";
        const side = (guest.side || guest.guestSide || guest.guest_side || "").toLowerCase();
        const events = Array.isArray(guest.eventAccess || guest.event_access) ? (guest.eventAccess || guest.event_access) : [];
        
        console.log('🔍 Debug - Guest side:', side);
        console.log('🔍 Debug - Guest object:', JSON.stringify(guest, null, 2));
        
        // Create event pills
        const eventMap = { haldi: "🌼 Haldi", sangeet: "🎵 Sangeet", wedding: "💒 Wedding" };
        const eventsText = events.length
            ? events.map(e => `<span class="pill">${eventMap[e] || e}</span>`).join(" ")
            : "";

        // Select template based on side
        const html = side === "bride"
            ? brideEmailHTML({ guest, siteUrl, eventsText })
            : groomEmailHTML({ guest, siteUrl, eventsText });

        const subject = side === "bride"
            ? "💕 Invitation to the Wedding of Jane & John 💍"
            : "💕 Invitation to the Wedding of John & Jane 💍";
        
        const ses = new SESClient({ 
            region: process.env.AWS_REGION || 'us-east-1'
        });
        
        const params = {
            Source: process.env.SES_FROM_EMAIL || 'invitations@yourdomain.com',
            Destination: { ToAddresses: [guest.email] },
            Message: {
                Subject: { Data: subject, Charset: "UTF-8" },
                Body: { Html: { Data: html, Charset: "UTF-8" } }
            },
            ReplyToAddresses: [process.env.SES_REPLY_TO_EMAIL || 'invitations@yourdomain.com']
        };
        
        console.log('🚀 Sending email via AWS SES...');
        const command = new SendEmailCommand(params);
        const result = await ses.send(command);
        
        console.log(`✅ Email sent successfully! MessageId: ${result.MessageId}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                messageId: result.MessageId,
                message: `Email sent to ${guest.email}`
            })
        };
        
    } catch (error) {
        console.error('❌ Email sending error:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
