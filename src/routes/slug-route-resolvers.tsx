import { lazy, Suspense, useEffect } from "react";
import { ArrowLeft, Home } from "lucide-react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RouteAwareWireframeLoader } from "../components/common/wireframe-loader";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/coachos/empty-state";
import { appendSearchParams, routes } from "../lib/routes";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/use-workspace";
import { traceAsync, traceEnd, traceStart } from "../lib/perf-trace";
import { getClientRouteGuardDecision } from "../lib/client-route-guard";
import { getWorkspaceRouteGuardDecision } from "../lib/workspace-route-guard";
import {
  buildLegacyWorkspaceEntryRedirectPath,
  buildLegacyWorkspaceSettingsRedirectPath,
  resolveWorkspaceRouteParam,
} from "../lib/workspace-route-resolution";

const LazyPtClientDetailPage = lazy(() =>
  import("../pages/pt/client-detail").then((module) => ({
    default: module.PtClientDetailPage,
  })),
);

function RouteLoading() {
  return <RouteAwareWireframeLoader title="" message="" />;
}

function RouteNotFound({ title }: { title: string }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100dvh-8rem)] bg-[radial-gradient(circle_at_top_left,oklch(var(--primary)/0.10),transparent_34%),linear-gradient(135deg,oklch(var(--background)),oklch(var(--secondary)/0.34))] px-4 py-10">
      <div className="mx-auto flex min-h-[28rem] max-w-3xl items-center justify-center">
        <EmptyState
          title={title}
          centered
          className="w-full rounded-[32px] border border-border/70 bg-card/82 px-8 py-9 shadow-[0_30px_90px_-64px_oklch(var(--primary)/0.45)] backdrop-blur-2xl"
          description="The link may be outdated, or you may not have access to this workspace yet."
          action={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(-1)}
                className="h-10 gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go back
              </Button>
              <Button
                type="button"
                onClick={() => navigate(routes.ptHub())}
                className="h-10 gap-2"
              >
                <Home className="h-4 w-4" />
                PT Hub
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}

type WorkspaceAccessContextRow = {
  workspace_id: string;
  role: string;
  member_status: string;
};

export function WorkspaceSlugBoundary() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { switchWorkspace } = useWorkspace();
  const workspaceQuery = useQuery({
    queryKey: ["route-workspace-slug", workspaceSlug],
    enabled: Boolean(workspaceSlug),
    queryFn: async () => {
      return await traceAsync(
        "WorkspaceSlugBoundary.slug_resolution",
        () => resolveWorkspaceRouteParam(workspaceSlug),
        { workspaceSlug },
      );
    },
  });
  const workspaceAccessQuery = useQuery({
    queryKey: ["route-workspace-access", workspaceQuery.data?.id],
    enabled: Boolean(workspaceQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await traceAsync(
        "WorkspaceSlugBoundary.workspace_access_context",
        () =>
          supabase.rpc("workspace_access_context", {
            p_workspace_id: workspaceQuery.data?.id,
          }),
        { workspaceId: workspaceQuery.data?.id },
      );

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return (row ?? null) as WorkspaceAccessContextRow | null;
    },
  });
  const workspaceAccessAllowed = Boolean(
    workspaceAccessQuery.data?.workspace_id,
  );
  const guardDecision = getWorkspaceRouteGuardDecision({
    routeLoading: workspaceQuery.isLoading,
    accessLoading: workspaceAccessQuery.isLoading,
    routeWorkspaceId: workspaceQuery.data?.id,
    accessWorkspaceId: workspaceAccessQuery.data?.workspace_id,
    routeError: workspaceQuery.error,
    accessError: workspaceAccessQuery.error,
  });

  useEffect(() => {
    if (workspaceAccessAllowed && workspaceQuery.data?.id) {
      const startedAt = traceStart("WorkspaceSlugBoundary.switchWorkspace", {
        workspaceId: workspaceQuery.data.id,
      });
      switchWorkspace(workspaceQuery.data.id);
      traceEnd("WorkspaceSlugBoundary.switchWorkspace", startedAt, {
        workspaceId: workspaceQuery.data.id,
      });
    }
  }, [switchWorkspace, workspaceAccessAllowed, workspaceQuery.data?.id]);

  if (guardDecision === "loading") return <RouteLoading />;
  if (guardDecision === "redirect") {
    return <Navigate to={routes.ptHub()} replace />;
  }

  return <Outlet />;
}

type ClientRouteRow = {
  id: string;
  workspace_id: string;
  url_key: string | null;
  relationship_status: string | null;
};

const getClientRouteKeyFallback = (clientId: string | null | undefined) =>
  clientId
    ? `c-${clientId.split("-").join("").slice(0, 8).toLowerCase()}`
    : null;

function getClientRouteRelationshipRank(status: string | null | undefined) {
  const relationshipStatus = status ?? "active";
  if (relationshipStatus === "active") return 0;
  if (relationshipStatus === "removed") return 1;
  if (relationshipStatus === "transferred_out") return 1;
  return 2;
}

