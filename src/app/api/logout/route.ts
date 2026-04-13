import { NextResponse } from "next/server";

import { COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: Request) {
  const url = new URL("/", request.url);
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete(COOKIE_NAME);
  return res;
}
