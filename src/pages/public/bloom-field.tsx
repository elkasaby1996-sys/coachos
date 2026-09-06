import { useEffect, useRef } from "react";

const BLOOM_SEED = 174074637;

const BLOBS = [
  {
    rgb: "251, 249, 241",
    x: 66.94,
    y: 46.43,
    stops: [19.02, 38.05, 57.07, 76.1],
  },
  {
    rgb: "11, 69, 51",
    x: 34.69,
    y: 66.31,
    stops: [12.73, 25.45, 38.18, 50.9],
  },
  {
    rgb: "40, 93, 73",
    x: 48.93,
    y: 19.32,
    stops: [16.75, 33.5, 50.25, 67],
  },
  {
    rgb: "211, 231, 221",
    x: 80.23,
    y: 87.54,
    stops: [10.28, 20.55, 30.83, 41.1],
  },
] as const;

function phaseFor(index: number, axis: number) {
  let value = (BLOOM_SEED ^ Math.imul(index + 1, 0x9e3779b1 + axis)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return ((value ^ (value >>> 16)) / 4294967296) * Math.PI * 2;
}

export function BloomField({
  className = "",
  motionAmount = 0.4,
  speed = 1,
}: {
  className?: string;
  motionAmount?: number;
  speed?: number;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || typeof window === "undefined") return;

    const renderMesh = (elapsedSeconds: number) => {
      const phase = elapsedSeconds * speed;
      const gradients = BLOBS.map((blob, index) => {
        const xPhase = phaseFor(index, 0);
        const yPhase = phaseFor(index, 1);
        const bloomPhase = phaseFor(index, 2);
        const x =
          blob.x +
          (Math.sin(phase * 0.55 + xPhase) - Math.sin(xPhase)) *
            14 *
            motionAmount;
        const y =
          blob.y +
          (Math.sin(phase * 0.43 + yPhase) - Math.sin(yPhase)) *
            14 *
            motionAmount;
        const bloom =
          (Math.cos(phase * 0.22 + bloomPhase) - Math.cos(bloomPhase)) *
          1.2 *
          motionAmount;
        const [soft, middle, feather, fade] = blob.stops.map(
          (stop) => stop + bloom,
        );

        return `radial-gradient(circle at ${x}% ${y}%, rgba(${blob.rgb}, 1) 0%, rgba(${blob.rgb}, 0.844) ${soft}%, rgba(${blob.rgb}, 0.5) ${middle}%, rgba(${blob.rgb}, 0.156) ${feather}%, rgba(${blob.rgb}, 0) ${fade}%)`;
      });

      field.style.backgroundImage = gradients.join(", ");
    };

    renderMesh(0);

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let animationFrame = 0;
    let elapsedSeconds = 0;
    let previousTime = performance.now();

    const animate = (now: number) => {
      if (document.visibilityState === "visible") {
        elapsedSeconds += (now - previousTime) / 1000;
        renderMesh(elapsedSeconds);
      }
      previousTime = now;
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [motionAmount, speed]);

  return (
    <div
      ref={fieldRef}
      className={`rs-bloom-field ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
