export type ClientRouteGuardDecision = "loading" | "redirect" | "render";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClientRouteUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function getClientRouteGuardDecision(params: {
  routeLoading?: boolean;
  clientId: string | null | undefined;
  accessLoading: boolean;
  accessAllowed: boolean | null | undefined;
  routeError?: unknown;
  accessError: unknown;
}) {
  if (params.routeLoading) return "loading";
  if (params.routeError) return "redirect";
  if (!params.clientId || !isClientRouteUuid(params.clientId)) {
    return "redirect";
  }
  if (params.accessLoading) return "loading";
  if (params.accessError) return "redirect";
  if (!params.accessAllowed) return "redirect";
  return "render";
}
