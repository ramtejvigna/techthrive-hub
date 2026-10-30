# Deployment

Internal tool for a handful of users, so the setup aims for **about $1/month** with no servers to look after.

```
Vercel (frontend)  ──HTTPS──▶  AWS Lambda + Function URL (Django)  ──SSL──▶  Neon Postgres
```

| Part | Where | Cost |
|---|---|---|
| Frontend | Vercel | Free (Hobby) |
| Backend | AWS Lambda (container image, via [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)) | Free tier: 1M requests + 400k GB-s/month |
| Images | Amazon ECR (last 10 kept) | Cents |
| Database | Neon (free plan) | Free |
| Backups | S3, nightly `pg_dump`, kept 30 days | Cents |

**Database region:** the Neon project is in London (`eu-west-2`) and the backend is in Mumbai (`ap-south-1`), a choice made at setup time. Each query crosses that link, so warm API calls measured at launch were about **0.5–0.7 s** (`/api/projects/`, `/api/boards/`) and about **1.2 s** (`/api/dashboard/summary/`). If that feels slow, create a Neon project in the region nearest the backend, move the data with `pg_dump`/`pg_restore` (see *Restore a backup*), and update `DATABASE_URL` in Lambda and in GitHub.

**Trade-off:** after the app has been idle, the first request takes about 2–4 s (Lambda cold start plus Neon waking up). After that it's normal speed. Don't add a "keep warm" ping that touches the database: it would keep Neon awake and use up its free compute allowance. `/api/health/` never touches the database.

## One-time setup

You need: Docker running, the AWS CLI with a `techthrive` profile (`aws configure --profile techthrive`), Git Bash (on Windows), and admin rights on the GitHub repo.

1. **Neon**: create a project and copy the **direct** connection string (host *without* `-pooler`). Put it in `backend/.env.production`, which git ignores:

   ```
   DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
   ```

   Keep the backend in, or near, the Neon region. Every query crosses that link.

2. **AWS**: from the repo root:

   ```bash
   FRONTEND_ORIGIN=https://techthrive-dash.vercel.app \
   PREVIEW_ORIGIN_REGEX='^https://techthrive-dash-[a-z0-9-]+\.vercel\.app$' \
   ./deploy/bootstrap-aws.sh
   ```

   It creates the ECR repository, the Lambda function with a public HTTPS Function URL, the S3 backup bucket, and a GitHub OIDC deploy role. It also builds and pushes the image, runs migrations against Neon, and ends by printing the backend URL and the values for the next two steps. It's safe to re-run. Optional overrides: `AWS_PROFILE` (default `techthrive`), `AWS_REGION` (default `ap-south-1`), `GITHUB_REPO`, `BACKUP_BUCKET`.

3. **GitHub**: in the repo's Settings → Environments, create **`backend-production`** and add the values below. (Not `production`: Vercel already made a `Production` environment, and GitHub environment names aren't case-sensitive.) This needs admin rights on the repo.

   | Type | Name | Value |
   |---|---|---|
   | Secret | `AWS_DEPLOY_ROLE_ARN` | Printed by the bootstrap |
   | Secret | `DATABASE_URL` | Same as `backend/.env.production` |
   | Variable | `AWS_REGION` | e.g. `ap-south-1` |
   | Variable | `BACKUP_BUCKET` | Printed by the bootstrap |

4. **Vercel**: set `NEXT_PUBLIC_API_URL` to the backend URL, with no trailing slash, and redeploy. Keep the Sanity variables; Plans still uses Sanity.

5. **Accounts**: everyone signs up on the live site. Then close sign-ups:

   ```bash
   aws lambda update-function-configuration --profile techthrive --function-name techthrive-backend \
     --environment "$(aws lambda get-function-configuration --profile techthrive --function-name techthrive-backend \
       --query Environment --output json | python -c 'import json,sys; e=json.load(sys.stdin); e["Variables"]["ALLOW_REGISTRATION"]="False"; print(json.dumps(e))')"
   ```

   (Or edit it in the Lambda console: Configuration → Environment variables.) With sign-ups closed, only the very first user can register on an empty database.

## Realtime notifications

Notifications (assignments, comments, @mentions, status changes, project membership) are always saved and listed over the normal API. A WebSocket only tells the browser that a new one arrived, so it shows up immediately instead of on the next refresh.

```
Browser ──wss──▶ API Gateway WebSocket API ──$connect/$disconnect (HTTPS)──▶ Lambda (Django)
   ▲                         │                                                    │
   └─────── message ─────────┴──────────── POST /@connections/{id} ◀─────────────┘
```

Lambda Function URLs can't hold sockets open, so API Gateway holds them. It calls Django when a socket opens or closes, with no extra Lambda, and Django posts messages back through the gateway.

**Setup**, once, after the bootstrap. From the repo root:

```bash
./deploy/setup-websocket.sh
```

It creates the `techthrive-backend-ws` WebSocket API, lets the Lambda role push to connections, and adds `WEBSOCKET_PUBLIC_URL`, `WEBSOCKET_MANAGEMENT_URL` and `WEBSOCKET_SHARED_SECRET` to the Lambda environment. Vercel needs no change, because the browser gets the socket URL from the backend. It's safe to re-run, and it keeps the existing secret.

**Cost:** for a handful of users, cents. The API Gateway free tier covers 1M messages and 750k connection-minutes a month for the first year; after that it's $1 per million messages plus $0.25 per million connection-minutes. Each open tab is one connection.

**Behaviour to know:**
- **Visible tabs only.** Browsers keep a socket open only while the tab is visible. A hidden tab disconnects, so an idle tab doesn't keep Neon awake. Coming back reconnects and catches up.
- **Reconnects.** API Gateway closes idle sockets after 10 minutes and every socket after 2 hours. The browser reconnects by itself, and each reconnect is one quick request to the backend.
- **Fallback.** Without the three variables (or while the socket is down) the bell refreshes every minute instead.

**Turn it off:** remove the three `WEBSOCKET_*` variables from the Lambda environment. Delete the API with `aws apigatewayv2 delete-api --api-id ID`.

## Everyday deploys

Merging to `main` with changes under `backend/` runs **Deploy backend**. It builds the image, runs migrations, updates the Lambda and checks `/api/health/`. You can also run it by hand from the Actions tab. Migrations run *before* the code switch, so keep them backward compatible with the version that's live.

Frontend deploys stay with Vercel's Git integration.

## Operations

- **Logs**: CloudWatch → Log groups → `/aws/lambda/techthrive-backend`.
- **Change a setting**: Lambda console → Configuration → Environment variables. Changes apply to the next cold start.
- **Rotate `SECRET_KEY`**: change it in the Lambda environment. Everyone gets logged out.
- **Backups**: **Backup database** runs nightly at 02:00 IST and can be run by hand. GitHub pauses scheduled workflows in repos with no activity for 60 days; re-enable it from the Actions tab if that happens.
- **Restore a backup**:

  ```bash
  aws s3 cp s3://BACKUP_BUCKET/db/FILE.dump . --profile techthrive
  docker run --rm -i -e DATABASE_URL postgres:18 \
    sh -c 'pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL"' < FILE.dump
  ```

- **Move off Lambda later** (e.g. if cold starts start to bother anyone): the same image runs anywhere that runs containers (Lightsail, ECS, a VM) with no code changes, because outside Lambda the entrypoint runs migrations itself.
