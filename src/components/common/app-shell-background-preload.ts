let ptHubAnimatedBackgroundModulePromise:
  | Promise<
      typeof import("../../features/pt-hub/components/pt-hub-animated-background")
    >
  | null = null;

function loadPtHubAnimatedBackgroundModule() {
  ptHubAnimatedBackgroundModulePromise ??= import(
    "../../features/pt-hub/components/pt-hub-animated-background"
  );
  return ptHubAnimatedBackgroundModulePromise;
}

export function getPtHubAnimatedBackgroundModule() {
  return loadPtHubAnimatedBackgroundModule();
}

export async function preloadPtHubAnimatedBackground() {
  await loadPtHubAnimatedBackgroundModule();
}
