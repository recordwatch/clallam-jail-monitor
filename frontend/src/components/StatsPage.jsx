import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Header from './Header'
import HBarList from './HBarList'
import { computeStats } from '../statsUtils'

const TABS = ['Summary', 'Trends', 'Crime Types', 'Bail & Release', 'Agencies', 'Detention', 'Recidivism']

function fmtMoney(n) {
  if (n === null || n === undefined) return '—'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtDays(n) {
  if (n === null || n === undefined) return '—'
  return `${n.toFixed(1)}d`
}

function SummaryTab({ stats }) {
  const t = stats.totals
  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-card-num">{t.totalBookings}</div>
        <div className="stat-card-label">Total Bookings</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-num">{t.inCustody}</div>
        <div className="stat-card-label">In Custody</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-num">{t.released}</div>
        <div className="stat-card-label">Releases Tracked</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-num">{fmtDays(t.avgStayDays)}</div>
        <div className="stat-card-label">Avg Stay</div>
        <div className="stat-card-sub">median {fmtDays(t.medianStayDays)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-num">{t.avgCharges?.toFixed(1) ?? '—'}</div>
        <div className="stat-card-label">Avg Charges / Booking</div>
        <div className="stat-card-sub">median {t.medianCharges ?? '—'}, max {t.maxCharges}</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-num">{t.pctReleasedWithBail.toFixed(1)}%</div>
        <div className="stat-card-label">Released w/ Bail Set</div>
        <div className="stat-card-sub">{t.releasedWithBailCount} of {t.released}</div>
      </div>
    </div>
  )
}

function TrendsTab({ stats }) {
  return (
    <div>
      <div className="section-title">Bookings by Day of Week</div>
      <div className="section-note">By actual booking timestamp, not when our scraper first saw the entry.</div>
      <HBarList items={stats.trends.byWeekday} />
    </div>
  )
}

function CrimeTypesTab({ stats }) {
  const { categories, severities, topOffenses } = stats.crimeTypes
  return (
    <div>
      <div className="section-title">Crime Categories</div>
      <div className="section-note">Broad category per booking (deduped) — one booking can appear in multiple categories.</div>
      <HBarList items={categories} />

      <div className="section-title">Charge Severity</div>
      <div className="section-note">Best-effort classification per individual charge instance, inferred from charge text (WA statute tiers). Not authoritative.</div>
      <HBarList items={severities} />

      <div className="section-title">Most Common Charges</div>
      <div className="section-note">Raw charge text as booked (the county roster doesn't normalize charge names).</div>
      <HBarList items={topOffenses} />
    </div>
  )
}

function BailTab({ stats }) {
  const b = stats.bail
  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card-num">{fmtMoney(b.median)}</div><div className="stat-card-label">Median Bail</div></div>
        <div className="stat-card"><div className="stat-card-num">{fmtMoney(Math.round(b.mean || 0))}</div><div className="stat-card-label">Mean Bail</div></div>
        <div className="stat-card"><div className="stat-card-num">{fmtMoney(b.max)}</div><div className="stat-card-label">Max Bail</div></div>
        <div className="stat-card"><div className="stat-card-num">{b.n}</div><div className="stat-card-label">Charges w/ Bail Set</div></div>
      </div>
      <div className="section-title">Median Bail by Charge Category</div>
      <div className="section-note">Bail parsed from the appearance-bond amount on each charge (cash alternative excluded).</div>
      <table className="stats-table">
        <thead><tr><th>Category</th><th>Median</th><th>Mean</th><th>n</th></tr></thead>
        <tbody>
          {b.byCategory.map(row => (
            <tr key={row.category}>
              <td>{row.category}</td>
              <td>{fmtMoney(row.median)}</td>
              <td>{fmtMoney(Math.round(row.mean))}</td>
              <td>{row.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AgenciesTab({ stats }) {
  return (
    <div>
      <div className="section-note">Charge count per arresting agency — one arrest can carry multiple charges.</div>
      <HBarList items={stats.agencies.map(a => ({ name: a.agency, count: a.chargeCount }))} />
      {stats.agencies.map(a => (
        <div className="agency-block" key={a.agency}>
          <div className="agency-name">{a.agency}</div>
          <div className="agency-meta">{a.chargeCount} charge{a.chargeCount !== 1 ? 's' : ''}</div>
          <ul className="agency-top-charges">
            {a.topCharges.map(c => <li key={c.name}>{c.name} — {c.count}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

function DetentionTab({ stats }) {
  return (
    <div>
      <div className="section-note">Released bookings only, ≥2 data points per category. Sorted by average days.</div>
      <table className="stats-table">
        <thead><tr><th>Category</th><th>Avg Days</th><th>Median Days</th><th>n</th></tr></thead>
        <tbody>
          {stats.detention.map(row => (
            <tr key={row.category}>
              <td>{row.category}</td>
              <td>{fmtDays(row.avgDays)}</td>
              <td>{fmtDays(row.medianDays)}</td>
              <td>{row.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats.detention.length === 0 && <div className="empty">Not enough released bookings yet to break this down by category.</div>}
    </div>
  )
}

function RecidivismTab({ stats }) {
  const r = stats.recidivism
  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card-num">{r.repeatRate.toFixed(1)}%</div><div className="stat-card-label">Repeat Rate</div></div>
        <div className="stat-card"><div className="stat-card-num">{r.repeatCount}</div><div className="stat-card-label">Repeat Individuals</div></div>
        <div className="stat-card"><div className="stat-card-num">{r.distinctCount}</div><div className="stat-card-label">Unique Individuals Tracked</div></div>
      </div>
      <div className="section-title">Repeat Bookers</div>
      {r.topRepeaters.length === 0 ? (
        <div className="empty">No repeat bookings tracked yet — this is a brand-new monitor, so give it time.</div>
      ) : (
        <table className="stats-table">
          <thead><tr><th>Name</th><th>Bookings</th></tr></thead>
          <tbody>
            {r.topRepeaters.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.count}</td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function StatsPage() {
  const [log, setLog] = useState(null)
  const [tab, setTab] = useState('Summary')

  useEffect(() => {
    fetch('./data/change_log.json').then(r => r.json()).then(setLog)
  }, [])

  const stats = useMemo(() => (log ? computeStats(log) : null), [log])

  return (
    <div className="app">
      <Header />
      <div className="controls">
        <Link to="/" className="back-link">← Main Page</Link>
      </div>
      {!stats ? (
        <div className="loading">Crunching numbers...</div>
      ) : (
        <>
          <div className="stats-tabs">
            {TABS.map(t => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="stats-panel">
            {tab === 'Summary' && <SummaryTab stats={stats} />}
            {tab === 'Trends' && <TrendsTab stats={stats} />}
            {tab === 'Crime Types' && <CrimeTypesTab stats={stats} />}
            {tab === 'Bail & Release' && <BailTab stats={stats} />}
            {tab === 'Agencies' && <AgenciesTab stats={stats} />}
            {tab === 'Detention' && <DetentionTab stats={stats} />}
            {tab === 'Recidivism' && <RecidivismTab stats={stats} />}
          </div>
        </>
      )}
    </div>
  )
}
