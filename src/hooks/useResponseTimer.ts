import { useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 30_000;
const TICK_MS = 100;

export function useResponseTimer(active: boolean, resetKey: string) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(0);
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    elapsedRef.current = 0;
    lastTickRef.current = performance.now();
    lastInteractionRef.current = performance.now();
    setElapsed(0);
  }, [resetKey]);

  useEffect(() => {
    const markInteraction = () => {
      lastInteractionRef.current = performance.now();
    };

    const events: Array<keyof WindowEventMap> = [
      "keydown",
      "pointerdown",
      "touchstart"
    ];
    events.forEach((eventName) =>
      window.addEventListener(eventName, markInteraction, { passive: true })
    );

    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, markInteraction)
      );
    };
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    lastTickRef.current = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      const isVisible = document.visibilityState === "visible";
      const hasFocus = document.hasFocus();
      const isActive = now - lastInteractionRef.current < IDLE_LIMIT_MS;

      if (isVisible && hasFocus && isActive) {
        elapsedRef.current += delta;
        setElapsed(elapsedRef.current);
      }
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [active]);

  return {
    elapsed,
    getElapsed: () => elapsedRef.current
  };
}
