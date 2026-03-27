import type { TinaBoundaryNote, TinaStageBlueprint } from "@/tina/types";

export const TINA_STAGES: TinaStageBlueprint[] = [
  {
    id: "bootstrap",
    title: "Start With Last Year",
    summary: "Bring in last year's tax return first so Tina can fill in a lot of the basics for you.",
    deliverable: "Last year's return saved and ready to read",
    status: "live",
  },
  {
    id: "organizer",
    title: "Easy Business Questions",
    summary: "Answer a few simple questions so Tina knows what kind of business taxes to build.",
    deliverable: "Business profile and return type check",
    status: "live",
  },
  {
    id: "ingestion",
    title: "Bring In Your Papers",
    summary: "Upload papers and connect QuickBooks so Tina can sort out what belongs where.",
    deliverable: "Saved documents and source facts",
    status: "next",
  },
  {
    id: "reconciliation",
    title: "Tina Sorts Things Out",
    summary: "Tina checks the numbers, asks for anything missing, and keeps a clean paper trail.",
    deliverable: "Open questions and cleaned-up workpapers",
    status: "planned",
  },
  {
    id: "review",
    title: "Review The Hard Stuff",
    summary: "Tina shows the few things that still need a yes, no, or better answer before the package is final.",
    deliverable: "Clear approval screen",
    status: "planned",
  },
  {
    id: "package",
    title: "Download The Tax Package",
    summary: "When the blockers are gone, Tina puts together the forms, summary, and CPA packet for you.",
    deliverable: "Ready-to-download tax package",
    status: "planned",
  },
];

export const TINA_BOUNDARY_NOTES: TinaBoundaryNote[] = [
  {
    title: "Own Shell",
    summary: "Tina has her own area inside Sentinel so she can feel simple now and still move into her own app later.",
  },
  {
    title: "Own Domain",
    summary: "Tina keeps her tax code separate from the CRM so the product stays clean and easy to move later.",
  },
  {
    title: "Deterministic Math",
    summary: "AI can read, sort, and explain. The real tax math still lives in code so the numbers stay dependable.",
  },
];

export const TINA_NOW_FOCUS = [
  "Persist the Tina guide inside the repo",
  "Stand up Tina's private shell and route boundary",
  "Start the organizer and prior-year bootstrap flow",
  "Keep the first filing lane to Schedule C / single-member LLC",
];
