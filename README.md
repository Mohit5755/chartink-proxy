# Chartink Proxy — Manohar Capital

A tiny Node.js server that fetches Chartink screener results and serves them to your dashboard — bypassing browser CORS restrictions.

## Deploy on Render.com (Free, 5 minutes)

### Step 1 — Create a GitHub repo
1. Go to github.com → New repository
2. Name it `chartink-proxy` → Create
3. Upload these 3 files: `index.js`, `package.json`, `render.yaml`

### Step 2 — Deploy on Render
1. Go to render.com → Sign up free (use GitHub login)
2. Click **New** → **Web Service**
3. Connect your GitHub account → Select `chartink-proxy` repo
4. Settings will auto-fill from render.yaml:
   - Name: chartink-proxy
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**
5. Click **Create Web Service**
6. Wait ~2 minutes for deploy

### Step 3 — Get your URL
After deploy, Render gives you a URL like:
`https://chartink-proxy-xxxx.onrender.com`

### Step 4 — Update dashboard
In the dashboard HTML file, find this line:
```
const BACKEND_URL = 'YOUR_RENDER_URL_HERE';
```
Replace with your actual URL:
```
const BACKEND_URL = 'https://chartink-proxy-xxxx.onrender.com';
```

## Notes
- Free Render tier spins down after 15 min inactivity — first scan after a pause takes ~30 seconds to wake up
- After that, subsequent scans are fast (2-3 seconds)
- No cost, no credit card needed
