#!/usr/bin/env bash
# One-time AWS setup for the backend (Lambda + Function URL), DB backups (S3)
# and GitHub Actions deploys (OIDC role). Safe to re-run: existing resources
# are reused, and an existing Lambda keeps its environment (incl. SECRET_KEY).
#
# Usage (from the repo root, in Git Bash):
#   FRONTEND_ORIGIN=https://your-app.vercel.app ./deploy/bootstrap-aws.sh
#
# Reads DATABASE_URL from backend/.env.production (git-ignored).
# See deploy/README.md for the full runbook.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: do not rewrite arguments that look like paths

export AWS_PROFILE="${AWS_PROFILE:-techthrive}"
# London, next to the Neon database (every query crosses this link).
export AWS_REGION="${AWS_REGION:-eu-west-2}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_PAGER=""

APP="techthrive-backend"
GITHUB_REPO="${GITHUB_REPO:-techthrive46/techthrive-dash}"
# Not "production": Vercel already created a "Production" environment in this repo,
# and GitHub environment names are case-insensitive.
GITHUB_ENVIRONMENT="${GITHUB_ENVIRONMENT:-backend-production}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:?Set FRONTEND_ORIGIN, e.g. https://techthrive-dash.vercel.app}"
PREVIEW_ORIGIN_REGEX="${PREVIEW_ORIGIN_REGEX:-}"
ENV_FILE="${ENV_FILE:-backend/.env.production}"
PYTHON="$(command -v python3 || command -v python)"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (needs a DATABASE_URL=... line)"; exit 1; }
DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | tr -d '\r' | head -1)"
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL in $ENV_FILE"; exit 1; }
export DATABASE_URL FRONTEND_ORIGIN PREVIEW_ORIGIN_REGEX

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
CALLER="$(aws sts get-caller-identity --query Arn --output text)"
BACKUP_BUCKET="${BACKUP_BUCKET:-techthrive-db-backups-$ACCOUNT_ID}"
ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE="$ECR_REGISTRY/$APP:bootstrap-$(date +%Y%m%d%H%M%S)"
EXEC_ROLE="$APP-lambda"
DEPLOY_ROLE="$APP-github-deploy"

cat <<INFO
About to set up:
  AWS account     $ACCOUNT_ID ($CALLER)
  Region          $AWS_REGION
  Lambda / ECR    $APP
  Backup bucket   $BACKUP_BUCKET
  GitHub repo     $GITHUB_REPO (environment: $GITHUB_ENVIRONMENT)
  Frontend origin $FRONTEND_ORIGIN
INFO
if [ "${ASSUME_YES:-}" != "1" ]; then
  read -r -p "Continue? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || exit 1
fi

exists() { "$@" >/dev/null 2>&1; }
step() { printf '\n==> %s\n' "$*"; }

step "ECR repository"
exists aws ecr describe-repositories --repository-names "$APP" \
  || aws ecr create-repository --repository-name "$APP" \
       --image-scanning-configuration scanOnPush=true >/dev/null
# Keep only the 10 newest images so storage stays within pennies.
aws ecr put-lifecycle-policy --repository-name "$APP" --lifecycle-policy-text '{
  "rules": [{"rulePriority": 1, "description": "Keep last 10 images",
    "selection": {"tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10},
    "action": {"type": "expire"}}]}' >/dev/null

step "Lambda execution role"
if ! exists aws iam get-role --role-name "$EXEC_ROLE"; then
  aws iam create-role --role-name "$EXEC_ROLE" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$EXEC_ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "Waiting for the new role to propagate..."
  sleep 15
fi
EXEC_ROLE_ARN="$(aws iam get-role --role-name "$EXEC_ROLE" --query Role.Arn --output text)"

step "Build and push the backend image"
aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY"
# --provenance=false: Lambda rejects the multi-manifest images buildx makes by default.
docker build --platform linux/amd64 --provenance=false -t "$IMAGE" backend
docker push "$IMAGE"

step "Run database migrations against Neon"
docker run --rm --entrypoint python \
  -e DATABASE_URL -e DEBUG=False -e SECRET_KEY=migrate-only \
  "$IMAGE" manage.py migrate --noinput

step "Lambda function"
if exists aws lambda get-function --function-name "$APP"; then
  echo "Exists: updating code only (environment variables are left as they are)."
  aws lambda update-function-code --function-name "$APP" --image-uri "$IMAGE" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$APP"
else
  # Built with Python so values containing &, ?, = (DATABASE_URL) are JSON-escaped.
  ENVIRONMENT_JSON="$("$PYTHON" deploy/lambda-environment.py)"
  aws lambda create-function --function-name "$APP" \
    --package-type Image --code "ImageUri=$IMAGE" \
    --role "$EXEC_ROLE_ARN" --architectures x86_64 \
    --memory-size 1024 --timeout 30 \
    --environment "$ENVIRONMENT_JSON" >/dev/null
  aws lambda wait function-active-v2 --function-name "$APP"
