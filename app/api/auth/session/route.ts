import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const payload = await verifyAuthToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, username: payload.email });
}
