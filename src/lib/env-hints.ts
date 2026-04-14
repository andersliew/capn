import "server-only";

/** User-facing hint when `DATABASE_URL` is missing (local vs Vercel). */
export function databaseUrlMissingHint(): string {
  if (process.env.VERCEL === "1") {
    return "In Vercel: Project → Settings → Environment Variables → add DATABASE_URL with your Neon pooled connection string, then redeploy.";
  }
  return "Add DATABASE_URL to .env.local with your Neon pooled connection string (see .env.example).";
}
