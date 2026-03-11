# 💕 Indian Wedding Website Template

A beautiful, modern wedding website template with guest management, RSVP system, and stunning animations. Perfect for Indian weddings with support for multiple ceremonies (Haldi, Sangeet, Wedding).

## ✨ Features

- 🎨 **Beautiful Design** - Elegant purple theme with hearts animation and flower effects
- 🔐 **Secure Guest Authentication** - Token-based access with session management
- 📝 **RSVP System** - Guest responses with floating RSVP button
- 👥 **Admin Dashboard** - Manage guests, send invitations, track RSVPs
- 📧 **Email Invitations** - Automated delivery via AWS SES or SMTP
- 📱 **WhatsApp Integration** - Send invitations via Twilio (optional)
- 💬 **Blessings System** - Collect and display guest wishes
- 📸 **Photo Gallery** - Carousel for your memories
- 📅 **Event Timeline** - Display your love story with beautiful animations
- 👨‍👩‍👧‍👦 **Family Page** - Showcase both families with toggle switch
- 🎭 **Event Details** - Curtain reveal animations for each ceremony
- 📱 **Mobile Responsive** - Optimized for all devices

## 🚀 Quick Start for Template Users

### Step 1: Fork/Clone the Repository

```bash
git clone https://github.com/jugnumisal/Indian_Wedding_Invite_Template.git
cd Indian_Wedding_Invite_Template
```

### Step 2: Customize Your Content

#### 1. **Replace Placeholder Text**

**In `index.html`:**
- Line 6: Change page title from `#LoremIpsum` to your wedding hashtag
- Line 40: Update brand title `#LoremIpsum` to your hashtag
- Line 88: Replace "Bride" and "Groom" with actual names
- Line 91: Update wedding date from "15 Lorem, 2026"
- Lines 150-180: Update bride and groom descriptions (replace lorem ipsum text)
- Lines 200-280: Update love story timeline with your story
- Line 300+: Update memory captions

**In `family.html`:**
- Replace "The Does Family" and "The Smiths Family" with actual family names
- Update all "Father's Name", "Mother's Name", "Sibling Name" placeholders
- Replace placeholder descriptions with real family information
- Update "Grandfather's Name" and "Grandmother's Name"

**In `event-details.html`:**
- Lines 420-450: Update event details in the `EVENTS` array:
  ```javascript
  {
    id: 'haldi',
    name: 'Haldi',
    date: 'June 13, 2025',  // Add your date
    time: 'Morning at 9:00 AM',  // Update time
    location: 'Venue Name',  // Add venue name
    locationAddress: 'Full Address',  // Add full address
    mapLink: 'https://maps.google.com/?q=...'  // Add Google Maps link
  }
  ```

**In `location.html`:**
- Update venue details, addresses, and contact information
- Update hotel recommendations
- Update transportation details

**In `animated-favicon.js`:**
- Line 23: Change `#LoremIpsum` to your wedding hashtag

#### 2. **Replace Images**

Add your photos to the `Photos/` directory:

**Required Images:**
- `Hero.JPG` - Main banner image (1920x1080 recommended)
- `bride.jpeg` - Bride's photo (800x800 recommended)
- `groom.jpeg` - Groom's photo (800x800 recommended)
- `bride-parents.jpg` - Bride's parents photo
- `groom-parents.jpeg` - Groom's parents photo
- `bride-sibling.jpeg` - Bride's sibling(s) photo
- `groom-sibling.jpeg` - Groom's sibling(s) photo
- `bride-paternal-GP.jpeg` - Bride's paternal grandparents
- `bride-maternal-GP.jpeg` - Bride's maternal grandparents
- `groom-paternal-GP.jpeg` - Groom's paternal grandparents
- `groom-maternal-GP.jpeg` - Groom's maternal grandparents
- `Bridefamily.jpeg` - Bride's family group photo
- `Groomfamily.jpg` - Groom's family group photo
- `timeline1.png`, `timeline2.jpeg`, `Propose.jpeg`, `big-day.jpeg` - Love story photos
- `1.jpeg` through `10.jpeg` - Memory carousel photos (10 photos)

