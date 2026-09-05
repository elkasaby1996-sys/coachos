// Isolated browser fixture: actual library/picker components, no app route or writes.
import { applyTheme } from "../../../src/lib/theme";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnatomicalMuscleSelector } from "../../../src/components/pt/anatomical-muscle-selector";
import {
  ExerciseLibraryFilterPanel,
  ExerciseLibraryToolbar,
  ExerciseLibraryResults,
} from "../../../src/components/pt/exercise-library/exercise-library-browser";
import { ExercisePicker } from "../../../src/components/pt/exercise-picker/exercise-picker";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../../../src/components/ui/dialog";
import {
  clearProviderAnatomyFilters,
  selectCanonicalMuscle,
  selectProviderBodyPart,
  selectProviderTargetMuscle,
} from "../../../src/lib/exercise-provider-anatomy";
import { emptyExercisePickerSelection } from "../../../src/lib/exercise-picker";
import {
  MUSCLES,
  type MuscleKey,
} from "../../../src/lib/exercise-muscle-taxonomy";
import {
  adaptPersistedExerciseBrowserItem,
  filterExerciseBrowserItems,
  DEFAULT_EXERCISE_BROWSER_FILTERS,
} from "../../../src/lib/exercise-browser";
import type { PersistentExerciseLibraryRecord } from "../../../src/lib/exercise-domain";
import "../../../src/styles/globals.css";
import "../../../src/styles/style.css";
import "../../../src/styles/color-language.css";
import "../../../src/styles/kpi-cards.css";
import "../../../src/styles/component-system.css";

applyTheme("light");

const records: PersistentExerciseLibraryRecord[] = MUSCLES.map(
  (muscle, index) => ({
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
    owner_user_id: "22222222-2222-4222-8222-222222222222",
    workspace_id: null,
    name: `${muscle.label} exercise`,
    category: null,
    muscle_group: null,
    primary_muscle: muscle.label,
    secondary_muscles: [],
    body_region_keys: [muscle.regionKey],
    primary_muscle_keys: [muscle.key],
    secondary_muscle_keys: [],
    muscle_taxonomy_version: 1,
    equipment: "Dumbbell",
    video_url: null,
    instructions: null,
    notes: null,
    cues: null,
    is_unilateral: false,
    tags: [],
    created_at: null,
    source: "manual",
    source_exercise_id: null,
    source_payload: null,
  }),
);

export function Fixture() {
  const [state, setState] = useState(clearProviderAnatomyFilters);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(emptyExercisePickerSelection);
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [controlled, setControlled] = useState(true);
  const [events, setEvents] = useState<(MuscleKey | null)[]>([]);
  const mode = new URLSearchParams(location.search).get("mode") ?? "library";
  const choose = (value: MuscleKey | null) => {
    setEvents((current) => [...current, value]);
    if (controlled)
      setState((current) => selectCanonicalMuscle(current, value));
  };
  return (
    <main
      style={{
        padding: 16,
        maxWidth: 1440,
        margin: "auto",
        position: "relative",
        overflowX: "clip",
      }}
    >
      <style>{`@media(min-width:1280px){.qa-library-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px}}`}</style>
      <h1 className="mb-4 text-xl">Exercise library · isolated QA data</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <label>
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />{" "}
          Disable selector
        </label>
        <label>
          <input
            type="checkbox"
            checked={controlled}
            onChange={(e) => setControlled(e.target.checked)}
          />{" "}
          Reflect callbacks
        </label>
        <button
          onClick={() =>
            setState((current) => selectCanonicalMuscle(current, "pectorals"))
          }
        >
          Parent selects pectorals
        </button>
      </div>
      <output className="sr-only" data-testid="selection-events">
        {JSON.stringify(events)}
      </output>
      <output className="sr-only" data-testid="muscle-value">
        {state.canonicalMuscleKey ?? "null"}
      </output>
      <output className="sr-only" data-testid="exercise-identities">
        {JSON.stringify([...selection.keys()])}
      </output>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="ml-4 min-h-11">
          Open workout picker
        </DialogTrigger>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] lg:h-[min(92dvh,58rem)] lg:max-w-[1120px]">
          <div className="shrink-0 px-4 pb-3 pt-4 pr-14">
            <DialogTitle>Add exercises</DialogTitle>
            <DialogDescription>
              Select exercises for this workout.
            </DialogDescription>
          </div>
          <ExercisePicker
            open={open}
            libraryExercises={records}
            libraryLoading={false}
            libraryError={null}
            existingExerciseIds={new Set()}
            selection={selection}
            onSelectionChange={setSelection}
            onRetryLibrary={() => {}}
            onCreateExercise={() => {}}
            onCancel={() => setOpen(false)}
            onAddSelected={() => {}}
            submitting={false}
            submissionError={null}
          />
        </DialogContent>
      </Dialog>
      {mode === "isolated" ? (
        <div style={{ width: "min(100%, 300px)" }}>
          <AnatomicalMuscleSelector
            value={state.canonicalMuscleKey}
            onValueChange={choose}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="qa-library-grid mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="order-2 xl:order-1">
            <ExerciseLibraryResults
              items={filterExerciseBrowserItems(
                records.map(adaptPersistedExerciseBrowserItem),
                {
                  ...DEFAULT_EXERCISE_BROWSER_FILTERS,
                  query,
                  muscleKey: state.canonicalMuscleKey,
                },
              )}
              muscleKey={state.canonicalMuscleKey}
              loading={false}
              emptyTitle="No exercises"
              emptyDescription="Adjust the filter."
              actionsForItem={() => null}
            />
          </div>
          <div className="order-1 min-w-0 space-y-4 xl:order-2">
            <ExerciseLibraryToolbar
              query={query}
              anatomyState={state}
              equipment={null}
              exerciseType={null}
              view="library"
              equipmentOptions={[]}
              exerciseTypeOptions={[]}
              metadataLoading={false}
              onQueryChange={setQuery}
              onEquipmentChange={() => {}}
              onBodyPartChange={(value) =>
                setState((current) => selectProviderBodyPart(current, value))
              }
              onTargetMuscleChange={(value) =>
                setState((current) =>
                  selectProviderTargetMuscle(current, value),
                )
              }
              onProviderFilterChange={() => {}}
              onViewChange={() => {}}
              onClear={() => setState(clearProviderAnatomyFilters())}
              hasActiveFilters={!!state.canonicalMuscleKey}
              action={null}
            />
            <ExerciseLibraryFilterPanel
              muscleKey={state.canonicalMuscleKey}
              onMuscleChange={choose}
            />
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>,
);
