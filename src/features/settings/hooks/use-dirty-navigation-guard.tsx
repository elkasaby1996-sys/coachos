import { useCallback, useEffect, useMemo, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";

type DirtyGuardParams = {
  isDirty: boolean;
  onSave?: () => Promise<boolean | void> | boolean | void;
  onDiscard?: () => void;
};

export function shouldProceedAfterSave(result: boolean | void) {
  return result !== false;
}

function useOptionalBlocker(when: boolean) {
  try {
    return useBlocker(when);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    if (message.includes("useBlocker must be used within a data router")) {
      return null;
    }
    throw error;
  }
}

export function useDirtyNavigationGuard(params: DirtyGuardParams) {
  const blocker = useOptionalBlocker(params.isDirty);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveAndLeaveLoading, setSaveAndLeaveLoading] = useState(false);

  useBeforeUnload(
    (event) => {
      if (!params.isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    },
    { capture: true },
  );

  useEffect(() => {
    if (blocker?.state === "blocked") {
      setDialogOpen(true);
    }
  }, [blocker?.state]);

  const closeAndReset = useCallback(() => {
    setDialogOpen(false);
    if (blocker?.state === "blocked") {
      blocker.reset();
    }
  }, [blocker]);

  const discardAndContinue = useCallback(() => {
    params.onDiscard?.();
    setDialogOpen(false);
    if (blocker?.state === "blocked") {
      blocker.proceed();
    }
  }, [blocker, params]);

  const saveAndContinue = useCallback(async () => {
    if (!params.onSave) {
      if (blocker?.state === "blocked") {
        blocker.proceed();
      }
      setDialogOpen(false);
      return;
    }

    setSaveAndLeaveLoading(true);
    try {
      const result = await params.onSave();
      if (!shouldProceedAfterSave(result)) return;
      setDialogOpen(false);
      if (blocker?.state === "blocked") {
        blocker.proceed();
      }
    } finally {
      setSaveAndLeaveLoading(false);
    }
  }, [blocker, params]);

  const guardDialog = useMemo(
    () => (
      <AlertDialog open={dialogOpen} onOpenChange={(open) => !open && closeAndReset()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in this tab. Save before leaving, or discard your edits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="secondary" onClick={closeAndReset}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={discardAndContinue}>
              Discard and continue
            </Button>
            <Button
              type="button"
              onClick={() => void saveAndContinue()}
              disabled={saveAndLeaveLoading}
            >
              {saveAndLeaveLoading ? "Saving..." : "Save and continue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [
      closeAndReset,
      dialogOpen,
      discardAndContinue,
      saveAndContinue,
      saveAndLeaveLoading,
    ],
  );

  return {
    guardDialog,
  };
}
