import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { PTPublicLeadInput } from "../../pt-hub/types";

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  goalSummary: "",
  trainingExperience: "",
  budgetInterest: "",
  packageInterest: "",
};

export function PublicPtApplyForm({
  slug,
  preview = false,
  submitting = false,
  success = false,
  onSubmit,
}: {
  slug: string;
  preview?: boolean;
  submitting?: boolean;
  success?: boolean;
  onSubmit?: (input: PTPublicLeadInput) => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [success]);

  const submitDisabled = preview || submitting || !onSubmit;

  return (
    <div className="space-y-4">
      {success ? (
        <div className="rounded-2xl border border-success/20 bg-success/10 p-4 text-sm text-success">
          Application sent. It has been delivered into the trainer's PT Hub
          leads inbox.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        <Input
          value={form.fullName}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, fullName: event.target.value }))
          }
          placeholder="Full name"
          disabled={preview}
        />
        <Input
          type="email"
          value={form.email}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, email: event.target.value }))
          }
          placeholder="Email"
          disabled={preview}
        />
        <Input
          value={form.phone}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, phone: event.target.value }))
          }
          placeholder="Phone (optional)"
          disabled={preview}
        />
        <textarea
          className="min-h-[120px] w-full app-field px-3 py-2 text-sm"
          value={form.goalSummary}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, goalSummary: event.target.value }))
          }
          placeholder="What are you trying to achieve?"
          disabled={preview}
        />
        <Input
          value={form.trainingExperience}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              trainingExperience: event.target.value,
            }))
          }
          placeholder="Training experience"
          disabled={preview}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={form.budgetInterest}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                budgetInterest: event.target.value,
              }))
            }
            placeholder="Budget"
            disabled={preview}
          />
          <Input
            value={form.packageInterest}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                packageInterest: event.target.value,
              }))
            }
            placeholder="Package interest"
            disabled={preview}
          />
        </div>
      </div>

      <Button
        className="w-full justify-between"
        disabled={submitDisabled}
        onClick={async () => {
          if (!onSubmit || preview) return;
          if (!form.fullName.trim()) {
            setError("Full name is required.");
            return;
          }
          if (!form.email.trim()) {
            setError("Email is required.");
            return;
          }
          if (!/\S+@\S+\.\S+/.test(form.email.trim())) {
            setError("Enter a valid email address.");
            return;
          }
          if (!form.goalSummary.trim()) {
            setError("Goal summary is required.");
            return;
          }

          setError(null);
          await onSubmit({
            slug,
            ...form,
          });
        }}
      >
        {preview
          ? "Apply form preview"
          : submitting
            ? "Submitting..."
            : "Apply to Work With Me"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
