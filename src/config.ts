/**
 * Menu selection defaults — the "preselected" bits that School Cafe otherwise
 * makes you pick on every visit. Edit these to point at a different school,
 * meal, serving line, grade, or time zone.
 *
 * `grade` and `date` can also be overridden per-request via URL search params
 * (e.g. /?grade=05&date=2026-08-18); everything else is fixed here.
 */
export const MENU_CONFIG = {
  schoolId: "97db15b3-0aea-4bc9-a417-28376e1187be",
  servingLine: "Main Line",
  mealType: "Lunch",
  grade: "03",
  /** IANA time zone used to decide what "today" is. Olathe, KS is Central. */
  timeZone: "America/Chicago",
  /** Heading shown at the top of the page. */
  schoolName: "Black Bob Elementary",
} as const;

/** Order in which School Cafe's sections are rendered. */
export const CATEGORY_ORDER = [
  "ENTREES",
  "GRAINS",
  "VEGETABLES",
  "FRUITS",
  "JUICE",
  "MILK",
] as const;
