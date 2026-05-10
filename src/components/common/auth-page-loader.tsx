import { useLocation } from "react-router-dom";
import { AuthBackdrop } from "./auth-backdrop";
import { RouteAwareWireframeLoader } from "./wireframe-loader";
import { getWireframeAuthWidthClass } from "./wireframe-loader-utils";

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
