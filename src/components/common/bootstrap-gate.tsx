import React from "react";
import { useAuth } from "../../lib/auth";

export function LoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  );
}

export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, session } = useAuth();

  // If auth finished and no session -> don't block public pages.
  if (!session && !authLoading) return <>{children}</>;

  if (authLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  return <>{children}</>;
}
