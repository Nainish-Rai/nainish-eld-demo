# Spotter AI HOS Trip Planner

Spotter AI is a full-stack trip-planning assessment project for U.S. property-carrying truck drivers. It turns a current location, pickup, dropoff, departure time, and current 70-hour cycle usage into a route-aware Hours of Service plan, required rest/fuel stops, daily log sheets, and a downloadable ELD-style PDF.

The project is intentionally built as a complete vertical slice: a React + Material UI planner workspace, a Django REST API, live Geoapify/OSRM routing, and a tested Python scheduling engine.

## Why This Exists

Dispatch planning is easy to describe but hard to do honestly. A driver does not just need a route from A to B; they need a plan that respects the 11-hour driving limit, 14-hour duty window, 30-minute break rule, 70-hour / 8-day cycle, pickup/dropoff work, fuel planning, and daily log output.

This repo demonstrates those constraints as working software, not as a mockup.

## Feature Highlights

- Guided trip setup for current location, pickup, dropoff, departure time, and used cycle hours.
- Geoapify location autocomplete in the frontend and Geoapify geocoding in the backend.
- OSRM route geometry and travel estimates for current-to-pickup and pickup-to-dropoff legs.
- Stateless Django REST contract: each plan request resolves, routes, schedules, and returns the result on demand.
- HOS scheduler for the U.S. property-carrying 70-hour / 8-day cycle.
- Inserted compliance stops for breaks, rests, restarts, fuel, pickup, dropoff, and inspections.
- Responsive React + Material UI workspace with route, compliance, logs, and PDF output.
- Browser-generated ELD-style PDF logs using `pdf-lib`, previewed through PDF.js.
- Focused backend tests for API validation, health readiness, scheduling, breaks, cycle limits, and multi-day plans.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | React, Vite, Material UI, MapLibre, PDF.js, `pdf-lib` |
| Backend | Django, Django REST Framework, Python |
| Routing | Geoapify geocoding/autocomplete, OSRM driving routes |
| Runtime | Node.js, Python virtualenv, optional Docker Compose Postgres service |

## Architecture

```text
React + Material UI planner
  -> POST /api/trips/plan/
      -> DRF serializer validation
      -> Geoapify place resolution
      -> OSRM route lookup
      -> Python HOS scheduler
      -> Daily log data
  <- Stateless plan response
      -> Map, schedule, compliance summary, PDF log preview/download
```

The backend does not persist trip plans, route lookups, or PDFs. That makes the API contract clear for assessment: `POST /api/trips/plan/` is the live planning endpoint, and `GET /api/health/` reports whether the external planning dependencies are configured.

## Assessment Walkthrough

For a fast review, look at these paths first:

| What to review | Path |
| --- | --- |
| Planner workspace | `frontend/src/App.jsx` |
| API client and response validation | `frontend/src/api.js` |
| Trip input flow | `frontend/src/components/trip-planner/InputPanels.jsx` |
| Output panels | `frontend/src/components/trip-planner/OutputPanels.jsx` |
| PDF generation | `frontend/src/eldPdf.js` |
| REST endpoints | `backend/trips/views.py` |
| Request validation | `backend/trips/serializers.py` |
| Routing adapter | `backend/trips/routing.py` |
| HOS scheduler | `backend/trips/planner.py` |
| Backend tests | `backend/trips/tests.py` |
| Design notes | `docs/plans/2026-05-19-hos-trip-planner-design.md` |


## Screenshots 

<img width="1460" height="805" alt="image" src="https://github.com/user-attachments/assets/a3001894-5b3f-45b6-99cb-64738a429e64" />
<img width="1468" height="806" alt="image" src="https://github.com/user-attachments/assets/9406ca06-b2c9-4c12-8cc9-7ac586c01799" />


## Requirements

- Python 3.11+
- Node.js 20+
- A Geoapify API key
- Internet access for Geoapify and OSRM route calls
- Docker Desktop only if you want to start the included Postgres service

The current planner path is stateless and does not require a running database. `docker-compose.yml` is included for local Postgres parity if persistence is added later.

## Environment Variables

Backend variables live at the repo root. The Django app does not auto-load `.env`, so export these values in your shell before starting the backend.

```bash
cp .env.example .env
```

Edit `.env`:

```bash
DATABASE_URL=postgresql://spotter:spotter@localhost:5432/spotter_ai
GEOAPIFY_API_KEY=your_geoapify_key
OSRM_BASE_URL=https://router.project-osrm.org
CORS_ALLOWED_ORIGINS=http://localhost:5173
DEBUG=1
SECRET_KEY=dev-only-hos-planner-secret
```

