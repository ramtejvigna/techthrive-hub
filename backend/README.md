# TechThrive Dashboard — Backend

Django REST API for the TechThrive unified workspace.

## Stack

- Django 5 + Django REST Framework
- JWT authentication (email + password)
- PostgreSQL (production) / SQLite (local fallback)

## Setup

1. Create and activate the virtual environment:

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy environment file and adjust as needed:

```bash
cp .env.example .env
```

4. Run migrations:

```bash
python manage.py migrate
```

5. Start the development server:

```bash
python manage.py runserver
```

API runs at `http://localhost:8000`.

## Docker (PostgreSQL)

From the repo root with Docker running:

```bash
docker compose up db -d
```

Set `DATABASE_URL=postgres://techthrive:devpassword@localhost:5432/techthrive` in `.env`, then run migrations.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/` | Register account |
| POST | `/api/auth/login/` | Login (returns JWT) |
| POST | `/api/auth/refresh/` | Refresh access token |
| GET | `/api/auth/me/` | Current user |
| GET/POST | `/api/projects/` | Projects |
| GET/PATCH/DELETE | `/api/projects/{id}/` | Project detail |
| GET/POST | `/api/projects/{id}/milestones/` | Milestones |
| GET/POST | `/api/boards/` | Kanban boards |
| GET/PATCH/DELETE | `/api/boards/{id}/` | Board detail |
| PATCH | `/api/boards/{id}/reorder/` | Reorder columns/cards |
| POST | `/api/boards/cards/` | Create card |
| GET | `/api/dashboard/summary/` | Dashboard stats |
