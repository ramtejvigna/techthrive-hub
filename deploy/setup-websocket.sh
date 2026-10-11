#!/usr/bin/env bash
# Realtime notifications: an API Gateway WebSocket API in front of the
# existing Lambda. Run after bootstrap-aws.sh. Safe to re-run: resources are
# reused and the shared secret is kept.
#
# API Gateway holds the sockets. Its $connect/$disconnect routes call Django
# over HTTP (no extra Lambda), passing the connection id, the client's ticket
# and a shared secret as headers. Django pushes messages back through the
# gateway's management API, which the Lambda role is allowed to call.
#
# Usage (from the repo root, in Git Bash):
#   ./deploy/setup-websocket.sh
# See deploy/README.md ("Realtime notifications").
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: do not rewrite arguments that look like paths

export AWS_PROFILE="${AWS_PROFILE:-techthrive}"
# London, next to the Neon database (every query crosses this link).
export AWS_REGION="${AWS_REGION:-eu-west-2}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_PAGER=""

APP="techthrive-backend"
WS_API_NAME="$APP-ws"
STAGE="prod"
PYTHON="$(command -v python3 || command -v python)"

exists() { "$@" >/dev/null 2>&1; }
step() { printf '\n==> %s\n' "$*"; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
if ! exists aws lambda get-function --function-name "$APP"; then
  echo "No Lambda function '$APP' in $AWS_REGION (profile $AWS_PROFILE)."
  echo "Set AWS_REGION to the backend's region, e.g. AWS_REGION=eu-west-2 $0"
  exit 1
fi
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$APP" --query FunctionUrl --output text)"
EXEC_ROLE="$(aws lambda get-function-configuration --function-name "$APP" --query Role --output text)"
EXEC_ROLE="${EXEC_ROLE##*/}"

cat <<INFO
About to set up realtime notifications:
  AWS account   $ACCOUNT_ID
  Region        $AWS_REGION
  WebSocket API $WS_API_NAME (stage: $STAGE)
  Backend       $FUNCTION_URL
INFO
if [ "${ASSUME_YES:-}" != "1" ]; then
  read -r -p "Continue? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || exit 1
fi

step "Shared secret"
CURRENT_ENV="$(aws lambda get-function-configuration --function-name "$APP" --query Environment --output json)"
WS_SECRET="$(printf '%s' "$CURRENT_ENV" | "$PYTHON" -c '
import json, secrets, sys
env = (json.load(sys.stdin) or {}).get("Variables", {})
print(env.get("WEBSOCKET_SHARED_SECRET") or secrets.token_urlsafe(32))')"
# Gateway static values are single-quoted literals, so keep the secret URL-safe.
case "$WS_SECRET" in *"'"*) echo "WEBSOCKET_SHARED_SECRET must not contain quotes"; exit 1 ;; esac
echo "Ready (kept if it already existed)."

step "WebSocket API"
API_ID="$(aws apigatewayv2 get-apis --query "Items[?Name=='$WS_API_NAME'].ApiId | [0]" --output text)"
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID="$(aws apigatewayv2 create-api --name "$WS_API_NAME" --protocol-type WEBSOCKET \
    --route-selection-expression '$request.body.action' --query ApiId --output text)"
fi
echo "API id: $API_ID"

# upsert_integration NAME PATH PARAMETERS_JSON -> prints the integration id
upsert_integration() {
  local uri="${FUNCTION_URL}api/notifications/ws/$2/" id
  id="$(aws apigatewayv2 get-integrations --api-id "$API_ID" \
    --query "Items[?IntegrationUri=='$uri'].IntegrationId | [0]" --output text)"
  if [ -z "$id" ] || [ "$id" = "None" ]; then
    id="$(aws apigatewayv2 create-integration --api-id "$API_ID" \
      --integration-type HTTP_PROXY --integration-method POST --integration-uri "$uri" \
      --request-parameters "$3" --query IntegrationId --output text)"
  else
    aws apigatewayv2 update-integration --api-id "$API_ID" --integration-id "$id" \
      --request-parameters "$3" >/dev/null
  fi
  echo "$id"
}

