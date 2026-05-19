# HOS Trip Planner Design

## Scope

Build a single-user Django and React app that takes trip details, computes an FMCSA Hours of Service compliant schedule, displays the route and required stops, renders daily ELD-style log sheets, and exports the logs as a PDF.

The assignment should be tuned for the target JD. It must show complete feature ownership across a React frontend and Django backend, responsive React + Material UI implementation, clean REST APIs, non-trivial algorithmic business logic, caching where it matters, and production-minded code that can ship quickly.

Inputs:

- Current location
- Pickup location
- Dropoff location
- Current cycle used hours
- Explicit departure date/time, with a `Use current time` shortcut

Assumptions:

- Property-carrying driver
- 70-hour / 8-day cycle
- No adverse driving conditions
- Fueling at least once every 1,000 miles
- 1 hour for pickup and 1 hour for dropoff

## Architecture

```text
React + Material UI frontend
  -> Django REST API
      -> Geocoding service with Postgres cache
      -> OSRM routing service wrapper
      -> HOS scheduler
      -> ELD log renderer
      -> PDF exporter
  -> Postgres
```

Postgres is required in all environments. The app does not use SQLite as a fallback. Local development uses Docker Compose to provide Postgres, and hosted deployment should use a managed Postgres database.

This should be implemented as a pragmatic tracer bullet first: one thin but real vertical slice from MUI form to DRF endpoint to Postgres persistence to rendered schedule response. After that slice works, the HOS rules, route adapter, map, log renderer, and PDF export can be deepened without changing the shape of the system.

## Data Model

`TripRequest` stores the raw user request and resolved plan status.

`Place` stores normalized geocoding results and caches address lookups.

`RoutePlan` stores route geometry, distance, duration, and step metadata.

`DutyEvent` is the canonical trip timeline. Each event has a start, end, duty status, location, remarks, and mileage delta.

`DailyLog` stores one calendar day's rendered log data, including row totals and events clipped to that day.

The `DutyEvent` timeline is the source of truth for map stops, schedule rows, log grids, totals, and PDF export.

## Scheduling Algorithm

The backend scheduler:

1. Resolves the three locations.
2. Gets routes for current to pickup and pickup to dropoff.
3. Converts route distance and duration into driving work.
4. Inserts fixed on-duty work for pre-trip, pickup, dropoff, fueling, and post-trip.
5. Enforces HOS limits:
   - 11-hour driving limit
   - 14-hour driving window
   - 30-minute break before driving beyond 8 cumulative driving hours
   - 70-hour / 8-day on-duty cap, seeded by current cycle used hours
   - 10 consecutive hours off duty or sleeper berth before a new driving shift
6. Splits the final timeline into calendar days.
7. Validates that every daily log totals exactly 24 hours.

The initial policy uses off duty for the 30-minute break, sleeper berth for long rest, driving for route movement, and on-duty not driving for pickup, dropoff, fueling, and inspections.

## Log Rendering

Each daily log is rendered from the same event data used by the scheduler.

- X-axis: midnight to midnight in 15-minute increments
- Row 1: Off Duty
- Row 2: Sleeper Berth
- Row 3: Driving
- Row 4: On Duty, Not Driving

The renderer draws horizontal duty-status lines, vertical transitions, remarks, row totals, and daily mileage. PDF export uses the same daily log model, so screen and export stay consistent.

## UX

The first screen is the planner workspace, not a landing page.

- Left rail: Material UI trip inputs
- Main area: route map
- Detail area: tabs for schedule, logs, and export
- Clear progress states for address resolution, routing, HOS calculation, and log generation
- Inline warnings for unresolved locations, map API failures, impossible schedules, or invalid cycle hours
- Disabled submit until required fields are valid

The UX goal is to make the user's mental model simple: enter trip details, generate a legal timeline, inspect why stops were inserted, download the logs.

The frontend should visibly demonstrate attention to detail expected by the JD:

