import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { FieldCharacterMeta } from "../../../components/common/field-character-meta";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import {
  getCharacterLimitState,
  hasCharacterLimitError,
} from "../../../lib/character-limits";
import type {
  PTPublicApplicantIdentity,
  PTPublicLeadInput,
  PTPublicPackageOption,
} from "../../pt-hub/types";

type PublicApplyFormState = {
  fullName: string;
  phone: string;
  goalSummary: string;
  trainingExperience: string;
  packageInterestId: string;
  packageInterestLabelSnapshot: string;
};

const EMPTY_FORM: PublicApplyFormState = {
  fullName: "",
  phone: "",
  goalSummary: "",
  trainingExperience: "",
  packageInterestId: "",
  packageInterestLabelSnapshot: "",
};

export function PublicPtApplyForm({
  slug,
  identity,
  packageOptions = [],
  preview = false,
  submitting = false,
  success = false,
  onSubmit,
}: {
  slug: string;
  identity: PTPublicApplicantIdentity;
  packageOptions?: PTPublicPackageOption[];
  preview?: boolean;
  submitting?: boolean;
  success?: boolean;
  onSubmit?: (input: PTPublicLeadInput) => Promise<void>;
}) {
  const [form, setForm] = useState<PublicApplyFormState>({
    ...EMPTY_FORM,
    fullName: identity.fullName.trim(),
    phone: identity.phone.trim(),
  });
  const [error, setError] = useState<string | null>(null);

  const requiresFullName = !identity.fullName.trim();
  const hasPackages = packageOptions.length > 0;

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      fullName: prev.fullName || identity.fullName.trim(),
      phone: prev.phone || identity.phone.trim(),
    }));
  }, [identity.fullName, identity.phone]);

  useEffect(() => {
    if (success) {
      setForm({
        ...EMPTY_FORM,
        fullName: identity.fullName.trim(),
        phone: identity.phone.trim(),
      });
      setError(null);
    }
  }, [identity.fullName, identity.phone, success]);

  const fullNameLimitState = getCharacterLimitState({
    value: form.fullName,
    kind: "full_name",
    fieldLabel: "Full name",
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
  const packageInterestLimitState = getCharacterLimitState({
    value: form.packageInterestLabelSnapshot,
    kind: "default_text",
    fieldLabel: "Package interest",
  });
  const hasOverLimitErrors = hasCharacterLimitError([
    fullNameLimitState,
    phoneLimitState,
    goalSummaryLimitState,
    trainingExperienceLimitState,
    packageInterestLimitState,
  ]);

  const submitDisabled =
    preview ||
    submitting ||
    !onSubmit ||
    hasOverLimitErrors ||
    !identity.isAuthenticated;

  return (
    <div className="space-y-4">
      {success ? (
        <div className="rounded-2xl border border-success/20 bg-success/10 p-4 text-sm text-success">
          Application sent. It has been delivered into the trainer&apos;s PT Hub
          leads inbox.
        </div>
      ) : null}

      {!identity.isAuthenticated && !preview ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Sign in to apply with your account identity.
          <Link to="/login" className="ml-2 underline">
            Go to login
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        {requiresFullName ? (
          <>
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
          </>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground">
            {identity.fullName}
          </div>
        )}

        <Input value={identity.email} disabled placeholder="Account email" />
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
        <div className="space-y-2">
          <Select
            value={form.packageInterestId}
            onChange={(event) => {
              const selectedId = event.target.value;
              const selectedOption =
                packageOptions.find((option) => option.id === selectedId) ??
                null;
              setForm((prev) => ({
                ...prev,
                packageInterestId: selectedId,
                packageInterestLabelSnapshot: selectedOption?.label ?? "",
              }));
            }}
            disabled={preview || !hasPackages}
          >
            <option value="">
              {hasPackages
                ? "No specific package yet"
                : "Packages will be shared after intro chat"}
            </option>
            {packageOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <FieldCharacterMeta
            count={packageInterestLimitState.count}
            limit={packageInterestLimitState.limit}
            errorText={packageInterestLimitState.errorText}
          />
        </div>
      </div>

      <Button
        className="w-full justify-between"
        disabled={submitDisabled}
        onClick={async () => {
          if (!onSubmit || preview) return;
          if (!identity.isAuthenticated) {
            setError("Sign in to apply.");
            return;
          }
          if (hasOverLimitErrors) {
            setError("Please reduce over-limit fields before submitting.");
            return;
          }

          const nextFullName = requiresFullName
            ? form.fullName.trim()
            : identity.fullName.trim();
          if (!nextFullName) {
            setError("Full name is required.");
            return;
          }
          if (!identity.email.trim()) {
            setError(
              "Your account email is missing. Update your account and try again.",
            );
            return;
          }
          if (!form.goalSummary.trim()) {
            setError("Goal summary is required.");
            return;
          }

          setError(null);
          await onSubmit({
            slug,
            fullName: nextFullName,
            phone: form.phone,
            goalSummary: form.goalSummary,
            trainingExperience: form.trainingExperience,
            packageInterestId: form.packageInterestId || null,
            packageInterestLabelSnapshot:
              form.packageInterestLabelSnapshot || null,
          });
        }}
      >
        {preview
          ? "Apply form preview"
          : submitting
            ? "Submitting..."
            : identity.isAuthenticated
              ? "Apply to Work With Me"
              : "Sign in to apply"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
