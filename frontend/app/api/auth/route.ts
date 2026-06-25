import { NextResponse } from "next/server";

function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "https://techthrive-dash.vercel.app";
  return url.replace(/\/$/, "");
}

export async function GET() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_OAUTH_CLIENT_ID is not configured." },
      { status: 500 },
    );
  }

  const siteUrl = getSiteUrl();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${siteUrl}/api/callback`,
    scope: "repo,user",
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
}
