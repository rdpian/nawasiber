# Nawasiber Community Intelligence v1.0

Platform prototipe community-driven public cyber safety:
- Public dashboard and verified-report lookup
- Supabase Auth registration/login
- Authenticated community report submission
- Admin verification queue and review workflow
- Aggregate statistics
- Separate public-web recon/Judol scanner can be connected as a search-provider module

## Architecture

- Frontend: `index.html` (Tailwind CDN + vanilla JS)
- Serverless API: `netlify/functions/api.mjs`
- Database/Auth: Supabase
- Hosting: Netlify

## 1. Create Supabase project

1. Create a project at https://supabase.com.
2. Open SQL Editor and execute `supabase/schema.sql`.
3. In Project Settings → API, copy:
   - Project URL
   - anon/public key
   - service_role key (SECRET; server-side only)

Enable Email auth in Authentication → Providers. For a hackathon demo, configure email confirmation appropriately; do not disable it for a real public launch without considering abuse controls.

## 2. Netlify environment variables

Set these in Site configuration → Environment variables:

- `SUPABASE_URL` = Supabase project URL
- `SUPABASE_ANON_KEY` = Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service_role key (never expose in frontend/GitHub)
- `ADMIN_API_KEY` = a random secret at least 32 characters long

Generate an admin key locally, for example:
`python -c "import secrets; print(secrets.token_urlsafe(48))"`

Redeploy after setting variables.

## 3. Deploy

Push the repository contents to GitHub. In Netlify import the repository.
- Build command: empty
- Publish directory: `.`
- Functions directory: `netlify/functions`

`netlify.toml` routes `/api/*` to the API function. The frontend currently calls `/api/dispatch`; update `netlify.toml` rewrite from `/api/*` to `/.netlify/functions/api` as configured, so any `/api/...` path reaches the same handler. The API uses the `action` field in JSON to route operations.

Local development:
```bash
npm install -g netlify-cli
netlify dev
```

## 4. API actions

All requests are `POST` JSON to `/api/dispatch`:
- `{"action":"register","email":"...","password":"..."}`
- `{"action":"login","email":"...","password":"..."}`
- `{"action":"submit_report","category":"phone","identifier":"...","title":"...","description":"..."}`
  Requires `Authorization: Bearer <Supabase access token>`.
- `{"action":"check","category":"phone","identifier":"..."}`
- `{"action":"stats"}`
- `{"action":"admin_queue"}` with `x-admin-key` header
- `{"action":"admin_review","id":"...","status":"verified","severity":"medium","admin_note":"..."}` with `x-admin-key` header

## Important production hardening before public launch

This is a hackathon MVP, not a fully hardened public service:
- Add persistent rate limiting (Upstash/Redis or API gateway), CAPTCHA/anti-bot, abuse reporting and moderation SLA.
- Add email verification, password reset UX, account deletion/export, privacy notice, retention policy, and consent/legal basis.
- Add file upload to private Supabase Storage with MIME/type/size scanning; current MVP accepts evidence URLs only.
- Add audit logs for every moderator action and separate moderator roles (the initial MVP uses a single admin API secret).
- Do not publish unverified reports or reporter identity. Do not label people as criminals. A verified report means the submission passed platform review, not legal proof.
- Add search-provider integration for Judol Scanner and Fraud Recon. The current community lookup searches the Nawasiber database; it is not a global blacklist.
- Consider abuse/privacy risks before exposing exact phone/account identifiers. Restrict detail visibility and support takedown/appeal requests.

## Note about Python

Netlify Functions in this project use JavaScript because Python is not a supported native Netlify Functions runtime. `requirements.txt` is not used by Netlify. Use a separate Python host if you later move the recon engine to FastAPI.
