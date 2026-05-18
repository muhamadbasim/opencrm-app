import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition?: () => void;
};

declare global {
  interface Document {
    startViewTransition?: (
      callback: () => Promise<void> | void,
    ) => ViewTransitionLike;
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function applyThemeTransition(duration = 250) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.add("theme-transitioning");

  window.setTimeout(() => {
    root.classList.remove("theme-transitioning");
  }, duration);
}

interface ThemeAnimationOptions {
  duration?: number;
  reverse?: boolean;
  x?: number;
  y?: number;
}

export async function animateThemeChange(
  updateTheme: () => Promise<void> | void,
  options: ThemeAnimationOptions = {},
) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    await updateTheme();
    return;
  }

  const duration = options.duration ?? 650;
  const x = options.x ?? window.innerWidth / 2;
  const y = options.y ?? window.innerHeight / 2;
  const reverse = options.reverse ?? false;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!document.startViewTransition || prefersReducedMotion) {
    applyThemeTransition(Math.min(duration, 300));
    await updateTheme();
    return;
  }

  const maxX = Math.max(x, window.innerWidth - x);
  const maxY = Math.max(y, window.innerHeight - y);
  const endRadius = Math.hypot(maxX, maxY);
  const midRadius = endRadius * 0.6;
  const transformOrigin = `${x}px ${y}px`;

  try {
    const transition = document.startViewTransition(async () => {
      await updateTheme();
    });

    await transition.updateCallbackDone;
    await transition.ready;

    const keyframes: Keyframe[] = reverse
      ? [
          {
            clipPath: `circle(0px at ${x}px ${y}px)`,
            transform: "scale(0.88)",
            transformOrigin,
          },
          {
            clipPath: `circle(${midRadius}px at ${x}px ${y}px)`,
            transform: "scale(1.03)",
            transformOrigin,
            offset: 0.6,
          },
          {
            clipPath: `circle(${endRadius}px at ${x}px ${y}px)`,
            transform: "scale(1)",
            transformOrigin,
          },
        ]
      : [
          {
            clipPath: `circle(${endRadius}px at ${x}px ${y}px)`,
            transform: "scale(1)",
            transformOrigin,
          },
          {
            clipPath: `circle(${midRadius}px at ${x}px ${y}px)`,
            transform: "scale(0.98)",
            transformOrigin,
            offset: 0.6,
          },
          {
            clipPath: `circle(0px at ${x}px ${y}px)`,
            transform: "scale(0.88)",
            transformOrigin,
          },
        ];

    const animation = document.documentElement.animate(keyframes, {
      duration,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "both",
      pseudoElement: reverse
        ? "::view-transition-new(root)"
        : "::view-transition-old(root)",
    });

    await Promise.all([animation.finished, transition.finished]);
  } catch {
    applyThemeTransition(Math.min(duration, 300));
    await updateTheme();
  }
}
