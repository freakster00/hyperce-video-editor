import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  createAuthToken,
  readAuthCredentials
} from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  const expected = readAuthCredentials();

  if (!expected.username || !expected.password) {
    return NextResponse.json(
      { error: "Signin is not configured. Set AUTH_USERNAME and AUTH_PASSWORD." },
      { status: 500 }
    );
  }

  if (username !== expected.username || password !== expected.password) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true, username });
  response.cookies.set(AUTH_COOKIE_NAME, await createAuthToken(username), authCookieOptions());
  return response;
}
