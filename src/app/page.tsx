import { HomeClient } from "@/app/home-client";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#0c0c0f] px-6 py-24 text-zinc-100">
      <main className="w-full max-w-lg text-center">
        <HomeClient />
      </main>
    </div>
  );
}
