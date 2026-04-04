import { PtHubAnimatedBackground } from "../../features/pt-hub/components/pt-hub-animated-background";

export function AppShellBackgroundLayer() {
  return (
    <>
      <PtHubAnimatedBackground mode="dark" />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(3,5,6,0.16),rgba(3,5,6,0.36))]"
        aria-hidden="true"
      />
    </>
  );
}
