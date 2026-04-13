import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  let session: { email: string } | null;
  try {
    session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (session) {
    return NextResponse.next();
  }
  const login = new URL("/", request.url);
  const dest = request.nextUrl.pathname + request.nextUrl.search;
  login.searchParams.set("next", dest);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/dashboard", "/api/dashboard/:path*"],
};
