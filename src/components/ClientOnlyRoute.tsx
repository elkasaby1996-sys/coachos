import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";

export function ClientOnlyRoute() {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === "pt") {
    return <Navigate to="/pt/dashboard" replace />;
  }

  if (role === "none") {
    return <Navigate to="/no-workspace" replace />;
  }

  return <Outlet />;
}
