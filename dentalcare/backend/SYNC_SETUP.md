# SQLite <-> Supabase Sync Setup

This backend keeps SQLite as the local source of truth and synchronizes changes with Supabase.

## 1. Configure environment

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_CLINIC_ID` (must match a row in `public.clinics`)
- `SYNC_ENABLED=true`

Optional tuning:

- `SYNC_DEVICE_ID` (unique device name)
- `SYNC_INTERVAL_MS` (default 5000)
- `SYNC_BATCH_SIZE` (default 50)

## 2. What syncs

The following local models are mirrored:

- `User`
- `Patient`
- `Visit`
- `Appointment`
- `Billing`

All create/update/delete operations are captured by a Prisma query extension and written to local outbox table `SyncOutbox`.

## 3. Push and pull behavior

- Push: pending outbox changes are upserted into Supabase table `public.clinic_sync_records`.
- Pull: latest clinic-scoped records are pulled from Supabase and applied into SQLite.
- Loop: runs in background while backend is running.

## 4. First-time bootstrap for existing data

For clinics with existing local SQLite data, run once after login as ADMIN:

- `POST /sync/bootstrap`

This queues all existing rows and pushes them to Supabase.

## 5. Operational endpoints (ADMIN token required)

- `GET /sync/status`
- `POST /sync/run`
- `POST /sync/bootstrap`

## 6. Important notes

- Keep `SYNC_CLINIC_ID` identical across devices that belong to the same clinic.
- Devices in different clinics must use different `SYNC_CLINIC_ID` values.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to frontend clients.
