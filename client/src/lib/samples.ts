// Built-in samples bundled with the app.
// Vite will inline these as static URLs / strings.

import samplePgnText from "@assets/RCC_Ladder_at_the_Library_-_04-26-26.pgn?raw";

import sheet1 from "@assets/1-Shayan-Khalichi-1795-Jeff-Martin-1975.jpg";
import sheet2 from "@assets/2-Jeremy-Blum-1487-William-Beitz-1434.jpg";
import sheet3 from "@assets/3-Karunya-Kathuria-1376-Charles-Blahous-1343.jpg";
import sheet4 from "@assets/4-Greg-Howland-1670-Vlad-Yakovchenko-1304.jpg";
import sheet5 from "@assets/5-Mark-Hickey-989-Greg-Whittier-811.jpg";
import sheet6a from "@assets/6-Peter-Yen-Hannah-Ccanee-pg-1.jpg";
import sheet6b from "@assets/6-Peter-Yen-Unr-Hannah-Ccancce-pg-2.jpg";

export interface SampleSheet {
  id: string;
  label: string;
  url: string;
  /** Suggested PGN match by white/black names (lowercased) */
  matchHint?: { white?: string; black?: string };
}

export const SAMPLE_PGN_TEXT: string = samplePgnText;
export const SAMPLE_PGN_LABEL = "RCC Ladder at the Library — 2026-04-26";

export const SAMPLE_SHEETS: SampleSheet[] = [
  {
    id: "1",
    label: "Bd 1 — Khalichi (1795) vs Martin (1975)",
    url: sheet1,
    matchHint: { white: "khalichi", black: "martin" },
  },
  {
    id: "2",
    label: "Bd 2 — Blum (1487) vs Beitz (1434)",
    url: sheet2,
    matchHint: { white: "blum", black: "beitz" },
  },
  {
    id: "3",
    label: "Bd 3 — Kathuria (1376) vs Blahous (1343)",
    url: sheet3,
    matchHint: { white: "kathuria", black: "blahous" },
  },
  {
    id: "4",
    label: "Bd 4 — Howland (1670) vs Yakovchenko (1304)",
    url: sheet4,
    matchHint: { white: "howland", black: "yakovchenko" },
  },
  {
    id: "5",
    label: "Bd 5 — Hickey (989) vs Whittier (811)",
    url: sheet5,
    matchHint: { white: "hickey", black: "whittier" },
  },
  {
    id: "6a",
    label: "Bd 6 (pg 1) — Yen vs Ccancce",
    url: sheet6a,
    matchHint: { white: "yen", black: "ccancce" },
  },
  {
    id: "6b",
    label: "Bd 6 (pg 2) — Yen vs Ccancce",
    url: sheet6b,
    matchHint: { white: "yen", black: "ccancce" },
  },
];
