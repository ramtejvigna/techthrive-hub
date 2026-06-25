import { NextRequest, NextResponse } from "next/server";

function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "https://techthrive-dash.vercel.app";
  return url.replace(/\/$/, "");
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth credentials are not configured.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${getSiteUrl()}/api/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange OAuth code for access token.");
  }

  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(data.error || "No access token returned from GitHub.");
  }

  return data.access_token;
}

function successHtml(token: string): string {
  const payload = JSON.stringify({ token, provider: "github" });
  return `<!doctype html>
<html>
  <body>
    <script>
      (function () {
        const payload = ${payload};
        function receiveMessage(e) {
          window.opener.postMessage(
            "authorization:github:success:" + JSON.stringify(payload),
            e.origin
          );
          window.close();
        }
        window.addEventListener("message", receiveMessage, false);
        window.opener.postMessage("authorizing:github", "*");
      })();
    </script>
  </body>
</html>`;
}

function errorHtml(message: string): string {
  return `<!doctype html>
<html>
  <body>
    <p>Authentication failed: ${message}</p>
    <script>window.close();</script>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return new NextResponse(errorHtml("Missing authorization code."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    const token = await exchangeCodeForToken(code);
    return new NextResponse(successHtml(token), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(errorHtml(message), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
}
