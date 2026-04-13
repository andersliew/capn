export const COOKIE_NAME = "capn_session";

/** Session lifetime in seconds (also cookie max-age). */
export const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function getSessionSecret(): string {
  const s = process.env.CAPN_SESSION_SECRET?.trim();
  if (s) {
    return s;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CAPN_SESSION_SECRET is required in production");
  }
  return "dev-capn-session-secret-change-me";
}

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(email: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const body = Buffer.from(JSON.stringify({ email, exp }), "utf8").toString(
    "base64url",
  );
  const key = await getHmacKey();
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const sig = Buffer.from(sigBuf).toString("base64url");
  return `${body}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<{ email: string } | null> {
  if (!token) {
    return null;
  }
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) {
    return null;
  }
  const body = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  try {
    const key = await getHmacKey();
    const sigBuf = Buffer.from(sig, "base64url");
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuf,
      new TextEncoder().encode(body),
    );
    if (!ok) {
      return null;
    }
    const raw = Buffer.from(body, "base64url").toString("utf8");
    const data = JSON.parse(raw) as { email?: unknown; exp?: unknown };
    if (typeof data.email !== "string" || typeof data.exp !== "number") {
      return null;
    }
    if (data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { email: data.email };
  } catch {
    return null;
  }
}
