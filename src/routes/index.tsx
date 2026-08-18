import { Link, createFileRoute } from "@tanstack/react-router";

import { CATEGORY_ORDER, MENU_CONFIG } from "../config";
import { addDays, longDate, parseISODate, toISO, todayIn } from "../lib/date";
import { getMenu, type MenuItem, type MenuSections } from "../lib/menu";

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
  const { menu, error, date, grade } = Route.useLoaderData();
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
        <Sections menu={menu ?? {}} />
      )}

      <footer className="page-footer">Data from School Cafe</footer>
    </main>
  );
}

function Sections({ menu }: { menu: MenuSections }) {
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
              <Item key={i} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Item({ item }: { item: MenuItem }) {
  const name = (item.MenuItemDescription || "").trim();
  const serving = (item.ServingSizeByGrade || item.DefaultServingSize || "").trim();
  const allergen = (item.AllergenDisplay || "").trim();
  const meta: string[] = [];
  if (serving) meta.push(serving);
  if (item.Calories > 0) meta.push(`${item.Calories} cal`);

  return (
    <li>
      <div className="item-name">{name}</div>
      {meta.length > 0 && (
        <div className="meta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      )}
      {allergen && <div className="allergen">{allergen}</div>}
    </li>
  );
}

function prettyCategory(cat: string): string {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}