**Logo Files:**
- `logo.png` - Your wedding logo (200x200 recommended)
- `logo-gif.gif` - Animated logo (optional, can be same as logo.png)

#### 3. **Update Colors (Optional)**

In `styles.css`, update CSS variables:
```css
:root {
  --primary-color: #E0AFFF;  /* Main purple */
  --secondary-color: #C4A8DC;  /* Light purple */
  --accent-color: #B492D2;  /* Accent purple */
}
```

#### 4. **Optional: Add Splash Screen Video**

To enable the splash screen video:
1. Add your video file as `1.mp4` in the root directory
2. Add your audio file as `jab_we_met.mp3` in the root directory
3. In `index.html`, uncomment lines 17-30 (the splash screen section)

### Step 3: Test Locally

Open `index.html` in your browser to preview. All pages should work without a backend for testing.

**Note:** The event details page is set to show all events by default for template preview. When you're ready to add authentication, see the deployment section below.

### Step 4: Deploy Frontend (Simple Option)

#### Deploy to Vercel (Recommended - Free)

1. Push your customized code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign up
3. Click "New Project" and import your GitHub repository
4. Configure:
   - Framework Preset: **Other**
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
5. Click "Deploy"

Your website will be live at `https://your-project.vercel.app`

#### Deploy to Netlify (Alternative - Free)

