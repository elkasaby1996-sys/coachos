export function getWireframeAuthWidthClass(pathname: string) {
  if (pathname.startsWith("/signup/pt")) return "max-w-lg";
  if (pathname.startsWith("/signup/client")) return "max-w-lg";
  if (pathname.startsWith("/signup")) return "max-w-2xl";
  if (pathname.startsWith("/invite")) return "max-w-lg";
  if (pathname.startsWith("/join")) return "max-w-lg";
  if (pathname.startsWith("/client/onboarding/account")) return "max-w-xl";
  if (pathname.startsWith("/pt/onboarding/workspace")) return "max-w-lg";
  if (pathname.startsWith("/pt/onboarding/profile")) return "max-w-2xl";
  if (pathname.startsWith("/no-workspace")) return "max-w-md";
  return "max-w-md";
}
