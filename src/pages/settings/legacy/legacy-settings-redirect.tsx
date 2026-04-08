import { Navigate, useParams } from "react-router-dom";
import { mapLegacySettingsRoute } from "../../../features/settings/lib/settings-route-mapping";
import { useWorkspace } from "../../../lib/use-workspace";

export function LegacySettingsRedirectPage() {
  const { section } = useParams<{ section?: string }>();
  const { workspaceId, workspaceIds } = useWorkspace();

  const fallbackWorkspaceId = workspaceId ?? workspaceIds[0] ?? null;
  const destination = mapLegacySettingsRoute({
    section,
    workspaceId: fallbackWorkspaceId,
  });

  return <Navigate to={destination} replace />;
}
