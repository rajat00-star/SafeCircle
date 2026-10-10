// Shared helpers for the WebGL scenes: one place decides how much rendering a device gets.
export type Tier = "high" | "low" | "fallback";

export function pickTier(): Tier {
  if (typeof window === "undefined") return "fallback";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return "fallback";
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "fallback";
  } catch {
    return "fallback";
  }
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  if (cores <= 4 || mem <= 4 || window.innerWidth < 760) return "low";
  return "high";
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
