# Olathe School Lunch

A small [TanStack Start](https://tanstack.com/start) app that shows your kid's
school lunch menu with **everything preselected**. School Cafe makes you pick
the school, meal, serving line, grade, and date on every visit — this bakes all
of that in and just shows today's lunch when you open the page.

Deployed as a Cloudflare Worker. The menu is fetched in a **server-side route
loader** (via a TanStack Start server function), so the call to School Cafe
always runs on the edge — no CORS, and nothing runs in the browser — even when
you navigate between days client-side.

## Usage

Open the deployed URL. It shows **today's** lunch by default (in the school's
local time zone). The page has **‹ Prev / Next ›** buttons and a **Jump to
today** link.

Optional URL search params:

| Param   | Example            | Default              | Notes                          |
| ------- | ------------------ | -------------------- | ------------------------------ |
| `date`  | `?date=2026-08-18` | today (school TZ)    | `YYYY-MM-DD`; bad dates ignored.|
| `grade` | `?grade=05`        | `grade` in config    | Affects serving sizes.         |

Weekends, holidays, and breaks have no menu — the page just says so.

## Configuration

All selection defaults live in [`src/config.ts`](src/config.ts):

| Field         | Meaning                                       |
| ------------- | --------------------------------------------- |
| `schoolId`    | School Cafe SchoolId (GUID).                  |
| `servingLine` | e.g. `Main Line`.                             |
| `mealType`    | e.g. `Lunch`.                                 |
| `grade`       | Default grade, e.g. `03`.                     |
| `timeZone`    | IANA TZ for "today", e.g. `America/Chicago`.  |
| `schoolName`  | Heading shown on the page.                    |

### Finding your `schoolId`

Open School Cafe in your browser, select your school and a lunch menu, and watch
the network tab for the `GetDailyMenuitemsByGrade` request. Its `SchoolId` query
param is the GUID to use here.

## Project layout

```
src/
  config.ts          selection defaults + category order
  lib/date.ts        timezone-aware date helpers (pure)
  lib/menu.ts        getMenu() server function — fetches School Cafe
  routes/__root.tsx  document shell (<head>, styles)
  routes/index.tsx   the page: search params, loader, rendering
  styles.css         mobile-first light/dark styling
```

## Develop

```sh
npm install
npm run dev      # http://localhost:3000
```

> Note: some sandboxed/dev networks block outbound calls to
> `webapis.schoolcafe.com`, which surfaces as an `HTTP 403` notice on the page.
> That's a network-policy denial, not an app bug — on Cloudflare's edge the
> Worker reaches School Cafe directly.

Routes are file-based; TanStack Router regenerates `src/routeTree.gen.ts`
automatically (`npm run generate-routes` to do it by hand).

## Deploy to Cloudflare Workers

```sh
npx wrangler login   # first time only
npm run deploy       # runs `vite build` then `wrangler deploy`
```

The Worker name and settings are in [`wrangler.jsonc`](wrangler.jsonc); the build
is wired through the Cloudflare Vite plugin in
[`vite.config.ts`](vite.config.ts).
