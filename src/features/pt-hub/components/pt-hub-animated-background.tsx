import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";

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

    float time = u_time * 0.03;

    vec2 flowA = aspectUv * 0.92 + vec2(time * 0.16, -time * 0.06);
    vec2 flowB = aspectUv * 1.28 + vec2(-time * 0.1, time * 0.06);
    vec2 flowC = aspectUv * 0.72 + vec2(-time * 0.04, -time * 0.12);
    vec2 flowD = aspectUv * 1.92 + vec2(time * 0.06, time * 0.04);

    float fogA = smoothstep(0.18, 0.84, fbm(flowA));
    float fogB = smoothstep(0.22, 0.88, fbm(flowB + fogA * 0.4));
    float fogC = smoothstep(0.24, 0.9, fbm(flowC - fogB * 0.28));
    float fogDetail = ridge(fbm(flowD + fogC * 0.18));

    vec3 color = u_base;
    color += u_mistA * fogA * 0.48;
    color += u_mistB * fogB * 0.28;
    color += u_mistC * fogC * 0.2;
    color += mix(u_mistA, u_sheen, 0.24) * fogDetail * 0.045;

    float diagonalGlow = smoothstep(1.25, 0.15, distance(uv, vec2(0.28, 0.22)));
    float lowerDepth = smoothstep(0.0, 1.0, 1.0 - distance(uv, vec2(0.72, 0.84)));
    color += u_mistA * diagonalGlow * 0.14;
    color += u_mistC * lowerDepth * 0.08;

    float sheenPath = abs(uv.y - (0.24 + sin(uv.x * 2.4 + time * 1.1) * 0.035));
    float sheenBand = smoothstep(0.12, 0.0, sheenPath);
    float sheenNoise = smoothstep(0.4, 0.86, fbm(aspectUv * 1.6 + vec2(time * 0.18, -time * 0.08)));
    float sheen = sheenBand * sheenNoise;
    color += u_sheen * sheen * 0.08;

    float upperVeil = smoothstep(0.95, 0.08, distance(uv, vec2(0.58, 0.08)));
    color += u_sheen * upperVeil * 0.035;

    float pointerGlow = smoothstep(0.52, 0.0, distance(aspectUv, pointer));
    float pointerHalo = smoothstep(0.95, 0.18, distance(aspectUv, pointer + vec2(0.08, -0.04)));
    color += u_sheen * pointerGlow * 0.065;
    color += mix(u_mistA, u_sheen, 0.5) * pointerHalo * 0.03;

    float topLight = smoothstep(0.75, 0.0, distance(uv, vec2(0.5, -0.08)));
    color += mix(u_sheen, u_mistA, 0.45) * topLight * 0.06;

    float vignette = smoothstep(0.92, 0.2, distance(uv, vec2(0.5)));
    color *= 0.82 + vignette * 0.18;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function ReducedMotionFallback() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,oklch(0.082_0.003_185),transparent_24%,oklch(0.048_0.002_185))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_22%_18%,oklch(0.26_0.008_170/0.26),transparent_40%),radial-gradient(ellipse_at_78%_22%,oklch(0.18_0.005_190/0.18),transparent_42%),radial-gradient(ellipse_at_54%_80%,oklch(0.14_0.003_160/0.12),transparent_44%)]" />
    </>
  );
}

export function PtHubAnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_time: { value: 0 },
      u_pointer: { value: new THREE.Vector2(0.5, 0.24) },
      u_base: { value: new THREE.Color("#050607") },
      u_mistA: { value: new THREE.Color("#294336") },
      u_mistB: { value: new THREE.Color("#17231d") },
      u_mistC: { value: new THREE.Color("#31483b") },
      u_sheen: { value: new THREE.Color("#7f9788") },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      if (!canvas.parentElement) return;
      const { clientWidth, clientHeight } = canvas.parentElement;
      renderer.setSize(clientWidth, clientHeight, false);
      uniforms.u_resolution.value.set(clientWidth, clientHeight);
    };

    resize();
    window.addEventListener("resize", resize);

    const restingPointer = new THREE.Vector2(0.5, 0.24);

    const handlePointerMove = (event: PointerEvent) => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      uniforms.u_pointer.value.set(
        THREE.MathUtils.lerp(0.18, 0.82, x),
        THREE.MathUtils.lerp(0.18, 0.82, 1 - y),
      );
    };

    const handlePointerLeave = () => {
      uniforms.u_pointer.value.copy(restingPointer);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);

    const timer = new THREE.Timer();
    timer.connect(document);
    let frameId = 0;

    const render = () => {
      timer.update();
      uniforms.u_time.value = timer.getElapsed();
      uniforms.u_pointer.value.lerp(restingPointer, 0.008);
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      timer.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [reduceMotion]);

  if (reduceMotion) {
    return <ReducedMotionFallback />;
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-100"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.02)_0%,transparent_22%,rgba(0,0,0,0.06)_52%,rgba(0,0,0,0.22)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),transparent_18%,transparent_80%,rgba(0,0,0,0.24))]" />
    </>
  );
}
