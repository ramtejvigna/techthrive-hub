# TechThrive Dashboard — Frontend

Next.js 16 app for the TechThrive unified workspace.

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- @dnd-kit for kanban drag-and-drop

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env.local
```

3. Ensure the Django backend is running at `http://localhost:8000`.

4. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

| Route | Description |
|-------|-------------|
| `/login` | Sign in |
| `/register` | Create account |
| `/dashboard` | Home summary |
| `/dashboard/projects` | Project list |
| `/dashboard/projects/[id]` | Project detail + milestones |
| `/dashboard/kanban` | Board list |
| `/dashboard/kanban/[id]` | Kanban board with drag-and-drop |

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — ESLint
