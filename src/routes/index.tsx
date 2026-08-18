import { Link, createFileRoute } from "@tanstack/react-router";

import { CATEGORY_ORDER, MENU_CONFIG } from "../config";
import { addDays, longDate, parseISODate, toISO, todayIn } from "../lib/date";
import {
  getMenu,
  type MenuItem,
  type MenuSections,
  type Pairings,
} from "../lib/menu";

interface MenuSearch {
  date?: string;
  grade?: string;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): MenuSearch => {
    const out: MenuSearch = {};
    if (typeof search.date === "string" && parseISODate(search.date)) {
      out.date = search.date;
    }
    if (typeof search.grade === "string" && search.grade.trim()) {
      out.grade = search.grade.trim();
    }
    return out;
  },
  loaderDeps: ({ search }) => ({ date: search.date, grade: search.grade }),
  loader: async ({ deps }) => {
    const grade = deps.grade || MENU_CONFIG.grade;
    const date = deps.date
      ? parseISODate(deps.date)!
      : todayIn(MENU_CONFIG.timeZone);
    const iso = toISO(date);
    const result = await getMenu({ data: { date: iso, grade } });
    return { ...result, date: iso, grade };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${MENU_CONFIG.schoolName} — ${longDate(parseISODate(loaderData.date)!)}`
          : MENU_CONFIG.schoolName,
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { menu, pairings, error, date, grade } = Route.useLoaderData();
  const parsed = parseISODate(date)!;
  const today = todayIn(MENU_CONFIG.timeZone);
  const isToday = date === toISO(today);
  const prevISO = toISO(addDays(parsed, -1));
  const nextISO = toISO(addDays(parsed, 1));

  // Only carry ?grade in URLs when it differs from the configured default.
  const gradeSearch = grade === MENU_CONFIG.grade ? {} : { grade };

  return (
    <main>
      <header className="page-header">
        <h1>{MENU_CONFIG.schoolName}</h1>
      </header>

      <nav className="nav">
        <Link
          to="/"
          search={{ date: prevISO, ...gradeSearch }}
          aria-label="Previous day"
        >
          ‹ Prev
        </Link>
        <span className="date">{longDate(parsed)}</span>
        <Link
          to="/"
          search={{ date: nextISO, ...gradeSearch }}
          aria-label="Next day"
        >
          Next ›
        </Link>
      </nav>

      <div className="today-row">
        {isToday ? null : (
          <Link className="today-btn" to="/" search={gradeSearch}>
            Jump to today
          </Link>
        )}
      </div>

      {error ? (
        <div className="notice error">{error}</div>
      ) : (
        <Sections menu={menu ?? {}} pairings={pairings} />
      )}

      <footer className="page-footer">Data from School Cafe</footer>
    </main>
  );
}

function Sections({
  menu,
  pairings,
}: {
  menu: MenuSections;
  pairings: Pairings;
}) {
  const nested = new Set(pairings.nestedIds);
  const keys = Object.keys(menu);
  const order = CATEGORY_ORDER as readonly string[];
  const ordered = [
    ...order.filter((c) => keys.includes(c)),
    ...keys.filter((k) => !order.includes(k)).sort(),
  ];

  // Items shown in each category, with accompaniments nested under their main
  // removed so they aren't listed twice.
  const sections = ordered
    .map((cat) => ({
      cat,
      items: (menu[cat] ?? []).filter((item) => !nested.has(item.PEMenuItemId)),
    }))
    .filter((s) => s.items.length > 0);

  if (sections.length === 0) {
    return (
      <div className="notice">
        No lunch menu published for this day. It's probably a weekend, holiday,
        or break.
      </div>
    );
  }

  return (
    <>
      {sections.map(({ cat, items }) => (
        <section className="cat" key={cat}>
          <h2>{prettyCategory(cat)}</h2>
          <ul>
            {items.map((item, i) => (
              <Item
                key={i}
                item={item}
                servedWith={pairings.under[item.PEMenuItemId] ?? []}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Item({ item, servedWith }: { item: MenuItem; servedWith: string[] }) {
  const name = (item.MenuItemDescription || "").trim();

  return (
    <li>
      <span className="item-name">{name}</span>
      {servedWith.length > 0 && (
        <ul className="served-with">
          {servedWith.map((child, i) => (
            <li key={i}>{child}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function prettyCategory(cat: string): string {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}
