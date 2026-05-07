import { useLocation } from "react-router-dom";
import { AuthBackdrop } from "./auth-backdrop";
import {
  getWireframeAuthWidthClass,
  RouteAwareWireframeLoader,
} from "./wireframe-loader";

export function AuthPageLoader({
  title = "Loading",
  message = "Checking your account...",
}: {
  title?: string;
  message?: string;
}) {
  const location = useLocation();
  const authWidthClassName = getWireframeAuthWidthClass(location.pathname);

  return (
    <AuthBackdrop contentClassName={authWidthClassName}>
      <RouteAwareWireframeLoader
        variant="auth"
        title={title}
        message={message}
      />
    </AuthBackdrop>
  );
}
