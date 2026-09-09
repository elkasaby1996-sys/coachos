export function getClientRouteKeyFallback(clientId: string | null | undefined) {
  return clientId ? `c-${clientId.split("-").join("").toLowerCase()}` : null;
}

type ClientRouteIdentity = { id: string; url_key?: string | null };

export function getClientRouteCandidates<T extends ClientRouteIdentity>(
  clients: T[],
  routeKey: string | null | undefined,
): T[] {
  if (!routeKey) return [];
  const persisted = clients.filter(
    (client) => client.url_key?.trim() === routeKey,
  );
  if (persisted.length > 0) return persisted;

  const withoutKey = clients.filter((client) => !client.url_key?.trim());
  const exact = withoutKey.filter(
    (client) => getClientRouteKeyFallback(client.id) === routeKey,
  );
  if (exact.length > 0) return exact;

  // Old links truncated UUIDs to eight characters. Keep them only when they
  // identify one client; shared prefixes must never open an arbitrary profile.
  const legacy = withoutKey.filter(
    (client) => getClientRouteKeyFallback(client.id)?.slice(0, 10) === routeKey,
  );
  return legacy.length === 1 ? legacy : [];
}