Frontend variables live in `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:8000/api
VITE_GEOAPIFY_API_KEY=your_geoapify_key
VITE_OSRM_BASE_URL=https://router.project-osrm.org
```

`VITE_GEOAPIFY_API_KEY` powers autocomplete. `GEOAPIFY_API_KEY` powers backend geocoding and is required for a ready health check.

## Local Setup

### 1. Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
set -a
source .env
set +a
cd backend
python manage.py test trips
python manage.py runserver 8000
```

Health check:

```bash
curl http://localhost:8000/api/health/
```

Expected ready response:

```json
{
  "status": "ok",
  "mode": "stateless",
  "planner_ready": true,
  "dependencies": {
    "geoapify_api_key_configured": true,
    "osrm_base_url_configured": true
  }
}
```

If `GEOAPIFY_API_KEY` is missing, health returns `503` with `planner_ready: false`.

### 2. Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## API Contract

### `GET /api/health/`

Returns stateless planner readiness and external dependency status.

### `POST /api/trips/plan/`

Creates a plan on demand and returns the generated payload directly.

Example request:

```bash
curl -X POST http://localhost:8000/api/trips/plan/ \
  -H "Content-Type: application/json" \
  -d '{
    "current_location": "Chicago, IL",
    "pickup_location": "Indianapolis, IN",
    "dropoff_location": "Atlanta, GA",
    "departure_at": "2026-05-24T09:00:00Z",
    "current_cycle_used_hours": "12.50"
  }'
```

Successful responses include:

- `mode: "stateless"`
- `status: "planned"`
- `generated_at`
- `plan.route`
- `plan.stops`
- `plan.duty_events`
- `plan.daily_logs`
- `plan.compliance_summary`

Coordinate fields are optional, but latitude and longitude must be sent together for each location. Coordinates are accepted to 6 decimal places.

## Useful Commands

```bash
# Backend tests
source .venv/bin/activate
cd backend
python manage.py test trips

# Frontend development
cd frontend
npm run dev

# Frontend production build
cd frontend
npm run build

# Frontend lint
cd frontend
npm run lint
```

## Project Structure

```text
.
|-- backend/
|   |-- hos_app/              # Django project settings and URLs
|   `-- trips/                # API, routing adapter, HOS planner, tests
|-- frontend/
|   |-- src/
|   |   |-- components/       # Planner UI, route map, PDF preview
|   |   |-- constants/        # Trip input configuration
|   |   |-- api.js            # API client and payload validation
|   |   |-- eldPdf.js         # Browser PDF log generation
|   |   `-- App.jsx           # Planner workspace
|   `-- package.json
|-- docs/plans/               # Design and implementation notes
|-- .env.example              # Backend environment template
`-- docker-compose.yml        # Optional local Postgres service
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `GET /api/health/` returns `503` | Backend key is missing | Export `GEOAPIFY_API_KEY` before running Django |
| Autocomplete is empty | Frontend key is missing | Set `VITE_GEOAPIFY_API_KEY` in `frontend/.env` and restart Vite |
| Frontend says it cannot reach backend | Django is not running or URL mismatch | Start `python manage.py runserver 8000` and confirm `VITE_API_BASE_URL` |
| Plan request returns `502` | Geoapify or OSRM route lookup failed | Check API key, network access, and `OSRM_BASE_URL` |
| Browser blocks API calls | CORS origin mismatch | Add the frontend origin to `CORS_ALLOWED_ORIGINS` |

## Product Story

The shareable one-line version: Spotter AI turns a truck driver's route into a legal HOS plan and FMCSA-style daily logs in one request.

That story matters for the assessment because it is visible in the code:

- Practical value: a dispatcher or driver can understand why every required stop was inserted.
- Public output: the generated PDF logs are a tangible artifact, not just screen state.
- Social currency: the project demonstrates full-stack product judgment instead of a thin CRUD demo.
- Trigger: the workflow maps to a real dispatch moment: "Can this driver legally complete this load?"
- Emotion: the app reduces the anxiety of route legality by making compliance constraints explicit.
- Story: the project is not "React form plus Django API"; it is a driver-first planning tool with an auditable output.

## Current Limitations

- Planning assumptions target U.S. property-carrying drivers on the 70-hour / 8-day cycle.
- Autocomplete is currently tuned for U.S. locations.
- External routing accuracy depends on Geoapify and OSRM availability.
- The planner is intentionally stateless; generated plans and PDFs are not saved server-side.
