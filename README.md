# Olathe School Lunch

A tiny Cloudflare Worker that shows your kid's school lunch menu with **everything
preselected**. School Cafe makes you pick the school, meal, serving line, grade,
and date on every visit — this bakes all of that in and just shows today's lunch
when you open the page.

It's a thin server-side proxy in front of School Cafe's
`GetDailyMenuitemsByGrade` API, rendered as a clean, mobile-friendly page.

## Usage

Just open the deployed URL. It shows **today's** lunch by default (in the
school's local time zone).

Optional query params:

| Param     | Example              | Default            | Notes                                   |
| --------- | -------------------- | ------------------ | --------------------------------------- |
| `date`    | `?date=2026-08-18`   | today (school TZ)  | Day to show, `YYYY-MM-DD`.              |
| `grade`   | `?grade=05`          | `GRADE` var (`03`) | Affects serving sizes.                  |
| `format`  | `?format=json`       | HTML               | Returns the raw upstream JSON instead.  |

The page has **‹ Prev / Next ›** buttons and a **Jump to today** link, so you can
peek ahead at the week without touching URLs.

Weekends, holidays, and breaks have no menu — the page just says so.

## Configuration

All selection defaults live in `wrangler.jsonc` under `vars`, so you can change
them without touching code:

| Var           | Meaning                                    |
| ------------- | ------------------------------------------ |
| `SCHOOL_ID`   | School Cafe SchoolId (GUID).               |
| `SERVING_LINE`| e.g. `Main Line`.                          |
| `MEAL_TYPE`   | e.g. `Lunch`.                              |
| `GRADE`       | Default grade, e.g. `03`.                  |
| `TIMEZONE`    | IANA TZ for "today", e.g. `America/Chicago`.|
| `SCHOOL_NAME` | Heading shown on the page.                 |

### Finding your `SchoolId`

Open School Cafe in your browser, select your school and a lunch menu, and watch
the network tab for the `GetDailyMenuitemsByGrade` request. The `SchoolId` query
param is the GUID to use here.

## Develop

```sh
npm install
npm run dev      # wrangler dev, http://localhost:8787
```

> Note: some sandboxed/dev networks block outbound calls to
> `webapis.schoolcafe.com`, which surfaces as an `HTTP 403` notice on the page.
> That's a network-policy denial, not an app bug — deployed to Cloudflare's edge,
> the Worker reaches School Cafe directly.

## Deploy

```sh
npm run deploy   # wrangler deploy
```

First time, run `npx wrangler login` (or set a `CLOUDFLARE_API_TOKEN`).

## How it works

`src/index.ts` builds the upstream URL from the configured defaults plus any
query overrides, fetches it server-side (so there are no CORS issues and nothing
runs in the browser), and renders the sections — Entrees, Grains, Vegetables,
Fruits, Juice, Milk — with serving size, calories, and allergen info. Responses
are edge-cached for 5 minutes.
