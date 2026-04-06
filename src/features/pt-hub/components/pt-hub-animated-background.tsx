import { useEffect, useRef, useState } from "react";

type BackgroundQualityTier = "high" | "medium" | "low";
type PtHubThemeMode = "dark" | "light";

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

type WebGlContext = WebGLRenderingContext | WebGL2RenderingContext;

type RendererConfig = {
  antialias: boolean;
  pixelRatio: number;
  enablePointerTracking: boolean;
};

const vertexShader = `
  attribute vec2 a_position;
  varying vec2 vUv;

  void main() {
    vUv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
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
    mistA: "#98b1c1",
    mistB: "#b2c2d7",
    mistC: "#c8d5de",
    sheen: "#567f97",
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
        antialias: false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        enablePointerTracking: true,
      };
    case "medium":
      return {
        antialias: false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.4),
        enablePointerTracking: false,
      };
    default:
      return {
        antialias: false,
        pixelRatio: 1,
        enablePointerTracking: false,
      };
  }
}

function hexToNormalizedRgb(hex: string) {
  const sanitized = hex.replace("#", "");
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : sanitized;
  const intValue = Number.parseInt(normalized, 16);
  return [
    ((intValue >> 16) & 255) / 255,
    ((intValue >> 8) & 255) / 255,
    (intValue & 255) / 255,
  ] as const;
}

function createShader(gl: WebGlContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create WebGL shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(
  gl: WebGlContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("Unable to create WebGL program.");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(info);
  }
  return { program, vertex, fragment };
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
      if (cancelled || !canvas.parentElement) return;

      let gl: WebGlContext | null = null;
      let program: WebGLProgram | null = null;
      let vertexShaderObject: WebGLShader | null = null;
      let fragmentShaderObject: WebGLShader | null = null;
      let positionBuffer: WebGLBuffer | null = null;
      let isDocumentVisible = document.visibilityState === "visible";
      let lastRenderTime = 0;
      let startTime = performance.now();

      try {
        const contextAttributes: WebGLContextAttributes = {
          alpha: true,
          antialias: rendererConfig.antialias,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
        };
        gl =
          (canvas.getContext("webgl2", contextAttributes) as WebGlContext | null) ??
          (canvas.getContext("webgl", contextAttributes) as WebGlContext | null) ??
          (canvas.getContext("experimental-webgl", contextAttributes) as WebGlContext | null);

        if (!gl) {
          throw new Error("WebGL is not available.");
        }

        const compiled = createProgram(gl, vertexShader, fragmentShader);
        program = compiled.program;
        vertexShaderObject = compiled.vertex;
        fragmentShaderObject = compiled.fragment;

        positionBuffer = gl.createBuffer();
        if (!positionBuffer) {
          throw new Error("Unable to create background buffer.");
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1,
          ]),
          gl.STATIC_DRAW,
        );

        gl.useProgram(program);

        const positionLocation = gl.getAttribLocation(program, "a_position");
        const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
        const timeLocation = gl.getUniformLocation(program, "u_time");
        const pointerLocation = gl.getUniformLocation(program, "u_pointer");
        const baseLocation = gl.getUniformLocation(program, "u_base");
        const mistALocation = gl.getUniformLocation(program, "u_mistA");
        const mistBLocation = gl.getUniformLocation(program, "u_mistB");
        const mistCLocation = gl.getUniformLocation(program, "u_mistC");
        const sheenLocation = gl.getUniformLocation(program, "u_sheen");

        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.clearColor(0, 0, 0, 0);

        const baseColor = hexToNormalizedRgb(palette.base);
        const mistAColor = hexToNormalizedRgb(palette.mistA);
        const mistBColor = hexToNormalizedRgb(palette.mistB);
        const mistCColor = hexToNormalizedRgb(palette.mistC);
        const sheenColor = hexToNormalizedRgb(palette.sheen);
        const pointerTarget = canvas.parentElement;
        const pointerCurrent = { x: 0.5, y: 0.24 };
        const pointerTargetValue = { x: 0.5, y: 0.24 };

        const resize = () => {
          if (!canvas.parentElement || !gl) return;
          const { clientWidth, clientHeight } = canvas.parentElement;
          const width = Math.max(
            1,
            Math.round(clientWidth * rendererConfig.pixelRatio),
          );
          const height = Math.max(
            1,
            Math.round(clientHeight * rendererConfig.pixelRatio),
          );
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          gl.viewport(0, 0, width, height);
          gl.useProgram(program);
          gl.uniform2f(resolutionLocation, width, height);
          gl.uniform3f(baseLocation, ...baseColor);
          gl.uniform3f(mistALocation, ...mistAColor);
          gl.uniform3f(mistBLocation, ...mistBColor);
          gl.uniform3f(mistCLocation, ...mistCColor);
          gl.uniform3f(sheenLocation, ...sheenColor);
        };

        resize();
        window.addEventListener("resize", resize);

        const handlePointerMove = (event: PointerEvent) => {
          if (!rendererConfig.enablePointerTracking) return;
          const rect = pointerTarget.getBoundingClientRect();
          const withinBounds =
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;

          if (!withinBounds) {
            pointerTargetValue.x = 0.5;
            pointerTargetValue.y = 0.24;
            return;
          }

          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          pointerTargetValue.x = 0.16 + (0.84 - 0.16) * x;
          pointerTargetValue.y = 0.15 + (0.85 - 0.15) * (1 - y);
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

        setHasWebglBackground(true);

        const render = () => {
          if (!isDocumentVisible) {
            frameId = window.requestAnimationFrame(render);
            return;
          }
          if (!gl || !program) return;
          const now = performance.now();
          const frameBudget = scrollActive ? 1000 / 42 : 1000 / 60;
          if (now - lastRenderTime < frameBudget) {
            frameId = window.requestAnimationFrame(render);
            return;
          }
          lastRenderTime = now;
          pointerCurrent.x += (pointerTargetValue.x - pointerCurrent.x) * 0.04;
          pointerCurrent.y += (pointerTargetValue.y - pointerCurrent.y) * 0.04;
          gl.useProgram(program);
          gl.uniform1f(timeLocation, (now - startTime) / 1000);
          gl.uniform2f(pointerLocation, pointerCurrent.x, pointerCurrent.y);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
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
          if (positionBuffer) {
            gl?.deleteBuffer(positionBuffer);
          }
          if (program) {
            gl?.deleteProgram(program);
          }
          if (vertexShaderObject) {
            gl?.deleteShader(vertexShaderObject);
          }
          if (fragmentShaderObject) {
            gl?.deleteShader(fragmentShaderObject);
          }
        };
      } catch {
        setHasWebglBackground(false);
        setQuality((current) => {
          if (current === "high") return "medium";
          return "low";
        });
        if (positionBuffer && gl) {
          gl.deleteBuffer(positionBuffer);
        }
        if (program && gl) {
          gl.deleteProgram(program);
        }
        if (vertexShaderObject && gl) {
          gl.deleteShader(vertexShaderObject);
        }
        if (fragmentShaderObject && gl) {
          gl.deleteShader(fragmentShaderObject);
        }
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
                ? "opacity-54"
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
