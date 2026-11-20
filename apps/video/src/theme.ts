import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { Easing, interpolate } from "remotion";

// Palette mirrors apps/web/styles.css so the video matches the site.
export const C = {
  paper: "#f8f8f4",
  white: "#ffffff",
  ink: "#172523",
  muted: "#53615e",
  line: "#cbd4cf",
  dark: "#173f3b",
  green: "#2b6a60",
  pale: "#e9efeb",
  mint: "#a9d4c3",
  red: "#a34237",
  redPale: "#f5e9e5",
  term: "#0f1f1d",
  termText: "#d7e4df",
  termDim: "#7f948e",
  amber: "#e0b04a",
} as const;

export const sans = loadManrope("normal", { weights: ["500", "700", "800"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] }).fontFamily;

export const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** 0 → 1 between two frames, eased and clamped. */
export const progress = (frame: number, start: number, duration: number): number =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

/** Slide-up + fade values for an element that enters at `start`. */
export const enter = (frame: number, start: number, distance = 36) => {
  const p = progress(frame, start, 22);
  return { opacity: p, translate: `0px ${(1 - p) * distance}px` } as const;
};
