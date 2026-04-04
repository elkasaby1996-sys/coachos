import { useEffect, useRef, useState } from "react";

type BackgroundQualityTier = "high" | "medium" | "low";
type PtHubThemeMode = "dark" | "light";
type ThreeModule = typeof import("three");

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type NavigatorWithHints = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
  deviceMemory?: number;
};

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_pointer;
  uniform vec3 u_base;
  uniform vec3 u_mistA;
  uniform vec3 u_mistB;
  uniform vec3 u_mistC;
  uniform vec3 u_sheen;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x)
      + (c - a) * u.y * (1.0 - u.x)
      + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = p * 2.0 + vec2(13.7, 8.1);
      amplitude *= 0.5;
    }

    return value;
  }

  float ridge(float value) {
    return 1.0 - abs(value * 2.0 - 1.0);
  }

  void main() {
    vec2 uv = vUv;
    vec2 aspectUv = uv * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
    vec2 pointer = vec2(
      u_pointer.x * (u_resolution.x / max(u_resolution.y, 1.0)),
      u_pointer.y
    );

    float time = u_time * 0.042;

    vec2 flowA = aspectUv * 0.9 + vec2(time * 0.19, -time * 0.08);
    vec2 flowB = aspectUv * 1.3 + vec2(-time * 0.12, time * 0.075);
    vec2 flowC = aspectUv * 0.68 + vec2(-time * 0.05, -time * 0.14);
    vec2 flowD = aspectUv * 1.96 + vec2(time * 0.08, time * 0.05);

    float fogA = smoothstep(0.18, 0.84, fbm(flowA));
    float fogB = smoothstep(0.22, 0.88, fbm(flowB + fogA * 0.4));
    float fogC = smoothstep(0.24, 0.9, fbm(flowC - fogB * 0.28));
    float fogDetail = ridge(fbm(flowD + fogC * 0.18));

    vec3 color = u_base;
    color += u_mistA * fogA * 0.48;
    color += u_mistB * fogB * 0.28;
    color += u_mistC * fogC * 0.2;
    color += mix(u_mistA, u_sheen, 0.26) * fogDetail * 0.06;

    float diagonalGlow = smoothstep(1.25, 0.15, distance(uv, vec2(0.28, 0.22)));
    float lowerDepth = smoothstep(0.0, 1.0, 1.0 - distance(uv, vec2(0.72, 0.84)));
    color += u_mistA * diagonalGlow * 0.18;
    color += u_mistC * lowerDepth * 0.1;

    float sheenPath = abs(uv.y - (0.24 + sin(uv.x * 2.4 + time * 1.1) * 0.035));
    float sheenBand = smoothstep(0.12, 0.0, sheenPath);
    float sheenNoise = smoothstep(0.4, 0.86, fbm(aspectUv * 1.6 + vec2(time * 0.18, -time * 0.08)));
    float sheen = sheenBand * sheenNoise;
    color += u_sheen * sheen * 0.1;

    float upperVeil = smoothstep(0.95, 0.08, distance(uv, vec2(0.58, 0.08)));
    color += u_sheen * upperVeil * 0.05;

    float pointerGlow = smoothstep(0.52, 0.0, distance(aspectUv, pointer));
    float pointerHalo = smoothstep(0.95, 0.18, distance(aspectUv, pointer + vec2(0.08, -0.04)));
    color += u_sheen * pointerGlow * 0.095;
    color += mix(u_mistA, u_sheen, 0.5) * pointerHalo * 0.05;

    float topLight = smoothstep(0.75, 0.0, distance(uv, vec2(0.5, -0.08)));
    color += mix(u_sheen, u_mistA, 0.45) * topLight * 0.075;

    float vignette = smoothstep(0.92, 0.2, distance(uv, vec2(0.5)));
    color *= 0.82 + vignette * 0.18;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const themePalettes: Record<
  PtHubThemeMode,
  {
    base: string;
    mistA: string;
    mistB: string;
    mistC: string;
    sheen: string;
    reducedTop: string;
    reducedBottom: string;
    reducedGlowA: string;
    reducedGlowB: string;
    reducedGlowC: string;
    radialOverlay: string;
    linearOverlay: string;
  }
> = {
  dark: {
    base: "#050607",
    mistA: "#294336",
    mistB: "#17231d",
    mistC: "#31483b",
    sheen: "#7f9788",
    reducedTop: "oklch(0.082_0.003_185)",
    reducedBottom: "oklch(0.048_0.002_185)",
    reducedGlowA: "oklch(0.26_0.008_170/0.26)",
    reducedGlowB: "oklch(0.18_0.005_190/0.18)",
    reducedGlowC: "oklch(0.14_0.003_160/0.12)",
    radialOverlay:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.02) 0%, transparent 22%, rgba(0, 0, 0, 0.06) 52%, rgba(0, 0, 0, 0.22) 100%)",
    linearOverlay:
      "linear-gradient(180deg, rgba(0, 0, 0, 0.18), transparent 18%, transparent 80%, rgba(0, 0, 0, 0.24))",
  },
  light: {
    base: "#e7edf1",
    mistA: "#9fb8c9",
    mistB: "#b8c7df",
    mistC: "#cedae2",
    sheen: "#5b87a0",
    reducedTop: "oklch(0.948_0.006_188)",
    reducedBottom: "oklch(0.886_0.01_186)",
    reducedGlowA: "oklch(0.68_0.032_188/0.18)",
    reducedGlowB: "oklch(0.72_0.028_206/0.16)",
    reducedGlowC: "oklch(0.75_0.02_194/0.14)",
    radialOverlay:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.05) 24%, transparent 48%, rgba(15, 23, 42, 0.05) 100%)",
    linearOverlay:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 18%, transparent 82%, rgba(30, 41, 59, 0.05))",
  },
};

