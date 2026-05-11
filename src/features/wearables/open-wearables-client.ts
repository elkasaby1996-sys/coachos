import type { WearableConnectionStatus, WearableProvider } from "./types";

type FetchLike = typeof fetch;

type OpenWearablesClientOptions = {
  apiUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
};

type EnsureUserParams = {
  clientId: string;
  workspaceId: string;
  email?: string | null;
  displayName?: string | null;
};

type AuthorizationParams = {
  provider: WearableProvider;
  clientId: string;
  redirectUri: string;
};

type SyncWindow = {
  start: string;
  end: string;
};

export function mapOpenWearablesConnectionStatus(
  status: string | null | undefined,
): WearableConnectionStatus {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "active" || normalized === "connected") return "connected";
  if (normalized === "revoked" || normalized === "disconnected")
    return "revoked";
  if (normalized === "error" || normalized === "failed") return "sync_failed";
  if (normalized === "pending") return "pending";
  return "disconnected";
}

export class OpenWearablesClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenWearablesClientOptions) {
    if (!options.apiUrl?.trim()) {
      throw new Error("OPEN_WEARABLES_API_URL is required");
    }
    if (!options.apiKey?.trim()) {
      throw new Error("OPEN_WEARABLES_API_KEY is required");
    }

    const trimmedApiUrl = options.apiUrl.replace(/\/+$/, "");
    this.apiUrl = trimmedApiUrl.endsWith("/api/v1")
      ? trimmedApiUrl
      : `${trimmedApiUrl}/api/v1`;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async ensureUser(client: EnsureUserParams) {
    const existing = await this.get(
      `/users?search=${encodeURIComponent(client.clientId)}&limit=100`,
    );
    const items = Array.isArray(existing.items) ? existing.items : [];
    const matched = items.find(
      (item) => item?.external_user_id === client.clientId,
    );
    if (matched) return matched;

    return await this.request("/users", {
      external_user_id: client.clientId,
      email: client.email ?? `${client.clientId}@repsync.local`,
      first_name: client.displayName ?? null,
      last_name: client.workspaceId,
    });
  }

  async getAuthorizationUrl(params: AuthorizationParams) {
    const query = new URLSearchParams({
      user_id: params.clientId,
      redirect_uri: params.redirectUri,
    });
    const payload = await this.get(
      `/oauth/${params.provider}/authorize?${query.toString()}`,
    );
    const url = payload.authorization_url ?? payload.authorizationUrl;
    if (typeof url !== "string" || !url) {
      throw new Error("Open Wearables did not return an authorization URL");
    }
    return url;
  }

  async getConnectionStatus(openWearablesUserId: string) {
    return await this.get(
      `/users/${encodeURIComponent(openWearablesUserId)}/connections`,
    );
  }

  async triggerSync(
    provider: WearableProvider,
    openWearablesUserId: string,
    window: SyncWindow,
  ) {
    const query = new URLSearchParams({
      summary_start_time: window.start,
      summary_end_time: window.end,
    });
    return await this.request(
      `/providers/${provider}/users/${encodeURIComponent(openWearablesUserId)}/sync?${query.toString()}`,
      {},
    );
  }

  async fetchTimeseries(
    openWearablesUserId: string,
    types: string[],
    window: SyncWindow,
  ) {
    const query = new URLSearchParams({
      start_time: window.start,
      end_time: window.end,
    });
    for (const type of types) query.append("types", type);
    return await this.get(
      `/users/${encodeURIComponent(openWearablesUserId)}/timeseries?${query.toString()}`,
    );
  }

  async fetchSleepSessions(openWearablesUserId: string, window: SyncWindow) {
    const query = new URLSearchParams({
      start_date: window.start,
      end_date: window.end,
    });
    return await this.get(
      `/users/${encodeURIComponent(openWearablesUserId)}/events/sleep?${query.toString()}`,
    );
  }

  async fetchWorkouts(openWearablesUserId: string, window: SyncWindow) {
    const query = new URLSearchParams({
      start_date: window.start,
      end_date: window.end,
    });
    return await this.get(
      `/users/${encodeURIComponent(openWearablesUserId)}/events/workouts?${query.toString()}`,
    );
  }

  async fetchHealthScores(openWearablesUserId: string, window: SyncWindow) {
    const query = new URLSearchParams({
      start_date: window.start,
      end_date: window.end,
    });
    return await this.get(
      `/users/${encodeURIComponent(openWearablesUserId)}/health-scores?${query.toString()}`,
    );
  }

  private async get(path: string) {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
    });
    return await this.parseResponse(response);
  }

  private async request(path: string, body: Record<string, unknown>) {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return await this.parseResponse(response);
  }

  private headers() {
    return {
      "X-Open-Wearables-API-Key": this.apiKey,
    };
  }

  private async parseResponse(response: Response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : "Open Wearables request failed";
      throw new Error(message);
    }
    return payload as Record<string, any>;
  }
}
