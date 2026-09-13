import { useState } from 'react'

function calcTimeHeld(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return null
  const totalMins = Math.floor(ms / 60000)
  const days  = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins  = totalMins % 60
  if (days > 0)  return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export default function BookingCard({ entry }) {
  const [open, setOpen] = useState(false)

  const isReleased = entry.status === 'released'
  // Clallam publishes real booking/release timestamps on every record (not just
  // ones we happened to see get booked), so time-held is computed from those
  // rather than our own firstSeen scrape timestamp.
  const timeHeld = isReleased ? calcTimeHeld(entry.bookingDate, entry.releasedAt) : null

  return (
    <div className={`card ${isReleased ? 'card-released' : 'card-custody'}`}>
      <div className="card-header" onClick={() => setOpen(!open)}>
        <div className="card-left">
          <div className="card-name">{entry.name}</div>
          <div className="card-meta">
            Subject #{entry.subjectNumber} &nbsp;·&nbsp; {entry.age && `Age ${entry.age}`}{entry.age && entry.gender && ', '}{entry.gender}
          </div>
          <div className="card-meta">
            Booking #{entry.bookingNumber} &nbsp;·&nbsp; Booked: {entry.bookingDate || entry.firstSeen}
            {!isReleased && entry.housingFacility && <span> &nbsp;·&nbsp; {entry.housingFacility}</span>}
            {timeHeld && <span className="card-time-held"> &nbsp;·&nbsp; Held: {timeHeld}</span>}
          </div>
        </div>
        <div className="card-right">
          <span className={`badge ${isReleased ? 'badge-released' : 'badge-custody'}`}>
            {isReleased ? 'Released' : 'In Custody'}
          </span>
          <span className="card-toggle">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="card-body">
          {(entry.bookingAgency || (isReleased && entry.releasedAt) || entry.totalBondAmount) && (
            <div className="card-release-row">
              {entry.bookingAgency && <div>Booking origin: {entry.bookingAgency}</div>}
              {isReleased && entry.releasedAt && (
                <div>Released: {entry.releasedAt}{timeHeld && <span className="card-time-held-detail"> &nbsp;·&nbsp; Time held: {timeHeld}</span>}</div>
              )}
              {!isReleased && entry.scheduledReleaseDate && (
                <div>Scheduled release: {entry.scheduledReleaseDate}</div>
              )}
              {entry.totalBondAmount && entry.totalBondAmount !== '$0.00' && (
                <div>Total bond: {entry.totalBondAmount}{entry.totalBailAmount && entry.totalBailAmount !== entry.totalBondAmount && ` · Total bail: ${entry.totalBailAmount}`}</div>
              )}
            </div>
          )}

          {entry.charges && entry.charges.length > 0 ? (
            <div className="card-charges">
              <div className="charges-title">Charges ({entry.charges.length})</div>
              {entry.charges.map((c, i) => (
                <div key={i} className="charge-row">
                  <div className="charge-violation">{c.charge || 'Charge pending'}</div>
                  {c.court && (
                    <div className="charge-court">{c.court}{c.causeNumber && ` — Docket #${c.causeNumber}`}</div>
                  )}
                  {c.offenseDate && <div className="charge-agency">Offense date: {c.offenseDate}</div>}
                  {c.arrestAgency && <div className="charge-agency">Arresting agency: {c.arrestAgency}</div>}
                  {c.attemptCommit && <div className="charge-agency">{c.attemptCommit}</div>}
                  {c.bail && <div className="charge-bail">Bail: {c.bail}{c.bondType && ` (${c.bondType})`}</div>}
                  {c.disposition ? (
                    <div className="charge-disposition">Disposition: {c.disposition}{c.dispositionDate && ` — ${c.dispositionDate}`}</div>
                  ) : (
                    <div className="charge-disposition charge-pending-disposition">Disposition: pending</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card-charges">
              <div className="charges-title">Charges</div>
              <div className="charge-row charge-pending">Not yet available — check back shortly.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
