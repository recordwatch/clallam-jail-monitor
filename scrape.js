import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { fetchRosterList, fetchInmateDetail } from './scrapers/clallam.js';
import { nowPST, sleep } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ROSTER_FILE   = path.join(DATA_DIR, 'roster.json');   // bookingNumber -> entry
const SUBJECTS_FILE = path.join(DATA_DIR, 'subjects.json'); // detailId -> tracking state
const LOG_FILE      = path.join(DATA_DIR, 'change_log.json');
const STATUS_FILE   = path.join(DATA_DIR, 'status.json');

const CONCURRENCY = 4;
const REQUEST_GAP_MS = 150; // stagger detail fetches per worker so we're not hammering a small county server

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data));
}

// Any field on the list row that, if changed since last scrape, means
// something happened to this subject worth re-fetching the detail page for.
function listRowChanged(prev, next) {
  if (!prev) return true;
  return prev.inCustody !== next.inCustody
    || prev.scheduledReleaseDate !== next.scheduledReleaseDate
    || prev.multipleBookings !== next.multipleBookings
    || prev.housingFacility !== next.housingFacility;
}

// A booking still needs watching if it's open (no release date yet) or any
// of its charges haven't been resolved with a disposition yet — both of
// those can change without the list row changing at all.
function bookingIsPending(booking) {
  if (!booking.releaseDate) return true;
  return (booking.charges || []).some(c => !c.disposition);
}

function buildEntry(detail, booking, row, prevFirstSeen, now) {
  return {
    idnum: booking.bookingNumber,
    bookingNumber: booking.bookingNumber,
    detailId: row.detailId,
    subjectNumber: detail.subjectNumber,
    name: detail.name,
    age: detail.age,
    gender: detail.gender,
    status: booking.releaseDate ? 'released' : 'in_custody',
    firstSeen: prevFirstSeen || now,
    bookingDate: booking.bookingDate,
    releasedAt: booking.releaseDate || null,
    scheduledReleaseDate: booking.scheduledReleaseDate || null,
    housingFacility: booking.housingFacility || row.housingFacility || null,
    bookingAgency: booking.bookingOrigin || null,
    totalBondAmount: booking.totalBondAmount || null,
    totalBailAmount: booking.totalBailAmount || null,
    bonds: booking.bonds,
    charges: booking.charges,
    hasDetail: true,
  };
}

async function run() {
  console.log(`[${nowPST()}] Running Clallam County scrape...`);

  let roster   = readJSON(ROSTER_FILE, {});
  let subjects = readJSON(SUBJECTS_FILE, {});
  let log      = readJSON(LOG_FILE, []);

  let rows;
  try {
    rows = await fetchRosterList();
  } catch (err) {
    console.error('Roster list fetch failed:', err.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('Got 0 rows — skipping to avoid wiping data.');
    process.exit(0);
  }
  console.log(`  ${rows.length} subject(s) on the roster window`);

  const toFetch = rows.filter(row => {
    const prev = subjects[row.detailId];
    return !prev || prev.pending || listRowChanged(prev.lastRow, row);
  });
  console.log(`  ${toFetch.length} detail page(s) need fetching`);

  const now = nowPST();
  let newBookings = 0, releasedCount = 0, dispositionUpdates = 0, fetchErrors = 0;

  let cursor = 0;
  async function worker() {
    while (cursor < toFetch.length) {
      const row = toFetch[cursor++];
      let detail;
      try {
        detail = await fetchInmateDetail(row.detailId);
        await sleep(REQUEST_GAP_MS);
      } catch (err) {
        console.error(`  Detail fetch failed for ${row.name} (${row.detailId}): ${err.message}`);
        fetchErrors++;
        continue;
      }

      let anyPending = false;
      for (const booking of detail.bookings) {
        const existing = roster[booking.bookingNumber];
        const entry = buildEntry(detail, booking, row, existing?.firstSeen, now);

        if (!existing) {
          console.log(`  NEW BOOKING: ${entry.name} (${entry.bookingNumber})`);
          newBookings++;
          log.unshift(entry);
        } else {
          if (existing.status !== 'released' && entry.status === 'released') {
            console.log(`  RELEASED: ${entry.name} (${entry.bookingNumber})`);
            releasedCount++;
          }
          const prevDispositions = JSON.stringify((existing.charges || []).map(c => c.disposition));
          const nextDispositions = JSON.stringify((entry.charges || []).map(c => c.disposition));
          if (prevDispositions !== nextDispositions) {
            console.log(`  DISPOSITION UPDATE: ${entry.name} (${entry.bookingNumber})`);
            dispositionUpdates++;
          }

          const logEntry = log.find(e => e.idnum === booking.bookingNumber);
          if (logEntry) Object.assign(logEntry, entry);
          else log.unshift(entry);
        }

        roster[booking.bookingNumber] = entry;
        if (bookingIsPending(booking)) anyPending = true;
      }

      subjects[row.detailId] = {
        subjectNumber: detail.subjectNumber,
        lastRow: row,
        bookingNumbers: detail.bookings.map(b => b.bookingNumber),
        pending: anyPending,
        lastFetched: now,
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, worker));

  // Keep list-row snapshots current even for subjects we skipped re-fetching,
  // so next run's diff is against what we actually just saw.
  for (const row of rows) {
    if (subjects[row.detailId]) subjects[row.detailId].lastRow = row;
  }

  writeJSON(ROSTER_FILE, roster);
  writeJSON(SUBJECTS_FILE, subjects);
  writeJSON(LOG_FILE, log);

  const inCustody = Object.values(roster).filter(e => e.status === 'in_custody').length;
  writeJSON(STATUS_FILE, { inCustody, lastUpdated: now });

  console.log(`[${nowPST()}] Done. ${newBookings} new, ${releasedCount} released, ${dispositionUpdates} disposition update(s), ${fetchErrors} fetch error(s). ${inCustody} in custody.`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
