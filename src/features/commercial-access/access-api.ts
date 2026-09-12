import {
  ownerAccessSchema,
  workspaceAccessSchema,
  clientAccessSchema,
} from "./contracts";
import { CommercialAccessError, commercialErrorCode } from "./access-errors";
async function call(name: string, args?: Record<string, string>) {
  const { supabase } = await import("../../lib/supabase");
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const code = commercialErrorCode(error);
    if (code) {
      const { captureMessage } = await import("@sentry/react");
      captureMessage("Commercial access denied", {
        level: "info",
        tags: {
          code,
          domain: "commercial_access",
          actor_audience:
            name === "get_client_coaching_access"
              ? "client"
              : "account_or_workspace",
        },
      });
      throw new CommercialAccessError(code);
    }
    throw new Error("Access could not be checked. Please retry.");
  }
  return data;
}
export async function getOwnerAccess() {
  return ownerAccessSchema.parse(
    await call("get_my_commercial_access_summary"),
  );
}
export async function getWorkspaceAccess(id: string) {
  return workspaceAccessSchema.parse(
    await call("get_workspace_commercial_access", { p_workspace_id: id }),
  );
}
export async function getClientAccess(id: string) {
  return clientAccessSchema.parse(
    await call("get_client_coaching_access", { p_client_id: id }),
  );
}
