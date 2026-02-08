# License server — hot enable/disable

Control who can use the app: enable when you get payment, disable when you don’t. No need to touch the client’s server.

---

## Option A: Vercel + Upstash (no server — recommended)

You don’t need a VPS or a server. Use **Vercel** (hosting) + **Upstash Redis** (store who’s enabled). Both have free tiers.

### 1. Create Upstash Redis (free)

1. Go to [upstash.com](https://upstash.com) and sign up.
2. Create a Redis database (free tier).
3. Copy **REST URL** and **REST Token** from the database dashboard.

### 2. Deploy to Vercel

1. Push the `license-server` folder to a Git repo (or use the root repo and set “Root Directory” to `license-server` in Vercel).
2. Go to [vercel.com](https://vercel.com) → New Project → Import the repo.
3. Set **Root Directory** to `license-server` (if the repo is the whole project).
4. Add **Environment Variables** in Vercel:
   - `SECRET` – long random string (e.g. run `openssl rand -hex 24`).
   - `ADMIN_SECRET` – another long random string (for enable/disable calls).
   - `UPSTASH_REDIS_REST_URL` – from Upstash dashboard.
   - `UPSTASH_REDIS_REST_TOKEN` – from Upstash dashboard.
5. Deploy.

Your license server URL will be like: **`https://your-project.vercel.app`**

### 3. Point app and backend to it

- **Mobile app** (when building for a client):  
  License check URL = `https://your-project.vercel.app/check`  
  (and set client id as usual, or use the encoded config script.)
- **Backend** (their env):  
  `LICENSE_SERVER_URL=https://your-project.vercel.app`  
  (backend will call `.../validate`.)

### 4. Hot enable / disable

**Enable (client paid):**
```bash
curl -X POST "https://your-project.vercel.app/admin/enable?client=CLIENT_ID" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

**Disable (no payment):**
```bash
curl -X POST "https://your-project.vercel.app/admin/disable?client=CLIENT_ID" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

**See who is enabled:**
```bash
curl "https://your-project.vercel.app/admin/status" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

No server to maintain; enable/disable takes effect immediately.

---

## Option B: Run the Node server yourself

If you prefer a VPS, Railway, or Render:

1. In the `license-server` folder run: `npm install && npm start`.
2. Set env: `SECRET`, `ADMIN_SECRET`, and optionally `ENABLED_CLIENTS`, `DATA_FILE` (see `.env.example`).
3. Use the same **Hot enable/disable** curl commands above with your server URL.

---

## Endpoints

| Endpoint | Who | Purpose |
|----------|-----|--------|
| `GET /check?client=ID` | App, Admin | Returns `{ licensed, accessToken }`. |
| `GET /validate?token=...` | Their backend | Returns `{ valid: true }` or 401. |
| `POST /admin/enable` | You | Enable a client (hot). |
| `POST /admin/disable` | You | Disable a client (hot). |
| `GET /admin/status` | You | List enabled clients. |
