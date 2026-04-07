# WhatsApp Appointment Booking (Safe Scaffold)

This scaffold is intentionally additive and **not auto-enabled** in the active backend route wiring.
Current endpoints and existing patient/visit flows continue to work as before.

## What Was Added

1. Prisma appointment schema:
- `Appointment` model
- `AppointmentStatus` enum
- `AppointmentSource` enum

2. Backend files (isolated):
- `dentalcare/backend/routes/appointments.js`
- `dentalcare/backend/utils/appointmentId.js`
- Prisma migration SQL at `dentalcare/backend/prisma/migrations/20260407000100_add_appointments/migration.sql`

3. WhatsApp service update:
- `whatsapp/whatsapp.py` now supports:
  - `GET /webhook` (Meta webhook verification)
  - `POST /webhook` (incoming message handling)
  - multi-step booking chat flow (name -> slot -> reason)
  - creates booking requests via backend `/appointments/whatsapp/request`
  - keeps existing `POST /send-message` route

## Important: Why You Do NOT Need A Separate Database

You can keep one database and still protect patient data by:
- exposing only appointment-specific APIs to WhatsApp integration
- using a shared integration secret
- returning minimal fields from public integration endpoints
- applying role-based auth for staff endpoints

## Manual Opt-In Steps (Do Only When Ready)

1. Add backend env variable:
- `WHATSAPP_BOOKING_SECRET=<strong-random-secret>`

2. Apply Prisma schema in backend folder:
- Fresh/baselined DB: `npx prisma migrate deploy && npx prisma generate`
- Existing local DB without Prisma migration history: `npx prisma db push && npx prisma generate`

3. Mount appointment routes in backend app:
- Already mounted in this workspace in `dentalcare/backend/app.js`.

4. Add WhatsApp service env variables in `whatsapp/.env`:
- `WHATSAPP_VERIFY_TOKEN=<meta-webhook-verify-token>`
- `BOOKING_API_URL=http://localhost:4000/appointments/whatsapp/request`
- `WHATSAPP_BOOKING_SECRET=<same-secret-as-backend>`
- `WHATSAPP_HOST=0.0.0.0`
- `WHATSAPP_PORT=5000`

6. Optional ngrok env for auto-tunnel during `npm start`:
- `NGROK_AUTHTOKEN=<your-ngrok-token>`
- `NGROK_DOMAIN=<your-static-domain-if-any>`
- The root `npm start` now starts `ngrok` automatically and prints the public webhook URL.

5. Configure Meta Webhook:
- Verify URL: `<your-public-url>/webhook`
- Verify token: same as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to message events

## Notes

- Current conversation state in `whatsapp.py` is in-memory and resets on restart.
- If you want durable conversation state, next step is storing chat state in DB/Redis.
- Slot conflict check currently blocks exact same datetime slot; you may extend this to duration windows.

## Troubleshooting

- Error `(#131030) Recipient phone number not in allowed list`:
  - This means your WhatsApp Cloud API number is in test mode and the recipient is not added as a test recipient.
  - In Meta App Dashboard, add the destination number under WhatsApp test recipients and verify it.
  - If using a temporary token, regenerate it after expiry and update `WHATSAPP_ACCESS_TOKEN`.

- Not receiving incoming messages in local webhook:
  - Confirm ngrok is running and forwarding to `http://localhost:5000`.
  - Use the exact ngrok HTTPS URL plus `/webhook` in Meta webhook settings.
  - In Meta webhook subscriptions, ensure `messages` is subscribed.
