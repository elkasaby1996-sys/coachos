import React from "react";
import { useSessionAuth } from "../../lib/auth";
import { RouteAwareWireframeLoader } from "./wireframe-loader";

export function LoadingScreen({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <RouteAwareWireframeLoader
      data-testid="bootstrap-loading"
      title="Loading your workspace"
      message={message}
    />
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
