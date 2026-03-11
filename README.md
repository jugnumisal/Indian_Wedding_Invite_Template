# 💕 Wedding Website Template

A modern, secure wedding website with guest management, RSVP system, and automated invitations. Choose between cloud-based (AWS) or self-hosted deployment.

## ✨ Features

- 🔐 **Secure Guest Authentication** - Token-based access with session management
- 📝 **RSVP System** - Guest responses with meal preferences and song requests
- 👥 **Admin Dashboard** - Manage guests, send invitations, track RSVPs
- 📧 **Email Invitations** - Automated delivery via AWS SES or SMTP
- 📱 **WhatsApp Integration** - Send invitations via Twilio (optional)
- 💬 **Blessings System** - Collect and display guest wishes
- 📸 **Photo Gallery** - Showcase your memories
- 📅 **Event Timeline** - Display your love story
- 📱 **Mobile Responsive** - Optimized for all devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Frontend hosting (Vercel, Netlify, or your own server)
- Backend hosting (AWS Lambda or your own server)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/wedding-website.git
cd wedding-website
npm install
```

2. **Customize Content**

Update the following files with your information:

#### HTML Files
- `index.html` - Replace "Bride" and "Groom" with actual names, update dates
- `event-details.html` - Add event dates, times, venues, and addresses
- `family.html` - Replace family member names and descriptions
- `location.html` - Update venue details and addresses
- All files: Replace `#LoremIpsum` with your wedding hashtag

#### Images
- Replace `logo.png` and `logo-gif.gif` with your wedding logo
- Add your photos to the `Photos/` directory:
  - `Hero.JPG` - Main banner image
  - `bride.jpeg` and `groom.jpeg` - Individual photos
  - `bride-parents.jpg`, `groom-parents.jpeg` - Family photos
  - `timeline1.png`, `timeline2.jpeg`, etc. - Love story photos
  - `1.jpeg` through `10.jpeg` - Memory gallery photos

#### Styling
- `styles.css` - Update CSS variables for colors:
```css
:root {
  --primary-color: #E0AFFF;
  --secondary-color: #C4A8DC;
  --accent-color: #B492D2;
}
```

#### Optional: Splash Screen Video
To enable the splash screen video:
1. Add your video file as `1.mp4` in the root directory
2. Add your audio file as `jab_we_met.mp3` in the root directory
3. Uncomment the splash screen section in `index.html` (lines 17-30)

## 🏗️ Deployment Options

Choose one of the following deployment options:

---

## Option 1: Cloud Deployment (AWS)

### Backend Setup (AWS Lambda + RDS)

#### 1. Setup Database (RDS PostgreSQL)

Create an RDS PostgreSQL instance and run the initialization scripts:

```bash
psql -h your-rds-endpoint.region.rds.amazonaws.com -U your_username -d wedding_db -f init.sql
psql -h your-rds-endpoint.region.rds.amazonaws.com -U your_username -d wedding_db -f create-blessings-table.sql
```

#### 2. Configure Environment Variables

Create a `.env` file:

```env
# Database
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=wedding_db
DB_USER=your_username
DB_PASSWORD=your_password
DB_SSL=true

# AWS SES (Email)
SES_FROM_EMAIL=invitations@yourdomain.com
SES_REPLY_TO_EMAIL=contact@yourdomain.com

# Twilio (WhatsApp - Optional)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# VPC (for Lambda)
VPC_SECURITY_GROUP_ID=sg-xxxxx
VPC_SUBNET_ID_1=subnet-xxxxx
VPC_SUBNET_ID_2=subnet-xxxxx

# Site URL
SITE_URL=https://yourdomain.com
```

#### 3. Deploy Backend to AWS Lambda

```bash
# Install Serverless Framework
npm install -g serverless

# Configure AWS credentials
aws configure

# Deploy
npm run deploy
```

This will output your API Gateway URL. Copy it for the next step.

#### 4. Update Frontend API Endpoints

Replace `your-api-gateway-url.execute-api.region.amazonaws.com` in the following files:

- `index.html` (line ~450, ~480)
- `admin-guests.html` (line ~300)
- `secure-auth.js` (line ~15)

Example:
```javascript
const apiBase = 'https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod';
```

#### 5. Update CORS Origins

In `lambda-handler.js`, update allowed origins:
```javascript
const allowedOrigins = [
    'https://www.yourdomain.com',
    'https://yourdomain.com',
    'http://localhost:3000'
];
```

