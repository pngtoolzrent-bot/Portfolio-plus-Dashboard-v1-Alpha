# Anthony Kuiau — Portfolio + Telegram Admin Bot

A personal portfolio website for Anthony Kuiau (Graphic Designer & Radio Presenter) powered by **Firebase Realtime Database**, with a **Telegram bot** as the admin dashboard. Edit any section of the site directly from Telegram — no code needed.

---

## 📁 Project Structure

```
anthony-portfolio/
├── site/                    # Portfolio website (deploy this folder) 
│   ├── index.html           # Main HTML skeleton
│   ├── css/
│   │   └── style.css        # All styles + CSS variables for theming
│   └── js/
│       ├── app.js           # Firebase renderer (ES module)
│       └── config.js        # ⚠️ Your Firebase credentials (gitignored)
│
├── bot/
│   └── index.js             # Telegram admin bot (Node.js)
│
├── firebase/
│   ├── seed.json            # Full seed data (all portfolio content)
│   └── init.js              # One-time seed script
│
├── .env.example             # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Setup Guide

### Step 1 — Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Enable **Realtime Database** (start in test mode, lock down rules later)
3. Enable **Storage** (for portfolio images)
4. Go to **Project Settings → Service accounts** → Generate new private key → save as `firebase/serviceAccountKey.json`
5. Go to **Project Settings → Your apps** → Add a Web app → copy the config object

### Step 2 — Configure the Site

Create `site/js/config.js` (copy from the template below):

```js
export const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

> ⚠️ `config.js` is gitignored. Never commit it.

### Step 3 — Seed the Database

```bash
npm install
cp .env.example .env
# Fill in your values in .env
npm run seed
```

This writes all default portfolio content to Firebase. You only need to do this once.

### Step 4 — Create the Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot`
2. Copy the token into `.env` as `TELEGRAM_BOT_TOKEN`
3. Find your Telegram user ID (message [@userinfobot](https://t.me/userinfobot)) and add it to `ADMIN_TELEGRAM_IDS`

### Step 5 — Run the Bot

```bash
npm start
# or for development with auto-restart:
npm run dev
```

Message your bot `/start` — you'll see the admin dashboard.

### Step 6 — Deploy the Site

The `site/` folder is a static site. Deploy anywhere:
- **Firebase Hosting**: `firebase deploy`
- **Netlify / Vercel**: drag and drop the `site/` folder
- **GitHub Pages**: push `site/` as the root

> The site uses ES modules (`type="module"`), so it requires a proper web server (not `file://`). For local testing use `npx serve site`.

---

## 🤖 Bot Capabilities

| Section     | What you can edit |
|-------------|-------------------|
| 🏠 Hero     | Tag line, name HTML, sub-title, CTA buttons, CV URL |
| 👤 About    | Heading, paragraphs, stats (value + label) |
| 🖼 Portfolio | Add/edit/delete projects, upload images, set YouTube embeds, toggle visibility |
| 💼 Experience | Add/edit/delete work history entries |
| 🛠 Skills   | Add/edit/delete skill groups and individual tags |
| 📬 Contact  | Email, CV URL, heading, body text, social links |
| 🎨 Theme    | All CSS color variables (ink, paper, accent, muted, line, warm) |

### Portfolio Media
- **Image**: Upload a photo directly in Telegram → auto-uploaded to Firebase Storage
- **YouTube**: Paste a YouTube URL → automatically embedded as `<iframe>` on the site
- **Skip**: Leave the media slot empty (placeholder shown)

---

## 🔄 Live Updates

The site uses Firebase's `onValue` listener, meaning **changes made via the bot appear on the site immediately** — no refresh needed on modern browsers.

---

## 🔒 Firebase Security Rules (recommended for production)

```json
{
  "rules": {
    ".read":  true,
    ".write": false
  }
}
```

This allows the public site to read data, while all writes go through the bot (which uses the Admin SDK and bypasses these rules).

---

## 🌱 Migrating / Exporting Data

All site content lives in `firebase/seed.json` format. To export current data:

```bash
# Using Firebase CLI
firebase database:get /site > firebase/export.json
```

To import into a new project, update `.env` with new Firebase credentials and run `npm run seed` again.

---

## 🛠 Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | Vanilla HTML/CSS/JS (ES Modules) |
| Database | Firebase Realtime Database |
| Storage  | Firebase Storage |
| Bot      | Node.js + node-telegram-bot-api |
| Fonts    | Google Fonts (Playfair Display + DM Sans) |

---

## 📝 Notes

- The `site/js/config.js` file is **gitignored** and must be created manually on each machine/deployment
- `firebase/serviceAccountKey.json` is also **gitignored** — keep it secure
- Portfolio image uploads are stored under `gs://your-bucket/portfolio/`
- The bot keeps a simple in-memory session per user for multi-step wizards — restarting the bot clears any in-progress edits
