"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * v5 · Reveal — IntersectionObserver-driven scroll reveal.
 *
 * Wraps children in a single `<div data-reveal="">` whose initial state
 * (opacity 0 + 8px translateY) lives in layout.tsx CSS. When 25% of the
 * div enters viewport we set `data-revealed="true"` and CSS transitions
 * take over (220ms). Reduced-motion preference cuts both the initial
 * transform and the transition (also in layout.tsx).
 *
 * Single observer per Reveal instance keeps the math simple. No staggered
 * children — that would read as v3 TextStagger anti-pattern.
 *
 * Always renders a `<div>` to keep the type signature dead-simple. If the
 * reveal target is itself a semantic landmark (header/section/article),
 * the caller renders the landmark INSIDE this `<div>` — DOM order is the
 * same and the wrapper div is purely presentational.
 */
export default function Reveal({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).setAttribute("data-revealed", "true");
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal="" className={className} style={style}>
      {children}
    </div>
  );
}
