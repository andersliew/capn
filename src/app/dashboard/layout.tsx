import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0c0c0f] text-zinc-100 antialiased">
      {children}
    </div>
  );
}
