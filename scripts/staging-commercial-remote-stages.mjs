// Ordered, closed vocabulary shared by apply execution and evidence validation.
export const REMOTE_STAGES = Object.freeze([
  "link",
  "migration_list_before",
  "history_validation_before",
  "db_push_dry_run",
  "db_push_apply",
  "function_deploy",
  "migration_list_after",
  "history_validation_after",
  "deployment_complete",
]);
export const REMOTE_STAGE_ERRORS = Object.freeze({
  link: "SUPABASE_LINK_FAILED",
  migration_list_before: "MIGRATION_LIST_FAILED",
  history_validation_before: "REMOTE_HISTORY_VALIDATION_FAILED",
  db_push_dry_run: "DB_PUSH_DRY_RUN_FAILED",
  db_push_apply: "DB_PUSH_FAILED",
  function_deploy: "FUNCTION_DEPLOY_FAILED",
  migration_list_after: "FINAL_MIGRATION_LIST_FAILED",
  history_validation_after: "FINAL_HISTORY_VALIDATION_FAILED",
  deployment_complete: "UNKNOWN_REMOTE_FAILURE",
});
export const REMOTE_ERROR_CODES = Object.freeze(
  Object.values(REMOTE_STAGE_ERRORS),
);
export const initialRemoteProgress = () => ({
  remoteStarted: false,
  remoteStage: null,
  lastCompletedRemoteStage: null,
  failedRemoteStage: null,
  remoteErrorCode: null,
});
