import { createServerFn } from "@tanstack/react-start";

import { MENU_CONFIG } from "../config";
import { formatMMDDYYYY, parseISODate } from "./date";

/** The fields of a School Cafe menu item we actually use. */
export interface MenuItem {
  MenuItemDescription: string;
  Category: string;
  /** True when this item is only offered alongside a main (see servedWith). */
  HasServeWith: boolean;
  PEMenuId: number;
  PEMenuItemId: number;
}

/** School Cafe groups items by category name, e.g. { ENTREES: [...], ... }. */
export type MenuSections = Record<string, MenuItem[]>;

/**
 * Maps a "serve with" item's PEMenuItemId to the name(s) of the main item(s)
 * it's served together with — e.g. String Cheese -> ["WOW Butter Sandwich"].
 */
export type ServedWith = Record<number, string[]>;

export interface MenuResult {
  menu: MenuSections | null;
  servedWith: ServedWith;
  error: string | null;
}

/** One row of the GetMenuItemsServedTogether response. */
interface ServedTogetherRow {
  PrimaryPEMenuItemId: number;
  SecondaryPEMenuItemId: number;
  /** Description of the primary (main) item this row pairs with. */
  MenuItemDescription: string;
}

const DAILY_MENU_URL =
  "https://webapis.schoolcafe.com/api/CalendarView/GetDailyMenuitemsByGrade";
const SERVED_TOGETHER_URL =
  "https://webapis.schoolcafe.com/api/CalendarView/GetMenuItemsServedTogether";

const REQUEST_HEADERS = {
  Accept: "application/json",
  "User-Agent": "olathe-school-lunch (Cloudflare Worker)",
};

/**
 * Fetch one day's menu from School Cafe, plus the "served together" pairings
 * for any item flagged HasServeWith. Runs only on the server (edge), so there
 * are no CORS issues and the request never happens in the browser — even during
 * client-side navigation this becomes an RPC to the Worker.
 */
export const getMenu = createServerFn({ method: "GET" })
  .inputValidator((data: { date: string; grade: string }) => data)
  .handler(async ({ data }): Promise<MenuResult> => {
    const date = parseISODate(data.date);
    if (!date) return { menu: null, servedWith: {}, error: "Invalid date." };

    const url = new URL(DAILY_MENU_URL);
    url.searchParams.set("SchoolId", MENU_CONFIG.schoolId);
    url.searchParams.set("ServingDate", formatMMDDYYYY(date));
    url.searchParams.set("ServingLine", MENU_CONFIG.servingLine);
    url.searchParams.set("MealType", MENU_CONFIG.mealType);
    url.searchParams.set("Grade", data.grade);
    url.searchParams.set("PersonId", "null");

    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      if (!res.ok) {
        return {
          menu: null,
          servedWith: {},
          error: `School Cafe returned HTTP ${res.status}.`,
        };
      }
      const menu = (await res.json()) as MenuSections;
      const servedWith = await fetchServedWith(menu, data.grade);
      return { menu, servedWith, error: null };
    } catch (e) {
      return {
        menu: null,
        servedWith: {},
        error: `Could not reach School Cafe: ${(e as Error).message}`,
      };
    }
  });

/**
 * For every item flagged HasServeWith, ask School Cafe which main item(s) it's
 * served together with. Failures for a single item are swallowed — a missing
 * pairing just means no note, never a broken page.
 */
async function fetchServedWith(
  menu: MenuSections,
  grade: string,
): Promise<ServedWith> {
  const pairItems = Object.values(menu)
    .flat()
    .filter((item) => item?.HasServeWith);

  const entries = await Promise.all(
    pairItems.map(async (item): Promise<[number, string[]]> => {
      try {
        const url = new URL(SERVED_TOGETHER_URL);
        url.searchParams.set("SchoolId", MENU_CONFIG.schoolId);
        url.searchParams.set("PEMenuId", String(item.PEMenuId));
        url.searchParams.set("PEMenuItemId", String(item.PEMenuItemId));
        url.searchParams.set("Grade", grade);
        url.searchParams.set("ServingSizeByGrade", "true");
        url.searchParams.set("PersonId", "null");

        const res = await fetch(url, { headers: REQUEST_HEADERS });
        if (!res.ok) return [item.PEMenuItemId, []];

        const rows = (await res.json()) as ServedTogetherRow[];
        const ownName = (item.MenuItemDescription || "").trim();
        // Distinct main-item names, preserving first-seen order, excluding the
        // queried item itself in case a row echoes it back.
        const names = [
          ...new Set(
            rows
              .map((r) => (r.MenuItemDescription || "").trim())
              .filter((name) => name && name !== ownName),
          ),
        ];
        return [item.PEMenuItemId, names];
      } catch {
        return [item.PEMenuItemId, []];
      }
    }),
  );

  return Object.fromEntries(entries.filter(([, names]) => names.length > 0));
}