1. Push your code to GitHub
2. Go to [netlify.com](https://netlify.com) and sign up
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub and select your repository
5. Build settings: (leave all empty)
6. Click "Deploy site"

---

## 🔧 Advanced Setup (With Backend & Authentication)

If you want to enable guest authentication, RSVP system, and admin dashboard:

### Prerequisites

- Node.js 18+
- PostgreSQL database
- AWS account (for Lambda + RDS) OR your own server

### Option 1: AWS Deployment (Cloud)

#### 1. Setup Database (RDS PostgreSQL)

Create an RDS PostgreSQL instance and run:
```bash
psql -h your-rds-endpoint.amazonaws.com -U your_username -d wedding_db -f init.sql
psql -h your-rds-endpoint.amazonaws.com -U your_username -d wedding_db -f create-blessings-table.sql
```

#### 2. Configure Environment Variables

Create `.env` file:
```env
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=5432
DB_NAME=wedding_db
DB_USER=your_username
DB_PASSWORD=your_password
DB_SSL=true

SES_FROM_EMAIL=invitations@yourdomain.com
SES_REPLY_TO_EMAIL=contact@yourdomain.com

SITE_URL=https://yourdomain.com
```

#### 3. Deploy Backend

```bash
npm install -g serverless
aws configure
npm run deploy
```

Copy the API Gateway URL from the output.

#### 4. Update Frontend API Endpoints

Replace `your-api-gateway-url.execute-api.region.amazonaws.com` in:
- `secure-auth.js` (line ~11)
- `index.html` (blessing form submission)
- `admin-guests.html`

#### 5. Enable Authentication in event-details.html

Uncomment the authentication code (lines 452-465 and 671-676):
```javascript
// Uncomment this section:
const s = localStorage.getItem('wedding_user_info');
if (!s) return [];
// ... rest of the code
```

### Option 2: Self-Hosted (Your Server)

#### 1. Setup PostgreSQL

```bash
sudo apt-get install postgresql postgresql-contrib
sudo -u postgres createdb wedding_db
sudo -u postgres createuser wedding_user -P
psql -U wedding_user -d wedding_db -f init.sql
psql -U wedding_user -d wedding_db -f create-blessings-table.sql
```

#### 2. Configure Environment

Create `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wedding_db
DB_USER=wedding_user
DB_PASSWORD=your_password
DB_SSL=false

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=invitations@yourdomain.com

PORT=3000
SITE_URL=https://yourdomain.com
```

#### 3. Start Backend

```bash
npm install
npm install -g pm2
pm2 start api-server.js --name wedding-api
pm2 save
pm2 startup
```

#### 4. Setup Nginx

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

Enable SSL:
```bash
sudo certbot --nginx -d api.yourdomain.com
```

#### 5. Update Frontend API URLs

Replace `your-api-gateway-url` with `https://api.yourdomain.com` in:
- `secure-auth.js`
- `index.html`
- `admin-guests.html`

---

## 🔐 Admin Access

Default admin code: `admin`

To change it, update `secure-auth.js` (line ~89):
```javascript
if (token === 'your-new-admin-code') {
    // Admin access
}
```

Access admin dashboard at: `https://yoursite.com/admin-guests.html`

---

## 📝 Customization Guide

### Change Wedding Hashtag

Replace `#LoremIpsum` in:
1. `index.html` (multiple locations)
2. `family.html`
3. `event-details.html`
4. `location.html`
5. `admin-guests.html`
6. `animated-favicon.js`

### Update Event Details

Edit the `EVENTS` array in `event-details.html` (around line 420):
- Add/remove events
- Update dates, times, venues
- Change descriptions
- Update images

### Modify Family Structure

In `family.html`:
- Add/remove siblings by duplicating the sibling sections
- Add more family members by copying the structure
- Update the toggle switch labels if needed

### Change Color Theme

In `styles.css`, update the `:root` variables:
```css
:root {
  --primary-color: #your-color;
  --secondary-color: #your-color;
  --accent-color: #your-color;
}
```

---

## 🎨 Features Breakdown

### 1. Home Page (`index.html`)
- Hero banner with couple names
- Countdown timer (flip clock animation)
- Meet the couple section
- Love story timeline with background color transitions
- Memory carousel (auto-advancing)
- Blessings submission form
- Hearts waterfall animation
- Blossoming flowers footer

### 2. Family Page (`family.html`)
- Toggle switch between groom's and bride's families
- Family introduction cards
- Parents, siblings, grandparents sections
- Hearts animation
- Responsive design

### 3. Event Details Page (`event-details.html`)
- Curtain reveal animations for each event
- Tab navigation (Haldi, Sangeet, Wedding)
- Event cards with images, dates, times, dress codes
- Google Maps integration
- Sticky navigation

### 4. Location Page (`location.html`)
- Venue information
- Transportation details
- Hotel recommendations
- Local attractions
- Interactive map placeholder

### 5. Admin Dashboard (`admin-guests.html`)
- Guest management
- Send invitations
- Track RSVPs
- Manage blessings
- Export guest list

---

## 🐛 Troubleshooting

### Events Not Showing
- Check browser console for errors
- Verify `event-details.html` has correct event data
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)

### Images Not Loading
- Verify image files exist in `Photos/` directory
- Check file names match exactly (case-sensitive)
- Ensure images are in correct format (JPEG, PNG, GIF)

### Title Shows Wrong Text
- Clear browser cache completely
- Check `animated-favicon.js` has correct title
- Hard refresh the page (Ctrl+F5)

### Styling Issues
- Clear browser cache
- Check `styles.css` is loading
- Verify CSS variables are set correctly

---

## 📄 License

MIT License - Free to use for your wedding!

## 💡 Tips

- **Test on mobile devices** - Most guests will view on phones
- **Optimize images** - Compress photos to reduce load time
- **Backup your data** - Keep copies of all customizations
- **Test before sharing** - Preview all pages before sending invitations
- **Use high-quality photos** - Your photos are the star of the show!

## 🙏 Credits

Created with ❤️ for couples planning their special day.

---

**Questions?** Open an issue on GitHub: https://github.com/jugnumisal/Indian_Wedding_Invite_Template/issues
