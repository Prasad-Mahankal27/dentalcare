# Orisyn Flask Backend (Supabase Multi-Tenant)

This backend provides secure multi-tenant auth and sync APIs for Orisyn.

## Folder Structure

```text
flask-backend/
  app/
    __init__.py
    auth.py
    config.py
    routes/
      auth_routes.py
      sync_routes.py
      user_routes.py
    services/
      supabase_service.py
    utils/
      http.py
  examples/
    electron_supabase_calls.js
  sql/
    001_multitenant_supabase.sql
  .env.example
  requirements.txt
  run.py
```

## Setup

1. Copy `.env.example` to `.env` and fill Supabase values.
2. Run SQL from `sql/001_multitenant_supabase.sql` in Supabase SQL Editor.
3. Install dependencies:
   - `pip install -r requirements.txt`
4. Start the API:
   - `python run.py`

## API Endpoints

- `POST /auth/admin-signup`
- `POST /auth/login`
- `POST /users/invite`
- `GET /users/me`
- `POST /sync/upload`
- `GET /sync/download`

## Security Notes

- Supabase service role key is only used in backend routes.
- Frontend sends only user access tokens.
- RLS policies enforce clinic isolation across all tenant data.
- Backend ignores clinic_id from frontend and derives clinic from auth profile.