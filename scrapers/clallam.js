import axios from 'axios';
import * as cheerio from 'cheerio';

// Clallam County runs Tyler Technologies' "NewWorld.InmateInquiry" system —
// an ASP.NET MVC app, not the ASP.NET WebForms/ViewState kind, so plain GET
// requests with query strings work (no postback tokens needed).
//
// Quirk: a bare request with no query string at all shows only the empty
// search form. ANY non-empty query string (even a bogus one) flips it into
// "search submitted" mode and returns the full default result set — everyone
// with a booking thread the system still considers open/recent, which in
// practice reaches back months (sometimes years, for cases still pending
// disposition) rather than just current custody. So `SubjectNumber=` is used
// as a harmless always-present param, combined with `Page=N` for pagination.
//
// The list page only exposes summary columns (name, subject #, in-custody
// flag, scheduled release, gender, multiple-bookings flag, facility) — no
// charges or disposition. Full booking history (including past bookings for
// the same subject, per-charge disposition, bonds, court) only lives on the
// per-subject detail page, so this is a two-tier scrape: list page for the
// roster + change signals, detail page for the substance.
const BASE = 'https://websrv23.clallam.net/NewWorld.InmateInquiry/WA0050000';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

function cleanText(raw) {
  return (raw || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function textOrNull(raw) {
  const t = cleanText(raw);
  return t || null;
}

function parseMoney(raw) {
  const t = cleanText(raw);
  if (!t) return null;
  const n = parseFloat(t.replace(/[$,]/g, ''));
  return Number.isNaN(n) ? null : n;
}

// Reads a `<ul class="FieldList"><li class="X"><label/><span>value</span></li>...`
// block into { X: value, ... }, keyed by each <li>'s class name.
function parseFieldList($, scope) {
  const out = {};
  scope.find('> ul.FieldList > li').each((_, li) => {
    const $li = $(li);
    const cls = ($li.attr('class') || '').trim();
    if (!cls) return;
    out[cls] = cleanText($li.find('span').first().text());
  });
  return out;
}

function detailIdFromHref(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

async function fetchPage(page) {
  const res = await axios.get(BASE, {
    headers: HEADERS,
    timeout: 20000,
    params: { SubjectNumber: '', Page: page },
  });
  return res.data;
}

// Fetches every page of the default (unfiltered) result set and returns one
// row per subject currently on the roster window.
export async function fetchRosterList() {
  const rows = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const html = await fetchPage(page);
    const $ = cheerio.load(html);

    const trs = $('.Results table tbody tr');
    if (trs.length === 0) break;

    trs.each((_, tr) => {
      const $tr = $(tr);
      const link = $tr.find('td.Name a');
      const href = link.attr('href');
      const detailId = detailIdFromHref(href);
      if (!detailId) return;

      rows.push({
        detailId,
        name: cleanText(link.text()),
        subjectNumber: cleanText($tr.find('td.SubjectNumber').text()),
        inCustody: cleanText($tr.find('td.InCustody').text()) === 'Yes',
        scheduledReleaseDate: textOrNull($tr.find('td.ScheduledReleaseDate').text()),
        gender: cleanText($tr.find('td.Gender').text()),
        multipleBookings: cleanText($tr.find('td.MultipleBookings').text()) === 'Yes',
        housingFacility: textOrNull($tr.find('td.HousingFacility').text()),
      });
    });

    const countText = cleanText($('.ShowingRecordCount').text());
    const m = countText.match(/of\s*(\d+)/i);
    if (m) totalPages = Math.max(totalPages, Math.ceil(parseInt(m[1], 10) / 100));

    page++;
  }

  return rows;
}

function parseBonds($, bookingEl) {
  const bonds = [];
  bookingEl.find('.BookingBonds table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 3) return; // "No data" row
    bonds.push({
      bondNumber: cleanText(tds.eq(0).text()),
      bondType: cleanText(tds.eq(1).text()),
      bondAmount: parseMoney(tds.eq(2).text()),
    });
  });
  return bonds;
}

function parseCourtsByChargeNumber($, bookingEl) {
  const courts = {};
  bookingEl.find('.BookingCourtInfo table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 2) return;
    courts[cleanText(tds.eq(0).text())] = cleanText(tds.eq(1).text());
  });
  return courts;
}

function parseCharges($, bookingEl, bonds, courts) {
  const bondsByNumber = Object.fromEntries(bonds.map(b => [b.bondNumber, b]));
  const charges = [];

  bookingEl.find('.BookingCharges table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 9) return;

    const seqNumber = cleanText(tds.eq(0).text());
    const bondRefRaw = cleanText(tds.eq(8).text());
    const bondRefs = bondRefRaw ? bondRefRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const matchedBonds = bondRefs.map(ref => bondsByNumber[ref]).filter(Boolean);
    const bailTotal = matchedBonds.length
      ? matchedBonds.reduce((sum, b) => sum + (b.bondAmount || 0), 0)
      : null;

    charges.push({
      seqNumber,
      charge: textOrNull(tds.eq(1).text()),
      offenseDate: textOrNull(tds.eq(2).text()),
      docketNumber: textOrNull(tds.eq(3).text()),
      causeNumber: textOrNull(tds.eq(3).text()),
      disposition: textOrNull(tds.eq(4).text()),
      dispositionDate: textOrNull(tds.eq(5).text()),
      arrestAgency: textOrNull(tds.eq(6).text()),
      attemptCommit: textOrNull(tds.eq(7).text()),
      court: courts[seqNumber] || null,
      bondRef: bondRefRaw || null,
      bondType: matchedBonds.length ? [...new Set(matchedBonds.map(b => b.bondType))].join(', ') : null,
      bail: bailTotal !== null ? `$${bailTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null,
    });
  });

  return charges;
}

export async function fetchInmateDetail(detailId) {
  const res = await axios.get(`${BASE}/Inmate/Detail/${detailId}`, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(res.data);

  const demo = parseFieldList($, $('#DemographicInformation'));

  const bookings = [];
  $('#BookingHistory .Booking').each((_, el) => {
    const bookingEl = $(el);
    const bookingNumber = cleanText(bookingEl.find('> h3 span').text());
    if (!bookingNumber) return;

    const fields = parseFieldList($, bookingEl.find('.BookingData'));
    const bonds = parseBonds($, bookingEl);
    const courts = parseCourtsByChargeNumber($, bookingEl);
    const charges = parseCharges($, bookingEl, bonds, courts);

    bookings.push({
      bookingNumber,
      bookingDate: fields.BookingDate || null,
      releaseDate: fields.ReleaseDate || null,
      scheduledReleaseDate: fields.ScheduledReleaseDate || null,
      housingFacility: fields.HousingFacility || null,
      totalBondAmount: fields.TotalBondAmount || null,
      totalBailAmount: fields.TotalBailAmount || null,
      bookingOrigin: fields.BookingOrigin || null,
      bonds,
      charges,
    });
  });

  return {
    subjectNumber: demo.SubjectNumber || null,
    name: demo.Name || null,
    age: demo.Age || null,
    gender: demo.Gender || null,
    bookings,
  };
}