export function WorkspaceClientDetailRoute() {
  const { workspaceSlug, clientUrlKey } = useParams<{
    workspaceSlug: string;
    clientUrlKey: string;
  }>();

  const clientQuery = useQuery({
    queryKey: ["route-client-url-key", workspaceSlug, clientUrlKey],
    enabled: Boolean(workspaceSlug && clientUrlKey),
    queryFn: async () => {
      const workspace = await resolveWorkspaceRouteParam(workspaceSlug);
      if (!workspace?.id) return null;

      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, url_key, relationship_status")
        .eq("workspace_id", workspace.id)
        .or(`url_key.eq.${clientUrlKey},url_key.is.null`)
        .returns<ClientRouteRow[]>();
      if (error) throw error;
      const candidates = (data ?? [])
        .filter((client) => {
          const persistedUrlKey = client.url_key?.trim() || null;
          return (
            persistedUrlKey === clientUrlKey ||
            (!persistedUrlKey &&
              getClientRouteKeyFallback(client.id) === clientUrlKey)
          );
        })
        .sort(
          (left, right) =>
            getClientRouteRelationshipRank(left.relationship_status) -
            getClientRouteRelationshipRank(right.relationship_status),
        );

      for (const client of candidates) {
        // Mirrors public.can_access_client(client.id, 'clients.view') for historical route access.
        const { data: accessAllowed, error: accessError } = await supabase.rpc(
          "can_access_client",
          {
            p_client_id: client.id,
            p_permission: "clients.view",
          },
        );
        if (accessError) throw accessError;
        if (accessAllowed === true) return client;
      }

      return null;
    },
  });
  const guardDecision = getClientRouteGuardDecision({
    routeLoading: clientQuery.isLoading,
    clientId: clientQuery.data?.id,
    accessLoading: false,
    accessAllowed: Boolean(clientQuery.data),
    routeError: clientQuery.error,
    accessError: null,
  });

  if (guardDecision === "loading") return <RouteLoading />;
  if (guardDecision === "redirect") {
    return <RouteNotFound title="Client not found" />;
  }
  const client = clientQuery.data;
  if (!client) return <RouteNotFound title="Client not found" />;

  return (
    <Suspense fallback={<RouteLoading />}>
      <LazyPtClientDetailPage clientIdOverride={client.id} />
    </Suspense>
  );
}

export function LegacyWorkspaceSettingsRedirect() {
  const { workspaceId, tab } = useParams<{
    workspaceId: string;
    tab?: string;
  }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const workspaceQuery = useQuery({
    queryKey: ["legacy-workspace-settings", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, slug")
        .eq("id", workspaceId ?? "")
        .maybeSingle<{ id: string; slug: string | null }>();
      if (error) throw error;
      return data;
    },
  });

  if (workspaceQuery.isLoading) return <RouteLoading />;
  if (workspaceQuery.error || !workspaceQuery.data) {
    return <RouteNotFound title="Workspace not found" />;
  }

  const queryTab = searchParams.get("tab");
  const nextTab = tab ?? queryTab ?? "general";
  const nextParams = new URLSearchParams(location.search);
  nextParams.delete("tab");

  return (
    <Navigate
      to={buildLegacyWorkspaceSettingsRedirectPath({
        workspace: workspaceQuery.data,
        tab: nextTab,
        search: nextParams.toString(),
      })}
      replace
    />
  );
}

export function LegacyWorkspaceEntryRedirect() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const workspaceQuery = useQuery({
    queryKey: ["legacy-workspace-entry", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, slug")
        .eq("id", workspaceId ?? "")
        .maybeSingle<{ id: string; slug: string | null }>();
      if (error) throw error;
      return data;
    },
  });

  if (workspaceQuery.isLoading) return <RouteLoading />;
  if (workspaceQuery.error || !workspaceQuery.data) {
    return <RouteNotFound title="Workspace not found" />;
  }

  return (
    <Navigate
      to={buildLegacyWorkspaceEntryRedirectPath(
        workspaceQuery.data,
        location.search,
      )}
      replace
    />
  );
}

export function LegacyClientRedirect() {
  const { clientId } = useParams<{ clientId: string }>();
  const location = useLocation();
  const clientQuery = useQuery({
    queryKey: ["legacy-client-route", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, url_key, workspaces!inner(slug)")
        .eq("id", clientId ?? "")
        .maybeSingle<{
          id: string;
          url_key: string | null;
          workspaces: { slug: string | null } | null;
        }>();
      if (error) throw error;
      return data;
    },
  });

  if (clientQuery.isLoading) return <RouteLoading />;
  const workspaceSlug = clientQuery.data?.workspaces?.slug;
  const clientUrlKey = clientQuery.data?.url_key;
  if (clientQuery.error || !workspaceSlug || !clientUrlKey) {
    return <RouteNotFound title="Client not found" />;
  }

  return (
    <Navigate
      to={appendSearchParams(
        routes.clientDetail(workspaceSlug, clientUrlKey),
        location.search,
      )}
      replace
    />
  );
}

export function LegacyPublicProfileRedirect() {
  const { id, slug } = useParams<{ id?: string; slug?: string }>();
  const location = useLocation();

  const profileQuery = useQuery({
    queryKey: ["legacy-public-profile", id],
    enabled: Boolean(id && !slug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pt_hub_profiles")
        .select("slug")
        .eq("id", id ?? "")
        .maybeSingle<{ slug: string | null }>();
      if (error) throw error;
      return data;
    },
  });

  if (slug) {
    return (
      <Navigate
        to={appendSearchParams(routes.publicProfile(slug), location.search)}
        replace
      />
    );
  }

  if (profileQuery.isLoading) return <RouteLoading />;
  if (profileQuery.error || !profileQuery.data?.slug) {
    return <RouteNotFound title="Coach profile not found" />;
  }

  return (
    <Navigate
      to={appendSearchParams(
        routes.publicProfile(profileQuery.data.slug),
        location.search,
      )}
      replace
    />
  );
}
