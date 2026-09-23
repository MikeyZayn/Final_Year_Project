# THEMBA runnable system

```
themba_host/
  backend/     Django API (accounts + transport)
  frontend/    React + Google Maps UI
```

## Backend

```bash
cd backend
# edit .env → set ORS_API_KEY= if you have one
./run_host.sh
# or Windows: python -m venv .venv && .venv\Scripts\activate
#   pip install -r requirements.txt
#   python manage.py makemigrations accounts transport
#   python manage.py migrate
#   python manage.py seed_themba
#   daphne -b 127.0.0.1 -p 8000 themba_project.asgi:application
```

## Frontend

```bash
cd frontend
# edit .env → set VITE_GOOGLE_MAPS_API_KEY=
./run_frontend.sh
# or: npm install && npm run dev
```

Open http://127.0.0.1:5173

Demo password: **themba123**  
Accounts: passenger_demo | driver_demo | operator_demo | admin_demo

## API keys

| Key | File |
|-----|------|
| `ORS_API_KEY` | `backend/.env` |
| `VITE_GOOGLE_MAPS_API_KEY` | `frontend/.env` |
