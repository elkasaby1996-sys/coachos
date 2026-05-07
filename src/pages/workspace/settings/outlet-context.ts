import { useOutletContext } from "react-router-dom";

type WorkspaceSettingsRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  owner_user_id: string | null;
  default_checkin_template_id: string | null;
  timezone: string | null;
  unit_preference: string | null;
  week_start_day: string | null;
  client_welcome_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkspaceSettingsOutletContext = {
  workspaceId: string;
  canManage: boolean;
  isOwner: boolean;
  role: string | null;
  workspace: WorkspaceSettingsRow | null;
};

export function useWorkspaceSettingsOutletContext() {
  return useOutletContext<WorkspaceSettingsOutletContext>();
}
