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
| `/docs` | CMS-powered docs listing |
| `/docs/[slug]` | Doc detail page |
| `/plans` | CMS-powered plans listing |
| `/plans/[slug]` | Plan detail page |
| `/admin` | Decap CMS admin |

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — ESLint

## Decap CMS (Docs + Plans)

This project includes Decap CMS configured for Markdown-backed content:

- Docs collection: `content/docs/*.md`
- Plans collection: `content/plans/*.md`
- Admin UI: `/admin` (`public/admin/index.html`)
- Config: `public/admin/config.yml`

### First-time setup

1. Confirm `public/admin/config.yml` points to your repo and Vercel domain.
2. Create a GitHub OAuth App:
   - Homepage URL: `https://techthrive-dash.vercel.app`
   - Authorization callback URL: `https://techthrive-dash.vercel.app/api/callback`
3. Add these environment variables in **Vercel** (Project → Settings → Environment Variables):
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `NEXT_PUBLIC_SITE_URL` = `https://techthrive-dash.vercel.app`
4. Redeploy the frontend on Vercel after saving env vars.
5. Open `https://techthrive-dash.vercel.app/admin` and log in with GitHub.

> **Note:** OAuth runs on Vercel (`/api/auth`, `/api/callback`), not on the Railway Django backend. Railway (`techthrive-hub-production.up.railway.app`) is only for API requests.

### Local CMS editing

For local development, either:

- Edit markdown files directly in `content/docs` and `content/plans`, or
- Temporarily add `local_backend: true` to `config.yml`, then run:

```bash
npm run dev
npx decap-server
```

Open `http://localhost:3000/admin`. Do not commit `local_backend: true` for production.

### Editorial workflow

`publish_mode: editorial_workflow` is enabled. Content edits become draft entries first and can then be reviewed/published from the CMS UI.

### Content frontmatter schema

Docs:

```yaml
title: string
slug: kebab-case string
description: string (optional)
publishedAt: ISO datetime string
tags: string[] (optional)
```

Plans:

```yaml
title: string
slug: kebab-case string
status: draft | planned | active | completed
summary: string (optional)
publishedAt: ISO datetime string
```
