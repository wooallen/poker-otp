import { Suspense } from "react";
import { HostConsole } from "@/components/HostConsole";

async function HostRouteLoader({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { roomCode } = await params;
  const sp = await searchParams;
  const isDemoMode = sp.demo === "1";

  return <HostConsole roomCode={roomCode} isDemoMode={isDemoMode} />;
}

export default function HostRoomPage(props: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
          Opening Banker Console...
        </div>
      }
    >
      <HostRouteLoader
        params={props.params}
        searchParams={props.searchParams}
      />
    </Suspense>
  );
}
