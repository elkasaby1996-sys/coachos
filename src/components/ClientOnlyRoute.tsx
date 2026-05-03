import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { LoadingScreen } from "./common/bootstrap-gate";

export function ClientOnlyRoute() {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Checking your client workspace..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === "pt") {
    return <Navigate to="/pt-hub" replace />;
  }

  if (role === "none") {
    return <Navigate to="/app/home" replace />;
  }

  return <Outlet />;
}
