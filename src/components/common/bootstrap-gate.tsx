import React from "react";
import { useSessionAuth } from "../../lib/auth";

export function LoadingScreen({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background"
      data-testid="bootstrap-loading"
    >
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  );
}

export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { authLoading, session } = useSessionAuth();

  // If auth finished and no session -> don't block public pages.
  if (!session && !authLoading) return <>{children}</>;

  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return <>{children}</>;
}