# upsert_route ROUTE_KEY INTEGRATION_ID [ROUTE_REQUEST_PARAMETERS_JSON]
upsert_route() {
  local id params=()
  [ -n "${3:-}" ] && params=(--request-parameters "$3")
  id="$(aws apigatewayv2 get-routes --api-id "$API_ID" \
    --query "Items[?RouteKey=='$1'].RouteId | [0]" --output text)"
  if [ -z "$id" ] || [ "$id" = "None" ]; then
    aws apigatewayv2 create-route --api-id "$API_ID" --route-key "$1" \
      --target "integrations/$2" "${params[@]}" >/dev/null
  else
    aws apigatewayv2 update-route --api-id "$API_ID" --route-id "$id" \
      --target "integrations/$2" "${params[@]}" >/dev/null
  fi
}

step "Routes: \$connect and \$disconnect call Django"
CONNECT_PARAMS='{
  "integration.request.header.X-Connection-Id": "context.connectionId",
  "integration.request.header.X-WS-Ticket": "route.request.querystring.ticket",
  "integration.request.header.X-WS-Secret": "'"'$WS_SECRET'"'"
}'
DISCONNECT_PARAMS='{
  "integration.request.header.X-Connection-Id": "context.connectionId",
  "integration.request.header.X-WS-Secret": "'"'$WS_SECRET'"'"
}'
CONNECT_ID="$(upsert_integration connect connect "$CONNECT_PARAMS")"
DISCONNECT_ID="$(upsert_integration disconnect disconnect "$DISCONNECT_PARAMS")"
upsert_route '$connect' "$CONNECT_ID" '{"route.request.querystring.ticket": {"Required": false}}'
upsert_route '$disconnect' "$DISCONNECT_ID"

step "Stage and deployment"
exists aws apigatewayv2 get-stage --api-id "$API_ID" --stage-name "$STAGE" \
  || aws apigatewayv2 create-stage --api-id "$API_ID" --stage-name "$STAGE" >/dev/null
aws apigatewayv2 create-deployment --api-id "$API_ID" --stage-name "$STAGE" >/dev/null
PUBLIC_URL="wss://$API_ID.execute-api.$AWS_REGION.amazonaws.com/$STAGE"
MANAGEMENT_URL="https://$API_ID.execute-api.$AWS_REGION.amazonaws.com/$STAGE"

step "Let the Lambda push to open connections"
aws iam put-role-policy --role-name "$EXEC_ROLE" --policy-name websocket-push --policy-document '{
  "Version": "2012-10-17",
  "Statement": [{"Effect": "Allow", "Action": "execute-api:ManageConnections",
    "Resource": "arn:aws:execute-api:'"$AWS_REGION"':'"$ACCOUNT_ID"':'"$API_ID"'/'"$STAGE"'/POST/@connections/*"}]
}'

step "Lambda environment"
NEW_ENV="$(printf '%s' "$CURRENT_ENV" | \
  PUBLIC_URL="$PUBLIC_URL" MANAGEMENT_URL="$MANAGEMENT_URL" WS_SECRET="$WS_SECRET" "$PYTHON" -c '
import json, os, sys
env = json.load(sys.stdin) or {}
variables = env.setdefault("Variables", {})
variables.update({
    "WEBSOCKET_PUBLIC_URL": os.environ["PUBLIC_URL"],
    "WEBSOCKET_MANAGEMENT_URL": os.environ["MANAGEMENT_URL"],
    "WEBSOCKET_SHARED_SECRET": os.environ["WS_SECRET"],
})
print(json.dumps({"Variables": variables}))')"
aws lambda update-function-configuration --function-name "$APP" --environment "$NEW_ENV" >/dev/null
aws lambda wait function-updated-v2 --function-name "$APP"

cat <<DONE

Done. Realtime notifications are on:
  WebSocket URL  $PUBLIC_URL
  Push endpoint  $MANAGEMENT_URL

Browsers get the WebSocket URL from the backend, so Vercel needs no change.
Check it: open the app, then the bell should say "live" in its panel.
DONE
