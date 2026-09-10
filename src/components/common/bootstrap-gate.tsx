import React from "react";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { Button } from "../ui/button";
import { RouteAwareWireframeLoader } from "./wireframe-loader";

export function LoadingScreen({
  message = "Preparing your workspace...",
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
  const {
    bootstrapError,
    bootstrapLoading,
    bootstrapResolved,
    refreshBootstrap,
  } = useBootstrapAuth();

  // If auth finished and no session -> don't block public pages.
  if (!session && !authLoading) return <>{children}</>;

  if (authLoading) {
    return <LoadingScreen message="Checking your session..." />;
  }

  if (bootstrapError && !bootstrapLoading && !bootstrapResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <section
          role="alert"
          data-testid="bootstrap-error"
          className="w-full max-w-md space-y-4 text-center"
        >
          <h1 className="text-2xl font-semibold text-foreground">
            We couldn’t load your account
          </h1>
          <p className="text-sm text-muted-foreground">
            Your session is active. Try loading your account again.
          </p>
          <Button onClick={() => void refreshBootstrap()}>Try again</Button>
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
