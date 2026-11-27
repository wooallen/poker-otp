"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HostConsole } from "@/components/HostConsole";

function HostPageInner() {
  const searchParams = useSearchParams();
  const room = searchParams.get("room") || "";
  const isDemoMode = searchParams.get("demo") === "1";

  return <HostConsole roomCode={room} isDemoMode={isDemoMode} />;
}

export default function HostPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
          Opening Host Console...
        </div>
      }
    >
      <HostPageInner />
    </Suspense>
  );
}
