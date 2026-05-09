import { lazy, Suspense, useEffect } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RouteAwareWireframeLoader } from "../components/common/wireframe-loader";
import { EmptyState } from "../components/ui/coachos/empty-state";
import { appendSearchParams, routes } from "../lib/routes";
import type { WorkspaceSettingsTab } from "../lib/routes";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/use-workspace";

const LazyPtClientDetailPage = lazy(() =>
  import("../pages/pt/client-detail").then((module) => ({
    default: module.PtClientDetailPage,
  })),
);

function RouteLoading() {
  return <RouteAwareWireframeLoader title="" message="" />;
}

function RouteNotFound({ title }: { title: string }) {
  return (
    <div className="px-4 py-10">
      <EmptyState
        title={title}
        description="The link may be outdated or the resource may no longer exist."
      />
    </div>
  );
}

type WorkspaceRouteRow = {
  id: string;
  slug: string | null;
};

export function WorkspaceSlugBoundary() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { switchWorkspace } = useWorkspace();
  const workspaceQuery = useQuery({
    queryKey: ["route-workspace-slug", workspaceSlug],
    enabled: Boolean(workspaceSlug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, slug")
        .eq("slug", workspaceSlug ?? "")
        .maybeSingle<WorkspaceRouteRow>();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (workspaceQuery.data?.id) {
      switchWorkspace(workspaceQuery.data.id);
    }
  }, [switchWorkspace, workspaceQuery.data?.id]);

  if (workspaceQuery.isLoading) return <RouteLoading />;
  if (workspaceQuery.error || !workspaceQuery.data) {
    return <RouteNotFound title="Workspace not found" />;
  }

  return <Outlet />;
}

type ClientRouteRow = {
  id: string;
  workspace_id: string;
  url_key: string | null;
};

export function WorkspaceClientDetailRoute() {
  const { workspaceSlug, clientUrlKey } = useParams<{
    workspaceSlug: string;
    clientUrlKey: string;
  }>();

  const clientQuery = useQuery({
    queryKey: ["route-client-url-key", workspaceSlug, clientUrlKey],
    enabled: Boolean(workspaceSlug && clientUrlKey),
    queryFn: async () => {
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", workspaceSlug ?? "")
        .maybeSingle<{ id: string }>();
      if (workspaceError) throw workspaceError;
      if (!workspace?.id) return null;

      const { data, error } = await supabase
        .from("clients")
        .select("id, workspace_id, url_key")
        .eq("workspace_id", workspace.id)
        .eq("url_key", clientUrlKey ?? "")
        .maybeSingle<ClientRouteRow>();
      if (error) throw error;
      return data;
    },
  });

  if (clientQuery.isLoading) return <RouteLoading />;
  if (clientQuery.error || !clientQuery.data) {
    return <RouteNotFound title="Client not found" />;
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <LazyPtClientDetailPage clientIdOverride={clientQuery.data.id} />
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
        .select("slug")
        .eq("id", workspaceId ?? "")
        .maybeSingle<{ slug: string | null }>();
      if (error) throw error;
      return data;
    },
  });

  if (workspaceQuery.isLoading) return <RouteLoading />;
  if (workspaceQuery.error || !workspaceQuery.data?.slug) {
    return <RouteNotFound title="Workspace not found" />;
  }

  const queryTab = searchParams.get("tab");
  const nextTab = tab ?? queryTab ?? "general";
  const canonicalTab = (nextTab === "danger"
    ? "danger-zone"
    : nextTab) as WorkspaceSettingsTab;
  const nextParams = new URLSearchParams(location.search);
  nextParams.delete("tab");

  return (
    <Navigate
      to={appendSearchParams(
        routes.workspaceSettings(
          workspaceQuery.data.slug,
          canonicalTab,
        ),
        nextParams.toString(),
      )}
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
        .select("slug")
        .eq("id", workspaceId ?? "")
        .maybeSingle<{ slug: string | null }>();
      if (error) throw error;
      return data;
    },
  });

  if (workspaceQuery.isLoading) return <RouteLoading />;
  if (workspaceQuery.error || !workspaceQuery.data?.slug) {
    return <RouteNotFound title="Workspace not found" />;
  }

  return (
    <Navigate
      to={appendSearchParams(
        routes.workspaceOverview(workspaceQuery.data.slug),
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
