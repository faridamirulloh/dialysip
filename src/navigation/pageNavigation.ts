import type { ScreenName } from "./types";

type PageDirection = "previous" | "next";

const mainPageOrder: ScreenName[] = ["dashboard", "manual", "history", "settings"];
const transitionOrder: ScreenName[] = ["dashboard", "manual", "history", "settings", "pair", "calibration"];

export function getSwipeTargetScreen(currentScreen: ScreenName, direction: PageDirection): ScreenName | null {
  const currentIndex = mainPageOrder.indexOf(currentScreen);

  if (currentIndex === -1) {
    return null;
  }

  const targetIndex = currentIndex + (direction === "next" ? 1 : -1);
  return mainPageOrder[targetIndex] ?? null;
}

export function getScreenTransitionDirection(previousScreen: ScreenName, nextScreen: ScreenName): -1 | 0 | 1 {
  const previousIndex = transitionOrder.indexOf(previousScreen);
  const nextIndex = transitionOrder.indexOf(nextScreen);

  if (previousIndex === -1 || nextIndex === -1 || previousIndex === nextIndex) {
    return 0;
  }

  return nextIndex > previousIndex ? 1 : -1;
}
