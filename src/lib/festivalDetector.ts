// Auto-detect Indian & Japanese festivals based on approximate calendar dates
// Returns recommended theme and particle effect for the current date

import { ThemeType, ParticleEffect } from "@/hooks/useSiteSettings";

interface FestivalConfig {
  name: string;
  theme: ThemeType;
  particle: ParticleEffect;
  // Month (0-indexed), day range [start, end]
  dates: { month: number; startDay: number; endDay: number }[];
}

// Approximate dates — festivals shift yearly but these cover common windows
const FESTIVALS: FestivalConfig[] = [
  // Indian festivals
  {
    name: "Diwali",
    theme: "diwali",
    particle: "diyas",
    dates: [
      { month: 9, startDay: 15, endDay: 31 },  // Oct 15-31
      { month: 10, startDay: 1, endDay: 15 },   // Nov 1-15
    ],
  },
  {
    name: "Holi",
    theme: "holi",
    particle: "colors",
    dates: [
      { month: 2, startDay: 1, endDay: 20 },   // Mar 1-20
    ],
  },
  {
    name: "Independence Day",
    theme: "independence-day",
    particle: "tricolor",
    dates: [
      { month: 7, startDay: 13, endDay: 17 },  // Aug 13-17
    ],
  },
  {
    name: "Republic Day",
    theme: "independence-day",
    particle: "tricolor",
    dates: [
      { month: 0, startDay: 24, endDay: 28 },  // Jan 24-28
    ],
  },
  // Japanese festivals
  {
    name: "Cherry Blossom Season",
    theme: "cherry-blossom",
    particle: "sakura",
    dates: [
      { month: 2, startDay: 20, endDay: 31 },  // Mar 20-31
      { month: 3, startDay: 1, endDay: 15 },    // Apr 1-15
    ],
  },
  {
    name: "Obon / Matsuri Season",
    theme: "matsuri",
    particle: "lanterns",
    dates: [
      { month: 6, startDay: 10, endDay: 31 },  // Jul 10-31
      { month: 7, startDay: 1, endDay: 12 },    // Aug 1-12
    ],
  },
  // Winter / New Year
  {
    name: "Winter / Christmas",
    theme: "arctic",
    particle: "snow",
    dates: [
      { month: 11, startDay: 15, endDay: 31 },  // Dec 15-31
      { month: 0, startDay: 1, endDay: 5 },      // Jan 1-5
    ],
  },
];

export interface DetectedFestival {
  name: string;
  theme: ThemeType;
  particle: ParticleEffect;
}

export function detectCurrentFestival(date?: Date): DetectedFestival | null {
  const now = date || new Date();
  const month = now.getMonth();
  const day = now.getDate();

  for (const festival of FESTIVALS) {
    for (const d of festival.dates) {
      if (month === d.month && day >= d.startDay && day <= d.endDay) {
        return { name: festival.name, theme: festival.theme, particle: festival.particle };
      }
    }
  }
  return null;
}

export function getUpcomingFestival(date?: Date): { name: string; daysUntil: number } | null {
  const now = date || new Date();
  const thisYear = now.getFullYear();

  let closest: { name: string; daysUntil: number } | null = null;

  for (const festival of FESTIVALS) {
    for (const d of festival.dates) {
      const festDate = new Date(thisYear, d.month, d.startDay);
      if (festDate < now) festDate.setFullYear(thisYear + 1);
      const diff = Math.floor((festDate.getTime() - now.getTime()) / 86400000);
      if (!closest || diff < closest.daysUntil) {
        closest = { name: festival.name, daysUntil: diff };
      }
    }
  }
  return closest;
}
