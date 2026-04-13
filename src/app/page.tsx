import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginClient } from "@/app/login-client";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

function sanitizeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  return raw;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) {
    redirect("/dashboard");
  }
  const sp = await searchParams;
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#0c0c0f] px-6 py-24 text-zinc-100">
      <main className="w-full max-w-lg text-center">
        <LoginClient nextPath={sanitizeNext(sp.next)} />
      </main>
    </div>
  );
}
