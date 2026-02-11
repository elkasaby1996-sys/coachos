import { Button } from "../ui/button";

type SaveActionsProps = {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saving?: boolean;
  disabled?: boolean;
};

export function SaveActions({
  onCancel,
  onSave,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  saving = false,
  disabled = false,
}: SaveActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="secondary" onClick={onCancel} disabled={saving}>
        {cancelLabel}
      </Button>
      <Button onClick={onSave} disabled={disabled || saving}>
        {saving ? "Saving..." : saveLabel}
      </Button>
    </div>
  );
}

