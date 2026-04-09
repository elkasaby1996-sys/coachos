import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { FieldCharacterMeta } from "../../../components/common/field-character-meta";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import {
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../../lib/character-limits";
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

  const fullNameLimitState = getCharacterLimitState({
    value: form.fullName,
    kind: "full_name",
    fieldLabel: "Full name",
  });
  const emailLimitState = getCharacterLimitState({
    value: form.email,
    kind: "email",
    fieldLabel: "Email",
  });
  const phoneLimitState = getCharacterLimitState({
    value: form.phone,
    kind: "default_text",
    fieldLabel: "Phone",
  });
  const goalSummaryLimitState = getCharacterLimitState({
    value: form.goalSummary,
    kind: "default_text",
    fieldLabel: "Goal summary",
  });
  const trainingExperienceLimitState = getCharacterLimitState({
    value: form.trainingExperience,
    kind: "default_text",
    fieldLabel: "Training experience",
  });
  const budgetInterestLimitState = getCharacterLimitState({
    value: form.budgetInterest,
    kind: "default_text",
    fieldLabel: "Budget",
  });
  const packageInterestLimitState = getCharacterLimitState({
    value: form.packageInterest,
    kind: "default_text",
    fieldLabel: "Package interest",
  });
  const hasOverLimitErrors = hasCharacterLimitError([
    fullNameLimitState,
    emailLimitState,
    phoneLimitState,
    goalSummaryLimitState,
    trainingExperienceLimitState,
    budgetInterestLimitState,
    packageInterestLimitState,
  ]);

  const submitDisabled = preview || submitting || !onSubmit || hasOverLimitErrors;

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
          isInvalid={fullNameLimitState.overLimit}
          value={form.fullName}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, fullName: event.target.value }))
          }
          placeholder="Full name"
          disabled={preview}
        />
        <FieldCharacterMeta
          count={fullNameLimitState.count}
          limit={fullNameLimitState.limit}
          errorText={fullNameLimitState.errorText}
        />
        <Input
          type="email"
          isInvalid={emailLimitState.overLimit}
          value={form.email}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, email: event.target.value }))
          }
          placeholder="Email"
          disabled={preview}
        />
        <FieldCharacterMeta
          count={emailLimitState.count}
          limit={emailLimitState.limit}
          errorText={emailLimitState.errorText}
        />
        <Input
          isInvalid={phoneLimitState.overLimit}
          value={form.phone}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, phone: event.target.value }))
          }
          placeholder="Phone (optional)"
          disabled={preview}
        />
        <FieldCharacterMeta
          count={phoneLimitState.count}
          limit={phoneLimitState.limit}
          errorText={phoneLimitState.errorText}
        />
        <Textarea
          isInvalid={goalSummaryLimitState.overLimit}
          value={form.goalSummary}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, goalSummary: event.target.value }))
          }
          placeholder="What are you trying to achieve?"
          disabled={preview}
        />
        <FieldCharacterMeta
          count={goalSummaryLimitState.count}
          limit={goalSummaryLimitState.limit}
          errorText={goalSummaryLimitState.errorText}
        />
        <Input
          isInvalid={trainingExperienceLimitState.overLimit}
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
        <FieldCharacterMeta
          count={trainingExperienceLimitState.count}
          limit={trainingExperienceLimitState.limit}
          errorText={trainingExperienceLimitState.errorText}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Input
              isInvalid={budgetInterestLimitState.overLimit}
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
            <FieldCharacterMeta
              count={budgetInterestLimitState.count}
              limit={budgetInterestLimitState.limit}
              errorText={budgetInterestLimitState.errorText}
            />
          </div>
          <div className="space-y-2">
            <Input
              isInvalid={packageInterestLimitState.overLimit}
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
            <FieldCharacterMeta
              count={packageInterestLimitState.count}
              limit={packageInterestLimitState.limit}
              errorText={packageInterestLimitState.errorText}
            />
          </div>
        </div>
      </div>

      <Button
        className="w-full justify-between"
        disabled={submitDisabled}
        onClick={async () => {
          if (!onSubmit || preview) return;
          if (hasOverLimitErrors) {
            setError("Please reduce over-limit fields before submitting.");
            return;
          }
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
