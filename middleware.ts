import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/server/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const payload = await verifyAuthToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const isAuthenticated = Boolean(payload);

  if (pathname === "/signin") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const signinUrl = new URL("/signin", request.url);
    signinUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signinUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/signin", "/api/sora/:path*"]
};
