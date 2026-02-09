# License server — full documentation

Read this for everything about the license system: flow, env vars, test steps, and how to wire backend, admin, and mobile app when using this server.

---

## 1. Overview: you control access remotely

You can **stop the whole system** (mobile app, admin panel, backend) by changing only **your** license server. The client sets one URL once when they deploy; after that you control access remotely.

### Flow

1. **Your license server** (you host it) has two endpoints:
   - **Check:** `GET /check?client=<CLIENT_ID>` → `{ "licensed": true, "accessToken": "<token>" }` or `{ "licensed": false }`.
   - **Validate:** `GET /validate?token=<token>` → `{ "valid": true }` or invalid/401.

2. **Mobile app** and **admin app** call your check endpoint on launch, get a token when licensed, and send the token in a header (`X-V`) on every API request.

3. **Backend** (on their server) validates every request with your server: it sends the token to your validate endpoint. If your server says invalid (or they don’t set `LICENSE_SERVER_URL` in production), the backend returns 401.

4. **When you revoke:** On your server you mark that client as unlicensed. Your check returns `licensed: false`, your validate returns `valid: false` for their tokens. Result:
   - Mobile app: can’t get a token → shows “App not activated”.
   - Admin app: same.
   - Backend: every request gets 401 because the token is no longer valid.

You **do not** need to log into their server or change their config after the first setup.

---

## 2. License server env vars

**Location:** `license-server/.env` (and same vars in **Vercel** if you deploy there)

| Variable | Required | Notes |
|----------|----------|--------|
| `SECRET` | Yes | Long random string (e.g. `openssl rand -hex 24`) for signing tokens. |
| `ADMIN_SECRET` | Yes | Another long random string for `/admin/enable` and `/admin/disable` calls. |
| `UPSTASH_REDIS_REST_URL` | Yes (Vercel) | From Upstash Redis dashboard. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (Vercel) | From Upstash Redis dashboard. |
| `ENABLED_CLIENTS` | No (Option B) | Comma-separated client IDs enabled on startup when not using Redis. |
| `DATA_FILE` | No | Path to JSON file for enabled clients (Option B, e.g. `./enabled-clients.json`). |
| `PORT` | No | Default 3333. |

**If you deploy to Vercel:** In Vercel project → Settings → Environment Variables, add the same four (SECRET, ADMIN_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN).

---

## 3. Backend env (when using license)

**Location:** `geha-backend/.env` or `geha-backend/src/.env`

| Variable | Required | Notes |
|----------|----------|--------|
| `LICENSE_SERVER_URL` | Yes (production) | Your license server URL. No space after `=`. Backend will call `.../validate`. Example: `https://your-project.vercel.app` or `http://localhost:3333`. |
| `LICENSE_DEV_BYPASS` | No | In dev, set to `true` or `yes` to skip license check when `LICENSE_SERVER_URL` is not set. |

The backend expects the app/admin to send the token in the `X-V` header and validates it with your server.

---

## 4. Mobile app env (when using license)

**Location:** `fgeha-app/.env` (or EAS/build env)

| Variable | Required | Notes |
|----------|----------|--------|
| `EXPO_PUBLIC_LICENSE_URL` | Yes (production) | Full check URL, e.g. `https://your-project.vercel.app/check`. |
| `EXPO_PUBLIC_LICENSE_CLIENT_ID` | Yes (production) | Client ID you assign (same as enabled on license server). |
| `EXPO_PUBLIC_LICENSE_CONFIG` | Alternative | Encoded blob from an optional script (you can add one in this repo, e.g. `scripts/encode-config.js`, that outputs base64 xor of `{ u: url, c: clientId }`) so URL/client are not in plain text. |
| `EXPO_PUBLIC_LICENSE_ACTIVATED` | Dev only | `true` to bypass license check in `__DEV__`. Do not set in production. |

---

## 5. Admin panel env (when using license)

**Location:** `fgeha-admin/.env`

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_LICENSE_URL` | Yes (production) | Same as app: `https://your-project.vercel.app/check`. |
| `VITE_LICENSE_CLIENT_ID` | Yes (production) | Same client id as mobile app. |
| `VITE_LICENSE_CONFIG` | Alternative | Encoded blob from the same optional encode script (see mobile app row). |
| `VITE_LICENSE_ACTIVATED` | Dev only | `true` to bypass. Do not set in production. |

---

## 6. Test steps (local)

Follow in order. Use one terminal per service.

### Step 1: Start the license server

```bash
cd license-server
npm install
npm start
```

You should see: `License server at http://0.0.0.0:3333`. Leave running.

### Step 2: Enable a client

```bash
curl -X POST "http://localhost:3333/admin/enable?client=dev-client" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET_FROM_license-server/.env"
```

Expected: `{"ok":true,"client":"dev-client","enabled":true}`.

Optional — list enabled clients:

```bash
curl "http://localhost:3333/admin/status" -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

### Step 3: Configure backend

In `geha-backend/.env`:

```
LICENSE_SERVER_URL=http://localhost:3333
```

Start backend: `cd geha-backend && npm run start:dev`.

### Step 4: Configure admin

In `fgeha-admin/.env`: set `VITE_LICENSE_URL=http://localhost:3333/check`, `VITE_LICENSE_CLIENT_ID=dev-client`, and do not set `VITE_LICENSE_ACTIVATED` (or set to `false`). Start admin: `npm run dev`.

### Step 5: Configure mobile app

In `fgeha-app/.env`: set `EXPO_PUBLIC_LICENSE_URL=http://YOUR_IP:3333/check`, `EXPO_PUBLIC_LICENSE_CLIENT_ID=dev-client`, and do not set `EXPO_PUBLIC_LICENSE_ACTIVATED` (or set to `false`). Start app: `npx expo start -c`.

### Step 6: Verify

Use admin and app; no 401. If you get 401 "Missing or invalid license": ensure client is enabled, backend has correct `LICENSE_SERVER_URL`, and app/admin send the token (no ACTIVATED bypass, correct URL and client id).

---

## 7. Hot enable/disable (no redeploy)

**Enable (client paid):**
```bash
curl -X POST "https://YOUR-LICENSE-SERVER/admin/enable?client=CLIENT_ID" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

**Disable (no payment):**
```bash
curl -X POST "https://YOUR-LICENSE-SERVER/admin/disable?client=CLIENT_ID" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

Takes effect immediately; no change on their server.

---

## 8. Endpoints reference

| Endpoint | Who | Purpose |
|----------|-----|--------|
| `GET /check?client=ID` | App, Admin | Returns `{ licensed, accessToken }`. |
| `GET /validate?token=...` | Backend | Returns `{ valid: true }` or 401. |
| `POST /admin/enable?client=ID` | You | Enable a client (hot). |
| `POST /admin/disable?client=ID` | You | Disable a client (hot). |
| `GET /admin/status` | You | List enabled clients. |

---

## 9. Summary

| What you do | What they do |
|-------------|---------------|
| Host the license server with `/check` and `/validate`. | Set `LICENSE_SERVER_URL` to your server **once** when they deploy the backend. |
| Build mobile/admin with your license URL and a client id per client. | Deploy the app/admin/backend you gave them. |
| To revoke: mark that client unlicensed on your server. | No change on their side; everything stops until you re-license. |

You never need to enter their server or change their configuration to stop the app, backend, or admin.
