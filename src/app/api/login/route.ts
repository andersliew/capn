import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  COOKIE_NAME,
  MAX_AGE_SEC,
  createSessionToken,
} from "@/lib/auth/session";

const DOMAIN_SUFFIX = "@capnapp.com";

const EXPECTED_PASSWORD =
  process.env.CAPN_DASHBOARD_PASSWORD?.trim() ?? "@Capnapp1";

function sessionSigningConfigured(): boolean {
  return Boolean(process.env.CAPN_SESSION_SECRET?.trim());
}

function validEmail(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t.endsWith(DOMAIN_SUFFIX)) {
    return false;
  }
  const local = t.slice(0, -DOMAIN_SUFFIX.length);
  return local.length > 0 && !t.includes(" ") && !t.includes("\n");
}

function passwordOk(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(EXPECTED_PASSWORD);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !sessionSigningConfigured()) {
    return NextResponse.json(
      {
        error: "Sign-in is not configured on the server.",
        hint: "Add CAPN_SESSION_SECRET to your Vercel project environment variables (any long random string), then redeploy.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body !== "object" || !body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  const email = typeof rec.email === "string" ? rec.email : "";
  const password = typeof rec.password === "string" ? rec.password : "";

  if (!validEmail(email) || !passwordOk(password)) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  let token: string;
  try {
    token = await createSessionToken(email.trim().toLowerCase());
  } catch (e) {
    console.error("[login] createSessionToken", e);
    return NextResponse.json(
      { error: "Could not create session. Check server logs." },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return res;
}
