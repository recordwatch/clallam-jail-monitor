# Clallam Jail Roster — Project Context

## What it is
A public jail roster monitor for Clallam County, WA (Port Angeles). Polls the county's Tyler Technologies "NewWorld.InmateInquiry" system every 30 minutes, tracks bookings, releases, and per-charge case dispositions, and displays them on a public website.

## URLs
- **Live site:** not deployed yet — will be `https://<github-user>.github.io/clallam-jail-monitor/` once GitHub Pages is enabled
- **GitHub repo:** not created yet
- **Source data:** https://websrv23.clallam.net/NewWorld.InmateInquiry/WA0050000

## Architecture
- **Scraper:** `scrape.js` — standalone Node.js script, runs via GitHub Actions cron every 30 min
- **Frontend:** React + Vite, served as static files on GitHub Pages (`gh-pages` branch)
- **Data storage:** JSON files committed to git in `data/` — no server, no database
- **Hosting cost:** $0

## Key technical notes — this county's site behaves differently from the others
- **No ViewState/postback** — it's ASP.NET MVC, not WebForms, so it's a plain `axios` GET + `cheerio` parse. No hidden tokens needed.
- **Quirk:** a request with *zero* query string returns an empty search form. Any non-empty query string — even a bogus one — flips it into "search submitted" mode and returns the full default result set. We use `?SubjectNumber=&Page=N` as the harmless always-present param. (Discovered by testing `?`, `?zzz=1`, etc. — see `scrapers/clallam.js` header comment.)
- **The roster window reaches back months, sometimes years** — it's not "who's in custody right now," it's "everyone with a case thread the system still considers open or recently resolved." A person only drops off once their case is fully closed out for a long enough time. This is why the "backdates a few months" behavior the user pointed out exists.
- **Two-tier scrape, unlike Whatcom/Grays Harbor's single-page JSON/HTML pull:**
  1. List pages (`?SubjectNumber=&Page=N`, 100/page) — summary columns only: name, subject #, in-custody Y/N, scheduled release date, gender, multiple-bookings Y/N, facility. No charges.
  2. Per-subject detail page (`/Inmate/Detail/{detailId}`) — full booking history for that subject (can include *multiple* past bookings under one subject), each with bonds, court, and **per-charge disposition** (case outcome) + disposition date. This is the richest of any county monitored so far.
- **`detailId` is per-subject, not per-booking** (e.g. `-135380`) — a rebooked subject shows a new `.Booking` block on the *same* detail page rather than a new URL. `subjectNumber` (a separate field shown on the page) is the stable person-level ID.
- **Incremental fetch optimization is load-bearing, not optional.** A full crawl of every detail page is ~360-400 requests; blindly doing that every 30 minutes forever would be rude to a small county's server. Instead `scrape.js` only re-fetches a subject's detail page when: it's new, its list-row summary changed (custody status, scheduled release, multiple-bookings flag, facility), or it has any booking still "pending" (open custody or any charge with a blank disposition). Fully resolved subjects (released + every charge dispositioned) are skipped until something on their list row changes. First full-backfill run fetched all ~360 subjects; the very next run only re-fetched the ~100 still pending. See `data/subjects.json` for the per-subject tracking state this relies on — **do not delete/reset this file**, or every run reverts to a full re-crawl.
- **Release detection is field-based, not diff-based** — unlike counties where "dropped off the roster" = released, Clallam's detail page has an actual `Release Date` field per booking, so status is just `releaseDate present ? 'released' : 'in_custody'`. No guessing from disappearance (which would be unreliable here anyway, since people linger in the window long after release while their case is pending).
- **bookingDate/releasedAt are the source's real timestamps**, not scrape-time proxies — unlike counties where `firstSeen` (when our scraper happened to notice something) is the best available stand-in. Time-held/stay-length calcs in the frontend (`BookingCard.jsx`, `statsUtils.js`) use `bookingDate`/`releasedAt` directly for this reason.
- **Charge-level bail is derived, not given directly** — each charge lists a `Bond` column that's a comma-separated list of bond *numbers* (not amounts); the scraper cross-references those against the booking's bond table to compute a per-charge bail total (see `parseCharges` in `scrapers/clallam.js`).