- Responsive MUI layout that works on desktop and mobile
- Tight alignment, spacing, and clear visual hierarchy
- Form constraints that prevent invalid requests before submission
- Clear loading and error feedback for each backend step
- Algorithm output surfaced in human-readable terms, not just raw JSON
- Route, schedule, log sheet, and export controls in predictable locations

## JD Alignment

The implementation should make the evaluator see these strengths quickly:

- `React + MUI`: Use MUI components for the main workspace, form controls, tabs, alerts, progress states, tables, and buttons.
- `Django + DRF`: Expose clean REST endpoints with serializers, validation, and focused service modules.
- `Algorithmic logic`: Keep the HOS scheduler in a pure Python domain module with tests for edge cases.
- `Business rules in UI`: Show why each stop/rest was inserted and which HOS rule caused it.
- `Performance instincts`: Cache geocoding results in Postgres, add request timeouts, avoid repeated route calls, and keep route/log payloads shaped for the UI.
- `Pragmatic shipping`: Build a complete vertical slice early, then iterate on accuracy and polish.

## Deployment

Local:

- Docker Compose Postgres
- Django API on port `8000`
- Vite React app on port `5173`

Hosted:

- Backend on Render, Railway, Fly.io, or similar
- Managed Postgres
- Frontend on Vercel or Netlify
- `DATABASE_URL` required
- CORS configured for the frontend domain

## API

`POST /api/trips/plan/` creates a trip plan.

`GET /api/trips/{id}/` returns a saved plan.

`GET /api/trips/{id}/pdf/` downloads the rendered PDF.

`GET /api/health/` returns service and database readiness.

## Progress

Current status as of `2026-05-19`:

- Completed: Postgres-only local runtime with Docker Compose
- Completed: Django project wiring, DRF install, `TripRequest` model, and migrations
- Completed: `POST /api/trips/plan/`, `GET /api/trips/{id}/`, and `GET /api/health/`
- Completed: Vite React scaffold from official docs
- Completed: Material UI workspace shell with form submission and result tabs
- Completed: backend tests for API contract and request validation
- Completed: frontend production build verification
- Completed: replace the deterministic placeholder schedule with a real HOS scheduler
- Completed: scheduler tests for break insertion, second-shift rollover, and cycle restart behavior
- In progress: geocoding and routing adapters with cache
- Pending: map rendering, daily log drawing, and PDF export

Current live local URLs:

- Frontend: `http://127.0.0.1:5173/`
- Backend: `http://127.0.0.1:8000/`

Current technical posture:

- The vertical slice is working end to end.
- The API contract is stable enough for the frontend to keep moving.
- The HOS engine is now the source of truth for the generated schedule.
- The next highest-value step is routing and geocoding, because the schedule is live but the route shape is still static.

## Implementation Plan

1. Build the tracer bullet:
   - MUI trip form
   - `POST /api/trips/plan/`
   - Postgres-backed `TripRequest`
   - simple deterministic placeholder schedule response

2. Replace the placeholder with the tested HOS scheduler:
   - Isolated Python service module
   - Contract checks for invalid cycle hours, negative durations, and impossible daily totals
   - Unit tests for 30-minute break, 11-hour limit, 14-hour window, and 70-hour cap

3. Add route and geocoding adapters:
   - Cached geocode records
   - OSRM route wrapper
   - Timeouts and graceful API failure messages

4. Build the full MUI workspace:
   - Responsive shell
   - Map panel
   - Schedule timeline/table
   - Daily logs tab
   - Export panel

5. Add PDF export:
   - Backend PDF generated from `DailyLog`
   - Same event data as on-screen logs

6. Verify:
   - Django tests for scheduler and API validation
   - Frontend build
   - Manual sample trips covering short and multi-day routes
   - Deployment checklist with required environment variables

## Pragmatic Quality Bar

Current plan score: `8.5/10`.

To reach `10/10`, the implementation must preserve these constraints:

- HOS rules have one source of truth in the scheduler.
- External APIs are wrapped behind adapters, not called directly from views or React.
- The first working slice is production code, not a throwaway prototype.
- Every generated daily log totals exactly 24 hours.
- The UI explains system state and failures without requiring the user to inspect developer tools.
