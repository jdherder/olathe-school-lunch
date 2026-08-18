import { Link, createFileRoute } from "@tanstack/react-router";

import { CATEGORY_ORDER, MENU_CONFIG } from "../config";
import { addDays, longDate, parseISODate, toISO, todayIn } from "../lib/date";
import {
  getMenu,
  type MenuItem,
  type MenuSections,
  type ServedWith,
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
  const { menu, servedWith, error, date, grade } = Route.useLoaderData();
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
        <div className="sub">
          {MENU_CONFIG.mealType} · Grade {grade}
        </div>
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
        <Sections menu={menu ?? {}} servedWith={servedWith} />
      )}

      <footer className="page-footer">Data from School Cafe</footer>
    </main>
  );
}

function Sections({
  menu,
  servedWith,
}: {
  menu: MenuSections;
  servedWith: ServedWith;
}) {
  const keys = Object.keys(menu);
  const order = CATEGORY_ORDER as readonly string[];
  const ordered = [
    ...order.filter((c) => keys.includes(c)),
    ...keys.filter((k) => !order.includes(k)).sort(),
  ];
  const sections = ordered.filter(
    (cat) => Array.isArray(menu[cat]) && menu[cat].length > 0,
  );

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
      {sections.map((cat) => (
        <section className="cat" key={cat}>
          <h2>{prettyCategory(cat)}</h2>
          <ul>
            {menu[cat].map((item, i) => (
              <Item key={i} item={item} servedWith={servedWith} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Item({
  item,
  servedWith,
}: {
  item: MenuItem;
  servedWith: ServedWith;
}) {
  const name = (item.MenuItemDescription || "").trim();
  const pairedWith = item.HasServeWith ? servedWith[item.PEMenuItemId] : null;

  return (
    <li>
      <span className="item-name">{name}</span>
      {pairedWith && pairedWith.length > 0 && (
        <span className="serve-with">with {formatList(pairedWith)}</span>
      )}
    </li>
  );
}

/** "A", "A & B", or "A, B & C". */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

function prettyCategory(cat: string): string {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}
