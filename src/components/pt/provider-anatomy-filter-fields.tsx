import { Select } from "../ui/select";
import {
  getProviderAnatomyExplanation,
  PROVIDER_BODY_PART_OPTIONS,
  PROVIDER_TARGET_MUSCLE_OPTIONS,
  type ProviderAnatomyFilterState,
  type ProviderBodyPartValue,
  type ProviderTargetMuscleValue,
} from "../../lib/exercise-provider-anatomy";
import { cn } from "../../lib/utils";

export function ProviderAnatomyFilterFields({
  state,
  onBodyPartChange,
  onTargetMuscleChange,
  idPrefix,
  className,
}: {
  state: ProviderAnatomyFilterState;
  onBodyPartChange: (value: ProviderBodyPartValue | null) => void;
  onTargetMuscleChange: (value: ProviderTargetMuscleValue | null) => void;
  idPrefix: string;
  className?: string;
}) {
  const explanation = getProviderAnatomyExplanation(state);
  const bodyPartId = `${idPrefix}-body-part`;
  const targetId = `${idPrefix}-target-muscle`;
  const explanationId = `${idPrefix}-anatomy-explanation`;

  return (
    <div className={cn("contents", className)}>
      <div className="min-w-0">
        <label
          htmlFor={bodyPartId}
          className="mb-1.5 block text-xs font-semibold text-foreground"
        >
          Body part
        </label>
        <Select
          id={bodyPartId}
          className="min-h-11 w-full"
          value={state.providerBodyPart ?? ""}
          aria-describedby={explanation ? explanationId : undefined}
          onChange={(event) =>
            onBodyPartChange(
              (event.target.value || null) as ProviderBodyPartValue | null,
            )
          }
        >
          <option value="">All body parts</option>
          {PROVIDER_BODY_PART_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-0">
        <label
          htmlFor={targetId}
          className="mb-1.5 block text-xs font-semibold text-foreground"
        >
          Target muscle
        </label>
        <Select
          id={targetId}
          className="min-h-11 w-full"
          value={state.providerTargetMuscle ?? ""}
          aria-describedby={explanation ? explanationId : undefined}
          onChange={(event) =>
            onTargetMuscleChange(
              (event.target.value || null) as ProviderTargetMuscleValue | null,
            )
          }
        >
          <option value="">All target muscles</option>
          {PROVIDER_TARGET_MUSCLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {explanation ? (
          <p
            id={explanationId}
            className="mt-1.5 text-xs leading-5 text-muted-foreground"
            aria-live="polite"
          >
            {explanation.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