#### 6. Deploy Frontend (Vercel)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy --prod
```

Or connect your GitHub repository to Vercel:
- Framework Preset: Other
- Build Command: (leave empty)
- Output Directory: (leave empty)

---

## Option 2: Self-Hosted Deployment (NAS/Server)

### Backend Setup (Node.js + PostgreSQL)

#### 1. Setup Database (PostgreSQL)

Install PostgreSQL on your server:

```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb wedding_db
sudo -u postgres createuser wedding_user -P

# Run initialization scripts
psql -U wedding_user -d wedding_db -f init.sql
psql -U wedding_user -d wedding_db -f create-blessings-table.sql
```

#### 2. Configure Environment Variables

Create a `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wedding_db
DB_USER=wedding_user
DB_PASSWORD=your_secure_password
DB_SSL=false

# SMTP Email (use your email provider)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=invitations@yourdomain.com

# Server
PORT=3000
NODE_ENV=production

# Site URL
SITE_URL=https://yourdomain.com
```

#### 3. Setup Email Service

For Gmail:
1. Enable 2-factor authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password in `SMTP_PASSWORD`

For other providers, use their SMTP settings.

#### 4. Update Backend for SMTP

Modify `email-lambda.js` to use nodemailer instead of AWS SES:

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

// Replace SES send with:
await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: subject,
    html: htmlBody
});
```

#### 5. Start Backend Server

```bash
# Install dependencies
npm install

# Install PM2 for process management
npm install -g pm2

# Start server
pm2 start api-server.js --name wedding-api

# Save PM2 configuration
pm2 save
pm2 startup
```

#### 6. Setup Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable SSL with Let's Encrypt:
```bash
sudo certbot --nginx -d api.yourdomain.com
```

#### 7. Update Frontend API Endpoints

Replace API URLs in the following files:

- `index.html`
- `admin-guests.html`
- `secure-auth.js`

Example:
```javascript
const apiBase = 'https://api.yourdomain.com';
```

#### 8. Deploy Frontend

**Option A: Same Server (Nginx)**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/wedding;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Copy files:
```bash
sudo mkdir -p /var/www/wedding
sudo cp -r * /var/www/wedding/
sudo chown -R www-data:www-data /var/www/wedding
```

Enable SSL:
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Option B: Separate Hosting (Vercel/Netlify)**

Follow the same steps as Option 1, but point to your self-hosted API.

---

## 🔧 Configuration

### Admin Access

Default admin credentials:
- **Access Code**: `admin`

Change this in `secure-auth.js` (line 89):
```javascript
if (token === 'your-new-admin-code') {
    // Admin access
}
```

### Event Configuration

Update event details in `event-details.html`:
```javascript
const EVENTS = [
  {
    id: 'haldi',
    name: 'Haldi',
    date: 'June 13, 2025',
    time: 'Morning at 9:00 AM',
    location: 'Venue Name',
    locationAddress: 'Full Address',
    mapLink: 'https://maps.google.com/?q=...'
  },
  // Add more events
];
```

## 📝 Database Schema

The database includes tables for:
- `guests` - Guest information and access codes
- `rsvps` - RSVP responses
- `blessings` - Guest wishes and blessings
- `sessions` - User sessions

See `init.sql` for complete schema.

## 🛠️ Development

### Local Development

1. Start local API server:
```bash
node api-server.js
```

2. Open `index.html` in your browser or use a local server:
```bash
npx http-server -p 8080
```

### Testing

- Admin dashboard: Use access code `admin`
- Test guest access: Create guest codes via admin dashboard

## 📄 License

MIT License - Feel free to use this for your own wedding!

## 💡 Tips

- Test thoroughly before sending invitations
- Keep backup of your database
- Monitor costs (AWS) or server resources (self-hosted)
- Use environment variables for sensitive data
- Enable CloudWatch logs (AWS) or server logs for debugging

## 🐛 Troubleshooting

### AWS Deployment

**Issue**: Can't connect to database
- Check VPC security groups
- Verify database credentials
- Ensure Lambda has VPC access

**Issue**: Emails not sending
- Verify SES domain
- Check SES sending limits
- Review CloudWatch logs

### Self-Hosted Deployment

**Issue**: Can't connect to database
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify database credentials
- Check firewall rules

**Issue**: Emails not sending
- Verify SMTP credentials
- Check email provider settings
- Review server logs: `pm2 logs wedding-api`

**Issue**: API not accessible
- Check Nginx configuration: `sudo nginx -t`
- Verify SSL certificates: `sudo certbot certificates`
- Check server logs: `pm2 logs`

---

**Need help?** Open an issue on GitHub or check the inline code comments.
