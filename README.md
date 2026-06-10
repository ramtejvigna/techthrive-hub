# TechThrive Hub

Unified workspace bringing together kanban boards, project management, and (future) email, YouTube analytics, and blog tracking.

## Monorepo structure

```
techthrive-hub/
├── backend/     # Django REST API
├── frontend/    # Next.js dashboard
└── docker-compose.yml
```

## Quick start

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000), register an account, and start using the dashboard.

### Docker (PostgreSQL)

```bash
docker compose up db -d
```

Update `backend/.env` with `DATABASE_URL=postgres://techthrive:devpassword@localhost:5432/techthrive` and run migrations.

## MVP features

- Email + password authentication (JWT)
- Dashboard home with summary widgets
- Project management with milestones
- Kanban boards with drag-and-drop
- Optional project ↔ board linking

## Coming soon

- Gmail integration
- YouTube channel analytics
- Blog post tracking
