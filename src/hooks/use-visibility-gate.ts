import { useEffect, useRef, useState } from "react";

export function useVisibilityGate<T extends HTMLElement>({
  rootMargin = "240px 0px",
  threshold = 0.01,
  enabled = true,
}: {
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean;
} = {}) {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled || isVisible) return;

    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [enabled, isVisible, rootMargin, threshold]);

  return { ref, isVisible };
}
