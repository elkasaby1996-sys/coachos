import { Suspense, lazy } from "react";
import { getPtHubAnimatedBackgroundModule } from "./app-shell-background-preload";

const PtHubAnimatedBackground = lazy(async () => {
  const module = await getPtHubAnimatedBackgroundModule();
  return { default: module.PtHubAnimatedBackground };
});

type AppShellBackgroundMode = "dark" | "light";

function AmbientShellBackground({ mode }: { mode: AppShellBackgroundMode }) {
  const isLightMode = mode === "light";

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background: isLightMode
            ? "linear-gradient(180deg, rgba(236, 242, 247, 0.94), rgba(225, 233, 239, 0.92) 44%, rgba(214, 224, 232, 0.96))"
            : "linear-gradient(180deg, rgba(6, 9, 10, 0.92), rgba(7, 10, 10, 0.94) 42%, rgba(4, 6, 7, 0.98))",
        }}
      />
      <div
        className="absolute -left-[10%] top-[-8%] h-[26rem] w-[26rem] rounded-full blur-[92px]"
        style={{
          background: isLightMode
            ? "radial-gradient(circle, rgba(120, 160, 188, 0.24), transparent 68%)"
            : "radial-gradient(circle, rgba(73, 115, 95, 0.26), transparent 68%)",
          animation: "pt-hub-orb-float 28s cubic-bezier(0.42, 0, 0.2, 1) infinite",
          willChange: "transform, opacity",
        }}
      />
      <div
        className="absolute right-[-10%] top-[10%] h-[22rem] w-[22rem] rounded-full blur-[96px]"
        style={{
          background: isLightMode
            ? "radial-gradient(circle, rgba(145, 176, 198, 0.18), transparent 70%)"
            : "radial-gradient(circle, rgba(39, 60, 50, 0.22), transparent 70%)",
          animation: "pt-hub-orb-float 32s cubic-bezier(0.42, 0, 0.2, 1) infinite",
          animationDelay: "-9s",
          willChange: "transform, opacity",
        }}
      />
      <div
        className="absolute bottom-[-16%] left-[20%] h-[22rem] w-[22rem] rounded-full blur-[92px]"
        style={{
          background: isLightMode
            ? "radial-gradient(circle, rgba(153, 196, 180, 0.14), transparent 72%)"
            : "radial-gradient(circle, rgba(56, 87, 72, 0.18), transparent 72%)",
          animation: "pt-hub-orb-float 30s cubic-bezier(0.42, 0, 0.2, 1) infinite",
          animationDelay: "-14s",
          willChange: "transform, opacity",
        }}
      />
      <div
        className="absolute left-[10%] top-[18%] h-[16rem] w-[70%] rounded-full blur-[76px]"
        style={{
          background: isLightMode
            ? "radial-gradient(circle at 20% 50%, rgba(120, 160, 188, 0.08), transparent 18%), radial-gradient(circle at 50% 45%, rgba(145, 176, 198, 0.06), transparent 22%), radial-gradient(circle at 78% 55%, rgba(153, 196, 180, 0.05), transparent 18%)"
            : "radial-gradient(circle at 20% 50%, rgba(73, 115, 95, 0.08), transparent 18%), radial-gradient(circle at 50% 45%, rgba(39, 60, 50, 0.07), transparent 22%), radial-gradient(circle at 78% 55%, rgba(56, 87, 72, 0.06), transparent 18%)",
          animation: "pt-hub-wave-drift 34s cubic-bezier(0.42, 0, 0.2, 1) infinite",
          willChange: "transform, opacity",
        }}
      />
      <div
        className="absolute bottom-[10%] right-[-4%] h-[14rem] w-[62%] rounded-full blur-[70px]"
        style={{
          background: isLightMode
            ? "radial-gradient(circle at 20% 50%, rgba(120, 160, 188, 0.05), transparent 18%), radial-gradient(circle at 50% 45%, rgba(145, 176, 198, 0.045), transparent 22%), radial-gradient(circle at 78% 55%, rgba(153, 196, 180, 0.04), transparent 18%)"
            : "radial-gradient(circle at 20% 50%, rgba(73, 115, 95, 0.06), transparent 18%), radial-gradient(circle at 50% 45%, rgba(39, 60, 50, 0.05), transparent 22%), radial-gradient(circle at 78% 55%, rgba(56, 87, 72, 0.045), transparent 18%)",
          animation: "pt-hub-wave-drift 30s cubic-bezier(0.42, 0, 0.2, 1) infinite",
          animationDelay: "-12s",
          willChange: "transform, opacity",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: isLightMode
            ? "linear-gradient(180deg, rgba(255,255,255,0.11), transparent 18%, transparent 84%, rgba(15,23,42,0.06))"
            : "linear-gradient(180deg, rgba(255,255,255,0.03), transparent 18%, transparent 82%, rgba(0,0,0,0.28))",
        }}
      />
    </div>
  );
}

export function AppShellBackgroundLayer({
  animated = false,
  mode = "dark",
}: {
  animated?: boolean;
  mode?: AppShellBackgroundMode;
}) {
  return (
    <>
      {animated ? (
        <Suspense fallback={<AmbientShellBackground mode={mode} />}>
          <PtHubAnimatedBackground mode={mode} />
        </Suspense>
      ) : (
        <AmbientShellBackground mode={mode} />
      )}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            mode === "light"
              ? "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0), rgba(15,23,42,0.04))"
              : "linear-gradient(180deg,rgba(3,5,6,0.16),rgba(3,5,6,0.36))",
        }}
        aria-hidden="true"
      />
    </>
  );
}