fi

step "Public HTTPS Function URL"
exists aws lambda get-function-url-config --function-name "$APP" \
  || aws lambda create-function-url-config --function-name "$APP" --auth-type NONE >/dev/null
# Public URLs need both permissions; the second only applies to calls made via the URL.
exists aws lambda add-permission --function-name "$APP" \
  --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl \
  --principal "*" --function-url-auth-type NONE || true
exists aws lambda add-permission --function-name "$APP" \
  --statement-id FunctionURLInvokeAllowPublicAccess --action lambda:InvokeFunction \
  --principal "*" --invoked-via-function-url || true
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$APP" --query FunctionUrl --output text)"

step "S3 bucket for database backups"
if ! exists aws s3api head-bucket --bucket "$BACKUP_BUCKET"; then
  aws s3api create-bucket --bucket "$BACKUP_BUCKET" \
    --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
fi
aws s3api put-public-access-block --bucket "$BACKUP_BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET" --lifecycle-configuration '{
  "Rules": [{"ID": "expire-old-backups", "Status": "Enabled",
    "Filter": {"Prefix": "db/"}, "Expiration": {"Days": 30}}]}'

step "GitHub Actions OIDC provider and deploy role"
OIDC_ARN="arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
exists aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" \
  || aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
       --client-id-list sts.amazonaws.com \
       --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null

# GitHub may send the subject as repo:owner/repo:... or, in its newer format,
# with immutable IDs (repo:owner@123/repo@456:...). Trust both.
SUBJECTS='"repo:'"$GITHUB_REPO"':environment:'"$GITHUB_ENVIRONMENT"'"'
GITHUB_OWNER_ID="${GITHUB_OWNER_ID:-$(gh api "repos/$GITHUB_REPO" --jq .owner.id 2>/dev/null || true)}"
GITHUB_REPO_ID="${GITHUB_REPO_ID:-$(gh api "repos/$GITHUB_REPO" --jq .id 2>/dev/null || true)}"
if [ -n "$GITHUB_OWNER_ID" ] && [ -n "$GITHUB_REPO_ID" ]; then
  SUBJECTS="$SUBJECTS"', "repo:'"${GITHUB_REPO%%/*}@$GITHUB_OWNER_ID/${GITHUB_REPO#*/}@$GITHUB_REPO_ID"':environment:'"$GITHUB_ENVIRONMENT"'"'
else
  echo "Warning: could not look up GitHub IDs (install gh or set GITHUB_OWNER_ID/GITHUB_REPO_ID);"
  echo "         the deploy role will only trust the legacy OIDC subject format."
fi
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "'"$OIDC_ARN"'"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {"StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": ['"$SUBJECTS"']
    }}
  }]
}'
if exists aws iam get-role --role-name "$DEPLOY_ROLE"; then
  aws iam update-assume-role-policy --role-name "$DEPLOY_ROLE" --policy-document "$TRUST_POLICY"
else
  aws iam create-role --role-name "$DEPLOY_ROLE" --assume-role-policy-document "$TRUST_POLICY" >/dev/null
fi

DEPLOY_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"},
    {"Effect": "Allow", "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"],
      "Resource": "arn:aws:ecr:'"$AWS_REGION"':'"$ACCOUNT_ID"':repository/'"$APP"'"},
    {"Effect": "Allow", "Action": [
        "lambda:UpdateFunctionCode", "lambda:GetFunction",
        "lambda:GetFunctionConfiguration", "lambda:GetFunctionUrlConfig"],
      "Resource": "arn:aws:lambda:'"$AWS_REGION"':'"$ACCOUNT_ID"':function:'"$APP"'"},
    {"Effect": "Allow", "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::'"$BACKUP_BUCKET"'/db/*"}
  ]
}'
aws iam put-role-policy --role-name "$DEPLOY_ROLE" --policy-name deploy --policy-document "$DEPLOY_POLICY"
DEPLOY_ROLE_ARN="$(aws iam get-role --role-name "$DEPLOY_ROLE" --query Role.Arn --output text)"

step "Smoke test"
curl -fsS --retry 5 --retry-all-errors --retry-delay 3 "${FUNCTION_URL}api/health/" && echo

cat <<DONE

Done. Next steps (also in deploy/README.md):

  Backend URL:   $FUNCTION_URL
  Vercel:        set NEXT_PUBLIC_API_URL=${FUNCTION_URL%/} and redeploy the frontend.

  GitHub ($GITHUB_REPO -> Settings -> Environments -> "$GITHUB_ENVIRONMENT"):
    secret   AWS_DEPLOY_ROLE_ARN = $DEPLOY_ROLE_ARN
    secret   DATABASE_URL        = (the same value as in $ENV_FILE)
    variable AWS_REGION          = $AWS_REGION
    variable BACKUP_BUCKET       = $BACKUP_BUCKET
DONE
