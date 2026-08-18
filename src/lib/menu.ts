import { createServerFn } from "@tanstack/react-start";

import { MENU_CONFIG } from "../config";
import { formatMMDDYYYY, parseISODate } from "./date";

/** The fields of a School Cafe menu item we actually render. */
export interface MenuItem {
  MenuItemDescription: string;
  Category: string;
  Calories: number;
  ServingSizeByGrade: string;
  DefaultServingSize: string;
  AllergenDisplay: string | null;
  Allergens: string;
}

/** School Cafe groups items by category name, e.g. { ENTREES: [...], ... }. */
export type MenuSections = Record<string, MenuItem[]>;

export interface MenuResult {
  menu: MenuSections | null;
  error: string | null;
}

const UPSTREAM =
  "https://webapis.schoolcafe.com/api/CalendarView/GetDailyMenuitemsByGrade";

/**
 * Fetch one day's menu from School Cafe. Runs only on the server (edge), so
 * there are no CORS issues and the request never happens in the browser — even
 * during client-side navigation this becomes an RPC to the Worker.
 */
export const getMenu = createServerFn({ method: "GET" })
  .inputValidator((data: { date: string; grade: string }) => data)
  .handler(async ({ data }): Promise<MenuResult> => {
    const date = parseISODate(data.date);
    if (!date) return { menu: null, error: "Invalid date." };

    const url = new URL(UPSTREAM);
    url.searchParams.set("SchoolId", MENU_CONFIG.schoolId);
    url.searchParams.set("ServingDate", formatMMDDYYYY(date));
    url.searchParams.set("ServingLine", MENU_CONFIG.servingLine);
    url.searchParams.set("MealType", MENU_CONFIG.mealType);
    url.searchParams.set("Grade", data.grade);
    url.searchParams.set("PersonId", "null");

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "olathe-school-lunch (Cloudflare Worker)",
        },
      });
      if (!res.ok) {
        return { menu: null, error: `School Cafe returned HTTP ${res.status}.` };
      }
      const menu = (await res.json()) as MenuSections;
      return { menu, error: null };
    } catch (e) {
      return {
        menu: null,
        error: `Could not reach School Cafe: ${(e as Error).message}`,
      };
    }
  });
