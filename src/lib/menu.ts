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
 * The result of resolving "served with" relationships, so accompaniments can be
 * tucked under the main item they come with.
 */
export interface Pairings {
  /**
   * Main item's PEMenuItemId -> names of the items served under it,
   * e.g. { <WOW Butter Sandwich>: ["String Cheese"] }.
   */
  under: Record<number, string[]>;
  /**
   * PEMenuItemIds of accompaniments that were nested under a main, so they can
   * be hidden from their own category (no double listing).
   */
  nestedIds: number[];
}

export interface MenuResult {
  menu: MenuSections | null;
  pairings: Pairings;
  error: string | null;
}

const EMPTY_PAIRINGS: Pairings = { under: {}, nestedIds: [] };

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
    if (!date) {
      return { menu: null, pairings: EMPTY_PAIRINGS, error: "Invalid date." };
    }

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
          pairings: EMPTY_PAIRINGS,
          error: `School Cafe returned HTTP ${res.status}.`,
        };
      }
      const menu = (await res.json()) as MenuSections;
      const pairings = await resolvePairings(menu, data.grade);
      return { menu, pairings, error: null };
    } catch (e) {
      return {
        menu: null,
        pairings: EMPTY_PAIRINGS,
        error: `Could not reach School Cafe: ${(e as Error).message}`,
      };
    }
  });

/**
 * For every item flagged HasServeWith, ask School Cafe which main item(s) it's
 * served together with, and build a "tuck under the main" mapping. Failures for
 * a single item are swallowed — a missing pairing just leaves the item in its
 * own category rather than breaking the page.
 */
async function resolvePairings(
  menu: MenuSections,
  grade: string,
): Promise<Pairings> {
  const allItems = Object.values(menu)
    .flat()
    .filter(Boolean);
  const byPEItemId = new Map(allItems.map((item) => [item.PEMenuItemId, item]));
  const accompaniments = allItems.filter((item) => item.HasServeWith);

  // Resolve each accompaniment's primary item id(s) in parallel...
  const resolved = await Promise.all(
    accompaniments.map(async (item) => ({
      item,
      primaryIds: await fetchPrimaryIds(item, grade),
    })),
  );

  // ...then fold into the mapping in menu order for deterministic output.
  const under: Record<number, string[]> = {};
  const nestedIds: number[] = [];
  for (const { item, primaryIds } of resolved) {
    // Keep only primaries that are actually present on today's menu and aren't
    // the item itself.
    const targets = primaryIds.filter(
      (id) => id !== item.PEMenuItemId && byPEItemId.has(id),
    );
    if (targets.length === 0) continue;

    const name = (item.MenuItemDescription || "").trim();
    for (const primaryId of targets) {
      (under[primaryId] ??= []).push(name);
    }
    nestedIds.push(item.PEMenuItemId);
  }

  return { under, nestedIds };
}

/** The PEMenuItemId(s) of the main item(s) an accompaniment is served with. */
async function fetchPrimaryIds(
  item: MenuItem,
  grade: string,
): Promise<number[]> {
  try {
    const url = new URL(SERVED_TOGETHER_URL);
    url.searchParams.set("SchoolId", MENU_CONFIG.schoolId);
    url.searchParams.set("PEMenuId", String(item.PEMenuId));
    url.searchParams.set("PEMenuItemId", String(item.PEMenuItemId));
    url.searchParams.set("Grade", grade);
    url.searchParams.set("ServingSizeByGrade", "true");
    url.searchParams.set("PersonId", "null");

    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return [];

    const rows = (await res.json()) as ServedTogetherRow[];
    return [...new Set(rows.map((r) => r.PrimaryPEMenuItemId).filter(Boolean))];
  } catch {
    return [];
  }
}
