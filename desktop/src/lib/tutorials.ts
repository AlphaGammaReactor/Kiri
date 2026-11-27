// Tutorials: short guided walks through the real app, each in its own copy of the PARL–MAVS sample
// project so the person's work is never touched. Nothing is simulated: every step points at the real
// control, and steps that need an action wait until the person has done it.
import type { Screen } from "../shell/Sidebar";

export type TourStep = {
  screen?: Screen;     // go here when the step starts
  target?: string;     // CSS selector of the thing the step is about
  wait?: string;       // the step is done when this selector exists (e.g. a figure has appeared)
  click?: boolean;     // the step is done when the person clicks the target
};
export type Tutorial = { id: TutId; minutes: number; icon: "survival" | "tn" | "check" | "enrich" | "figure" | "own"; steps: TourStep[] };
export type TutId = "survival" | "tn" | "check" | "enrich" | "figure" | "own";

const CHART = ".ws-fig svg[role=img]";
const RUN = ".run-row";
const REL_TAB = ".ws-side [role=tab]:nth-child(2)";

export const TUTORIALS: Tutorial[] = [
  { id: "survival", minutes: 8, icon: "survival", steps: [
    { screen: "survival", target: ".ws-params" },
    { target: RUN, wait: CHART },
    { target: ".ws-fig" },
    { target: ".ws-side .tiles" },
    { target: ".ws-side .plain" },
    { target: "[data-tour=notebook]", click: true },
  ] },
  { id: "tn", minutes: 6, icon: "tn", steps: [
    { screen: "expression", target: ".ws-params .segmented" },
    { target: ".ws-params" },
    { target: RUN, wait: CHART },
    { target: ".ws-fig" },
    { target: ".ws-side .plain" },
    { target: REL_TAB, click: true },
  ] },
  { id: "check", minutes: 7, icon: "check", steps: [
    { screen: "survival", target: RUN, wait: CHART },
    { target: REL_TAB, click: true },
    { target: ".side-scroll" },
    { target: ".side-scroll" },
    { target: ".side-scroll" },
    { target: ".ws-actions" },
  ] },
  { id: "enrich", minutes: 9, icon: "enrich", steps: [
    { screen: "de", target: ".ws-params" },
    { target: ".ws-params" },
    { target: RUN, wait: CHART },
    { target: ".ws-fig .fig-viewer" },
    { target: ".de-results [role=tab]:nth-child(2)", click: true },
    { target: ".de-results" },
  ] },
  { id: "figure", minutes: 10, icon: "figure", steps: [
    { screen: "survival", target: RUN, wait: CHART },
    { target: "[data-tour=board]", click: true },
    { screen: "expression", target: RUN, wait: CHART },
    { target: "[data-tour=board]", click: true },
    { screen: "board", target: ".board-list" },
    { target: ".board-grid > aside:last-of-type" },
    { target: "[data-tour=check]", click: true },
    { target: ".dialog" },
    { target: "[data-tour=export]" },
  ] },
  { id: "own", minutes: 8, icon: "own", steps: [
    { screen: "import", target: ".imp-help" },
    { target: ".imp-drop", wait: ".imp-grid" },
    { target: ".imp-enc" },
    { target: ".imp-grid" },
    { target: ".imp .ws-actions .btn.primary", wait: ".imp-done" },
    { target: ".imp-done" },
  ] },
];

export const tutorial = (id: string) => TUTORIALS.find((x) => x.id === id);
export type TutProgress = Record<string, { step: number; done: boolean }>;