function ReducedMotionFallback({ mode }: { mode: PtHubThemeMode }) {
  const palette = themePalettes[mode];
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${palette.reducedTop}, transparent 24%, ${palette.reducedBottom})`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 22% 18%, ${palette.reducedGlowA}, transparent 40%), radial-gradient(ellipse at 78% 22%, ${palette.reducedGlowB}, transparent 42%), radial-gradient(ellipse at 54% 80%, ${palette.reducedGlowC}, transparent 44%)`,
        }}
      />
    </>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => {
        mediaQuery.removeEventListener("change", updatePreference);
      };
    }

    mediaQuery.addListener(updatePreference);
    return () => {
      mediaQuery.removeListener(updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

function AmbientMotionLayer({ mode }: { mode: PtHubThemeMode }) {
  return (
    <>
      <div
        className={`pt-hub-bg-orb pt-hub-bg-orb-primary absolute transform-gpu ${
          mode === "light"
            ? "-left-[8%] top-[-6%] h-[28rem] w-[28rem]"
            : "-left-[12%] top-[-8%] h-[32rem] w-[32rem]"
        }`}
      />
      <div
        className={`pt-hub-bg-orb pt-hub-bg-orb-secondary absolute transform-gpu ${
          mode === "light"
            ? "right-[-8%] top-[10%] h-[24rem] w-[24rem]"
            : "right-[-10%] top-[8%] h-[28rem] w-[28rem]"
        }`}
      />
      <div
        className={`pt-hub-bg-orb pt-hub-bg-orb-success absolute transform-gpu ${
          mode === "light"
            ? "bottom-[-14%] left-[24%] h-[24rem] w-[24rem]"
            : "bottom-[-18%] left-[18%] h-[30rem] w-[30rem]"
        }`}
      />
      <div
        className={`pt-hub-bg-wave absolute transform-gpu ${
          mode === "light"
            ? "left-[12%] top-[18%] h-[16rem] w-[68%]"
            : "left-[8%] top-[16%] h-[20rem] w-[78%]"
        }`}
      />
      <div
        className={`pt-hub-bg-wave pt-hub-bg-wave-delayed absolute transform-gpu ${
          mode === "light"
            ? "bottom-[12%] right-[0%] h-[14rem] w-[62%]"
            : "bottom-[10%] right-[-6%] h-[16rem] w-[72%]"
        }`}
      />
    </>
  );
}

function detectBackgroundQualityTier(): BackgroundQualityTier {
  if (typeof window === "undefined") return "medium";

  const navigatorHints = navigator as NavigatorWithHints;
  const deviceMemory = navigatorHints.deviceMemory ?? 8;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;
  const connection = navigatorHints.connection;
  const effectiveType = connection?.effectiveType ?? "";
  const saveData = connection?.saveData ?? false;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const isSmallViewport = window.innerWidth < 900;
  const devicePixelRatio = window.devicePixelRatio || 1;

  if (
    saveData ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    deviceMemory <= 2 ||
    hardwareConcurrency <= 2
  ) {
    return "low";
  }

  if (
    deviceMemory <= 4 ||
    hardwareConcurrency <= 4 ||
    (isCoarsePointer && isSmallViewport) ||
    devicePixelRatio >= 3
  ) {
    return "medium";
  }

  return "high";
}

function getRendererConfig(quality: BackgroundQualityTier) {
  switch (quality) {
    case "high":
      return {
        antialias: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        enablePointerTracking: true,
      };
    case "medium":
      return {
        antialias: false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        enablePointerTracking: true,
      };
    default:
      return {
        antialias: false,
        pixelRatio: 1,
        enablePointerTracking: true,
      };
  }
}

export function PtHubAnimatedBackground({
  mode,
  scrollActive = false,
}: {
  mode: PtHubThemeMode;
  scrollActive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [hasWebglBackground, setHasWebglBackground] = useState(false);
  const [quality, setQuality] = useState<BackgroundQualityTier>("medium");
  const palette = themePalettes[mode];

  useEffect(() => {
    if (reduceMotion) {
      setQuality("low");
      return;
    }

    const updateQuality = () => {
      setQuality(detectBackgroundQualityTier());
    };

    updateQuality();
    window.addEventListener("resize", updateQuality);

    return () => {
      window.removeEventListener("resize", updateQuality);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !canvasRef.current) {
      setHasWebglBackground(false);
      return;
    }

    const canvas = canvasRef.current;
    const rendererConfig = getRendererConfig(quality);
    const windowWithIdleCallback = window as WindowWithIdleCallback;
    let cancelled = false;
    let frameId = 0;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    let cleanupScene: (() => void) | undefined;

    const bootRenderer = async () => {
      let THREE: ThreeModule;

      try {
        THREE = await import("three");
      } catch {
        if (!cancelled) {
          setHasWebglBackground(false);
        }
        return;
      }

      if (cancelled || !canvas.parentElement) return;

      let renderer: import("three").WebGLRenderer | null = null;
      let geometry: import("three").PlaneGeometry | null = null;
      let material: import("three").ShaderMaterial | null = null;
      let timer: import("three").Timer | null = null;
      let isDocumentVisible = document.visibilityState === "visible";
      let lastRenderTime = 0;

      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: rendererConfig.antialias,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        });
        renderer.setPixelRatio(rendererConfig.pixelRatio);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const pointerTarget = canvas.parentElement;

        geometry = new THREE.PlaneGeometry(2, 2);
        const uniforms = {
          u_resolution: { value: new THREE.Vector2(1, 1) },
          u_time: { value: 0 },
          u_pointer: { value: new THREE.Vector2(0.5, 0.24) },
          u_base: { value: new THREE.Color(palette.base) },
          u_mistA: { value: new THREE.Color(palette.mistA) },
          u_mistB: { value: new THREE.Color(palette.mistB) },
          u_mistC: { value: new THREE.Color(palette.mistC) },
          u_sheen: { value: new THREE.Color(palette.sheen) },
        };
        material = new THREE.ShaderMaterial({
          uniforms,
          vertexShader,
          fragmentShader,
          depthWrite: false,
          depthTest: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        const resize = () => {
          if (!canvas.parentElement || !renderer) return;
          const { clientWidth, clientHeight } = canvas.parentElement;
          renderer.setSize(clientWidth, clientHeight, false);
          uniforms.u_resolution.value.set(clientWidth, clientHeight);
        };

        resize();
        window.addEventListener("resize", resize);

        const restingPointer = new THREE.Vector2(0.5, 0.24);
        const pointerTargetValue = restingPointer.clone();

        const handlePointerMove = (event: PointerEvent) => {
          if (!rendererConfig.enablePointerTracking) return;
          const rect = pointerTarget.getBoundingClientRect();
          const withinBounds =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;

          if (!withinBounds) {
            pointerTargetValue.copy(restingPointer);
            return;
          }

          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          pointerTargetValue.set(
            THREE.MathUtils.lerp(0.16, 0.84, x),
            THREE.MathUtils.lerp(0.15, 0.85, 1 - y),
          );
        };

        const handleVisibilityChange = () => {
          isDocumentVisible = document.visibilityState === "visible";
        };

        const handleContextLost = (event: Event) => {
          event.preventDefault();
          setHasWebglBackground(false);
          setQuality((current) => {
            if (current === "high") return "medium";
            return "low";
          });
        };

        const handleContextRestored = () => {
          setHasWebglBackground(false);
        };

        if (rendererConfig.enablePointerTracking) {
          window.addEventListener("pointermove", handlePointerMove, {
            passive: true,
          });
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);
        canvas.addEventListener("webglcontextlost", handleContextLost, false);
        canvas.addEventListener(
          "webglcontextrestored",
          handleContextRestored,
          false,
        );

        timer = new THREE.Timer();
        timer.connect(document);
        setHasWebglBackground(true);

        const render = () => {
          if (!renderer || !timer) return;
          if (!isDocumentVisible) {
            frameId = window.requestAnimationFrame(render);
            return;
          }
          const now = performance.now();
          const frameBudget = scrollActive ? 1000 / 42 : 1000 / 60;
          if (now - lastRenderTime < frameBudget) {
            frameId = window.requestAnimationFrame(render);
            return;
          }
          lastRenderTime = now;
          timer.update();
          uniforms.u_time.value = timer.getElapsed();
          uniforms.u_pointer.value.lerp(pointerTargetValue, 0.04);
          renderer.render(scene, camera);
          frameId = window.requestAnimationFrame(render);
        };

        render();

        cleanupScene = () => {
          setHasWebglBackground(false);
          window.cancelAnimationFrame(frameId);
          window.removeEventListener("resize", resize);
          if (rendererConfig.enablePointerTracking) {
            window.removeEventListener("pointermove", handlePointerMove);
          }
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
          );
          canvas.removeEventListener(
            "webglcontextlost",
            handleContextLost,
            false,
          );
          canvas.removeEventListener(
            "webglcontextrestored",
            handleContextRestored,
            false,
          );
          timer?.dispose();
          geometry?.dispose();
          material?.dispose();
          renderer?.dispose();
        };
      } catch {
        setHasWebglBackground(false);
        setQuality((current) => {
          if (current === "high") return "medium";
          return "low";
        });
        renderer?.dispose();
        geometry?.dispose();
        material?.dispose();
        timer?.dispose();
      }
    };

    if (typeof windowWithIdleCallback.requestIdleCallback === "function") {
      idleHandle = windowWithIdleCallback.requestIdleCallback(
        () => {
          void bootRenderer();
        },
        { timeout: 180 },
      );
    } else {
      timeoutHandle = window.setTimeout(() => {
        void bootRenderer();
      }, 48);
    }

    return () => {
      cancelled = true;
      if (
        idleHandle !== null &&
        typeof windowWithIdleCallback.cancelIdleCallback === "function"
      ) {
        windowWithIdleCallback.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
      cleanupScene?.();
    };
  }, [
    mode,
    palette.base,
    palette.mistA,
    palette.mistB,
    palette.mistC,
    palette.sheen,
    quality,
    reduceMotion,
    scrollActive,
  ]);

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-20 overflow-hidden"
      aria-hidden="true"
    >
      {reduceMotion ? (
        <ReducedMotionFallback mode={mode} />
      ) : (
        <AmbientMotionLayer mode={mode} />
      )}
      {!reduceMotion ? (
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
            hasWebglBackground
              ? mode === "light"
                ? "opacity-60"
                : "opacity-100"
              : "opacity-0"
          }`}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{ background: palette.radialOverlay }}
      />
      <div
        className="absolute inset-0"
        style={{ background: palette.linearOverlay }}
      />
    </div>
  );
}