## Key files
- `scrape.js` — main scraper script, writes all `data/*.json` files
- `scrapers/clallam.js` — list-page pagination + per-subject detail parsing
- `utils.js` — `nowPST()` + `sleep()` helpers
- `data/roster.json` — current state, keyed by **bookingNumber** (e.g. `2026-00001162`) since one subject can have multiple bookings
- `data/subjects.json` — keyed by **detailId**; tracks each subject's last-seen list row + pending flag, drives the incremental refetch logic — critical for politeness, don't wipe it
- `data/change_log.json` — full history of all bookings, newest first; each entry is a booking (same shape as a `roster.json` value)
- `data/status.json` — `{inCustody, lastUpdated}`
- `.github/workflows/scrape.yml` — GitHub Actions workflow (scrape + build + deploy)
- `frontend/src/App.jsx` — React app, HashRouter, unchanged from the Grays Harbor template (data shape is compatible)
- `frontend/src/components/BookingCard.jsx` — extended for Clallam's richer per-charge data (offense date, docket #, attempt/commit, derived bail, disposition-pending state) and subject #/age/gender in the meta line
- `frontend/src/statsUtils.js` — stay-length calcs use `bookingDate`/`releasedAt` instead of `firstSeen`; recidivism dedup keys on `subjectNumber` instead of name
- `frontend/vite.config.js` — `base: './'` for GitHub Pages compatibility

## Data format
- Each `change_log.json` / `roster.json` entry (one per booking): `idnum`/`bookingNumber`, `detailId`, `subjectNumber`, `name`, `age`, `gender`, `status` (in_custody/released), `firstSeen` (scrape-time, backfill artifact — prefer `bookingDate`), `bookingDate`, `releasedAt` (real release timestamp or null), `scheduledReleaseDate`, `housingFacility`, `bookingAgency` (booking origin), `totalBondAmount`, `totalBailAmount`, `bonds[]`, `charges[]`, `hasDetail` (always true)
- Each bond: `{ bondNumber, bondType, bondAmount }`
- Each charge: `{ seqNumber, charge, offenseDate, docketNumber, causeNumber (alias of docketNumber), disposition, dispositionDate, arrestAgency, attemptCommit, court, bondRef, bondType, bail }` — `disposition: null` means not yet filed/resolved; `"Charges Not Filed"` is itself a (mostly terminal) disposition value, distinct from blank
- `name` format: `LAST, FIRST MIDDLE`

## Color scheme
- Fog blue / rust theme (Olympic Peninsula coast, Strait of Juan de Fuca) — distinct from Whatcom's violet/storm and Grays Harbor's teal/green
- Background: #10161C, primary accent: #4C86A8, secondary accent: #6FA8C4/#9AC4DA, highlight (time-held/amber): #E0A458

## Related projects
- **Whatcom Jail Roster** — `../whatcom-jail-monitor`
- **Grays Harbor Jail Roster** — `../grays-harbor-jail-monitor`
- **Mason County Jail Roster** — `../mason-jail-roster` (also serves the wajaildata.org hub page)
- **Washington Jail Data hub** — https://wajaildata.org — add a nav entry here once this site is live (see `mason-jail-roster/server.js`'s `.nav-section` block)

## Setup steps still needed
1. Create the GitHub repo and `git remote add origin` + push
2. Enable GitHub Pages (Settings → Pages → deploy from `gh-pages` branch)
3. Trigger the `scrape.yml` workflow once manually (`workflow_dispatch`) to confirm it runs end-to-end — watch for the first run being slow (~400 detail fetches vs. the steady-state ~100)
4. Add the Clallam link to `mason-jail-roster/server.js`'s `.nav-section` (wajaildata.org hub)
