/**
 * Olathe School Lunch — a thin, preselected proxy in front of School Cafe.
 *
 * School Cafe makes you pick school / meal / serving line / grade / date on
 * every visit. This Worker bakes all of that in and just shows today's lunch.
 *
 * Query params (all optional):
 *   ?date=YYYY-MM-DD   day to show (defaults to today, school-local time)
 *   ?grade=03          grade (affects serving sizes; defaults to env GRADE)
 *   ?format=json       return the raw upstream JSON instead of HTML
 */

interface Env {
  SCHOOL_ID: string;
  SERVING_LINE: string;
  MEAL_TYPE: string;
  GRADE: string;
  TIMEZONE: string;
  SCHOOL_NAME: string;
}

interface MenuItem {
  MenuItemDescription: string;
  Category: string;
  Calories: number;
  ServingSizeByGrade: string;
  DefaultServingSize: string;
  AllergenDisplay: string | null;
  Allergens: string;
}

type MenuResponse = Record<string, MenuItem[]>;

const UPSTREAM =
  "https://webapis.schoolcafe.com/api/CalendarView/GetDailyMenuitemsByGrade";

// Rendering order for the sections School Cafe returns.
const CATEGORY_ORDER = [
  "ENTREES",
  "GRAINS",
  "VEGETABLES",
  "FRUITS",
  "JUICE",
  "MILK",
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    const grade = url.searchParams.get("grade") || env.GRADE;
    const tz = env.TIMEZONE || "America/Chicago";
    const dateParam = url.searchParams.get("date");
    const date = dateParam ? parseISODate(dateParam) : todayIn(tz);

    if (!date) {
      return new Response("Invalid ?date — use YYYY-MM-DD", { status: 400 });
    }

    const upstream = new URL(UPSTREAM);
    upstream.searchParams.set("SchoolId", env.SCHOOL_ID);
    upstream.searchParams.set("ServingDate", formatMMDDYYYY(date));
    upstream.searchParams.set("ServingLine", env.SERVING_LINE);
    upstream.searchParams.set("MealType", env.MEAL_TYPE);
    upstream.searchParams.set("Grade", grade);
    upstream.searchParams.set("PersonId", "null");

    let menu: MenuResponse | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(upstream.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "olathe-school-lunch (Cloudflare Worker)",
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (!res.ok) {
        error = `School Cafe returned HTTP ${res.status}`;
      } else {
        menu = (await res.json()) as MenuResponse;
      }
    } catch (e) {
      error = `Could not reach School Cafe: ${(e as Error).message}`;
    }

    if (url.searchParams.get("format") === "json") {
      return new Response(JSON.stringify(menu ?? { error }, null, 2), {
        status: error ? 502 : 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const html = renderPage({ menu, error, date, grade, tz, env });
    return new Response(html, {
      status: error ? 502 : 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Small edge cache so repeated pulls in the same few minutes are instant.
        "cache-control": "public, max-age=300",
      },
    });
  },
} satisfies ExportedHandler<Env>;

/* ----------------------------- date helpers ----------------------------- */

// "Today" as a Y/M/D triple in the given IANA timezone.
function todayIn(tz: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { year: +get("year"), month: +get("month"), day: +get("day") };
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseISODate(s: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const parts = { year: +m[1], month: +m[2], day: +m[3] };
  // Round-trip through a UTC date to reject things like 2026-02-31.
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    d.getUTCFullYear() !== parts.year ||
    d.getUTCMonth() !== parts.month - 1 ||
    d.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

function formatMMDDYYYY(d: DateParts): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${mm}/${dd}/${d.year}`;
}

function toISO(d: DateParts): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

// Add whole days to a DateParts, normalizing via UTC math.
function addDays(d: DateParts, n: number): DateParts {
  const base = new Date(Date.UTC(d.year, d.month - 1, d.day));
  base.setUTCDate(base.getUTCDate() + n);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function longDate(d: DateParts): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

/* ------------------------------ rendering ------------------------------- */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(opts: {
  menu: MenuResponse | null;
  error: string | null;
  date: DateParts;
  grade: string;
  tz: string;
  env: Env;
}): string {
  const { menu, error, date, grade, tz, env } = opts;
  const today = todayIn(tz);
  const isToday = toISO(date) === toISO(today);
  const prev = toISO(addDays(date, -1));
  const next = toISO(addDays(date, 1));
  const gradeQ = `&grade=${encodeURIComponent(grade)}`;

  let body: string;
  if (error) {
    body = `<div class="notice error">${escapeHtml(error)}</div>`;
  } else {
    const sections = renderSections(menu ?? {});
    body = sections || `<div class="notice">No lunch menu published for this day. It's probably a weekend, holiday, or break.</div>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(env.SCHOOL_NAME)} — ${escapeHtml(longDate(date))}</title>
<style>
  :root {
    --bg: #f5f6f8; --card: #ffffff; --text: #1a1c20; --muted: #6b7280;
    --border: #e5e7eb; --accent: #2563eb; --accent-soft: #eff4ff;
    --warn: #b45309; --warn-soft: #fef3c7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --card: #1a1d24; --text: #e7e9ee; --muted: #9aa2b1;
      --border: #2a2e38; --accent: #6ea8fe; --accent-soft: #1c2740;
      --warn: #fbbf24; --warn-soft: #3a2f12;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 620px; margin: 0 auto; padding: 16px 16px 48px; }
  header { text-align: center; margin: 8px 0 20px; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: .95rem; }
  .nav {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin: 14px 0 8px;
  }
  .nav a, .today-btn {
    display: inline-flex; align-items: center; justify-content: center;
    text-decoration: none; color: var(--accent); background: var(--card);
    border: 1px solid var(--border); border-radius: 10px;
    padding: 8px 14px; font-weight: 600; font-size: .95rem;
  }
  .nav a:active { background: var(--accent-soft); }
  .nav .date { font-weight: 700; text-align: center; flex: 1; }
  .today-row { text-align: center; margin-bottom: 18px; min-height: 20px; }
  .today-btn { padding: 4px 12px; font-size: .85rem; }
  section.cat { background: var(--card); border: 1px solid var(--border);
    border-radius: 14px; margin: 0 0 14px; overflow: hidden; }
  section.cat > h2 {
    margin: 0; padding: 12px 16px; font-size: .78rem; letter-spacing: .06em;
    text-transform: uppercase; color: var(--muted);
    border-bottom: 1px solid var(--border); background: var(--accent-soft);
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  li:last-child { border-bottom: none; }
  .item-name { font-weight: 600; font-size: 1.05rem; }
  .meta { color: var(--muted); font-size: .85rem; margin-top: 2px;
    display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .allergen { color: var(--warn); background: var(--warn-soft);
    display: inline-block; border-radius: 6px; padding: 1px 8px;
    font-size: .8rem; margin-top: 6px; }
  .notice { background: var(--card); border: 1px solid var(--border);
    border-radius: 14px; padding: 24px 16px; text-align: center;
    color: var(--muted); }
  .notice.error { color: var(--warn); }
  footer { text-align: center; color: var(--muted); font-size: .8rem;
    margin-top: 24px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${escapeHtml(env.SCHOOL_NAME)}</h1>
    <div class="sub">${escapeHtml(env.MEAL_TYPE)} · Grade ${escapeHtml(grade)}</div>
  </header>

  <nav class="nav">
    <a href="?date=${prev}${gradeQ}" aria-label="Previous day">‹ Prev</a>
    <span class="date">${escapeHtml(longDate(date))}</span>
    <a href="?date=${next}${gradeQ}" aria-label="Next day">Next ›</a>
  </nav>
  <div class="today-row">
    ${isToday ? "" : `<a class="today-btn" href="?${grade === env.GRADE ? "" : `grade=${encodeURIComponent(grade)}`}">Jump to today</a>`}
  </div>

  ${body}

  <footer>Data from School Cafe · cached up to 5 min</footer>
</div>
</body>
</html>`;
}

function renderSections(menu: MenuResponse): string {
  const keys = Object.keys(menu);
  // Known categories first, in order; then anything unexpected, alphabetically.
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => keys.includes(c)),
    ...keys.filter((k) => !CATEGORY_ORDER.includes(k)).sort(),
  ];

  const out: string[] = [];
  for (const cat of ordered) {
    const items = menu[cat];
    if (!Array.isArray(items) || items.length === 0) continue;
    const lis = items.map(renderItem).join("");
    out.push(
      `<section class="cat"><h2>${escapeHtml(prettyCategory(cat))}</h2><ul>${lis}</ul></section>`
    );
  }
  return out.join("");
}

function prettyCategory(cat: string): string {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}

function renderItem(item: MenuItem): string {
  const name = escapeHtml((item.MenuItemDescription || "").trim());
  const serving = escapeHtml(
    (item.ServingSizeByGrade || item.DefaultServingSize || "").trim()
  );
  const meta: string[] = [];
  if (serving) meta.push(serving);
  if (item.Calories && item.Calories > 0) meta.push(`${item.Calories} cal`);

  const allergen = (item.AllergenDisplay || "").trim();
  const allergenHtml = allergen
    ? `<div class="allergen">${escapeHtml(allergen)}</div>`
    : "";

  return `<li>
    <div class="item-name">${name}</div>
    ${meta.length ? `<div class="meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>` : ""}
    ${allergenHtml}
  </li>`;
}
