

# Orisyn — Dental Clinic Admin Panel

## Overview
A clean, minimal admin dashboard for a single-clinic dental application with 6 main sections, sidebar navigation, and API-driven data display.

## Layout
- **Sidebar** using ShadCN Sidebar component with collapsible icon mode
- **Header** with SidebarTrigger always visible
- Logo/brand "Orisyn" at top of sidebar
- 6 nav items: Dashboard, Patients, Appointments, Users, Logs, Settings

## Pages

### 1. Dashboard (`/dashboard`)
- 4 stat cards (Total Patients, New Today, Recurring, Appointments Today) fetched from `GET /dashboard/stats`
- Recent activity list from `GET /logs?limit=5`
- Today's appointments section from `GET /appointments/today`

### 2. Patients (`/patients`)
- Data table with columns: Name, Phone, Last Visit, Visit Count, Type (New if visit_count===1, else Recurring)
- Click row → detail dialog/modal
- Loading skeletons + empty state

### 3. Appointments (`/appointments`)
- Two sections: Today's & Upcoming
- Each card shows Patient Name, Date/Time, Doctor Name
- Read-only, clean card layout

### 4. Users (`/users`)
- Table: Name, Email, Role, Status
- Add User button → modal form (POST /users)
- Inline Edit Role (PUT /users/:id)
- Toggle Status switch (PATCH /users/:id/status)
- Reset Password button

### 5. Logs (`/logs`)
- Table: User, Action, Timestamp
- Pagination controls

### 6. Settings (`/settings`)
- Maintenance Mode toggle
- Announcement text input + send button

## Technical Approach
- React Query for all data fetching with loading/error states
- Axios instance with configurable base URL
- ShadCN UI components (Card, Table, Dialog, Switch, Button, Skeleton, Pagination)
- Tailwind for styling — clean whites, subtle borders, minimal color palette
- All API calls wired up but gracefully handle when backend is unavailable (show mock/empty states)
- Responsive layout

## File Structure
- `src/lib/api.ts` — Axios instance
- `src/components/AppSidebar.tsx` — Sidebar nav
- `src/components/Layout.tsx` — SidebarProvider + header + main content
- `src/pages/Dashboard.tsx`, `Patients.tsx`, `Appointments.tsx`, `Users.tsx`, `Logs.tsx`, `Settings.tsx`
- Supporting components for modals and forms as needed

