# Sanity CMS Setup Guide

## Overview

Sanity is a **zero-cost CMS** for your use case (free tier includes unlimited API requests, 3 users, and 10GB assets). It's a modern headless CMS with a powerful Studio (admin interface) embedded in your Next.js app.

## Step 1: Create Sanity Project

1. Visit [sanity.io/manage](https://sanity.io/manage) and sign up (free account)
2. Click **"Create New Project"**
3. Choose a project name (e.g., "TechThrive CMS")
4. Note your **Project ID** (e.g., `abc123xyz`)
5. Keep the **Dataset** as `production`

## Step 2: Add Environment Variables

**Local (.env.local):**

```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_SANITY_DATASET=production
```

**Vercel (Production):**

Go to your Vercel project → Settings → Environment Variables, and add:
- `NEXT_PUBLIC_SANITY_PROJECT_ID` = your project ID
- `NEXT_PUBLIC_SANITY_DATASET` = `production`

Redeploy after adding these.

## Step 3: Deploy Schemas

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open `http://localhost:3000/studio`

3. **Log in with Sanity** when prompted (uses your free Sanity account)

4. Schemas (Docs + Plans) are automatically deployed to your Sanity project

## Step 4: Configure CORS

1. Go to [sanity.io/manage](https://sanity.io/manage)
2. Select your project
3. Click **API** → **CORS Origins**
4. Add these origins:
   - `http://localhost:3000` (for local dev)
   - `https://techthrive-dash.vercel.app` (your Vercel domain)
   - Check **"Allow credentials"**

## Step 5: Create Content

1. Visit `http://localhost:3000/studio` (or `/studio` on production)
2. Click **"Docs"** or **"Plans"** to create new content
3. Fill in the fields and click **"Publish"**

## Routes

| Route | Description |
|-------|-------------|
| `/studio` | Sanity Studio (CMS admin) |
| `/docs` | Docs listing (fetched from Sanity) |
| `/docs/[slug]` | Doc detail page |
| `/plans` | Plans listing (fetched from Sanity) |
| `/plans/[slug]` | Plan detail page |

## Content Structure

### Docs
- Title, slug, description
- Tags (array of strings)
- Published date
- Rich text body (Portable Text with code blocks, headings, links)

### Plans
- Title, slug, summary
- Status (draft/planned/active/completed)
- Published date
- Rich text body (Portable Text with code blocks, headings, links)

## Migrating from Markdown

The old markdown files in `content/docs` and `content/plans` can be:
1. Manually re-created in Sanity Studio (copy/paste content), or
2. Left as-is if you want to keep them for reference

Once you have content in Sanity, the `/docs` and `/plans` pages will automatically fetch from Sanity instead of markdown.

## Free Tier Limits

Sanity's free tier includes:
- **Unlimited API requests** (no rate limits for your use case)
- **3 admin users** (free accounts)
- **10GB hosted assets** (images, files)
- **1 dataset**

This is more than enough for TechThrive's docs and plans. No credit card required.

## Troubleshooting

**"Configuration invalid" error:**
- Check that `NEXT_PUBLIC_SANITY_PROJECT_ID` is set correctly in `.env.local` or Vercel

**Cannot log in to Studio:**
- Ensure CORS origins are configured in Sanity dashboard
- Try clearing browser cache and cookies

**Content not showing:**
- Check that schemas are deployed (visit `/studio` and log in)
- Verify environment variables in Vercel

## Removing Decap CMS (Optional)

If you no longer need Decap CMS, you can:
1. Remove `public/admin/` folder
2. Remove `decap-cms-app` from `package.json`
3. Remove Decap-related routes from `vercel.json` and `next.config.ts`
4. Remove `app/api/auth` and `app/api/callback` folders
