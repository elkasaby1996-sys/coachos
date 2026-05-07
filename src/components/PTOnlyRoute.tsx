import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { LoadingScreen } from "./common/bootstrap-gate";

export function PTOnlyRoute() {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Checking your coach workspace..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === "client") {
    return <Navigate to="/app/home" replace />;
  }

  if (role === "none") {
    return <Navigate to="/no-workspace" replace />;
  }

  return <Outlet />;
}
