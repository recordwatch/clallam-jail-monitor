import { Link } from 'react-router-dom'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${month}/${day}/${year}`
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  return `${hours}:${minutes} ${ampm}`
}

function calculateTimeServed(booked, released) {
  if (!booked || !released) return null
  const start = new Date(booked)
  const end = new Date(released)
  const diffMs = end - start
  if (diffMs <= 0) return null
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${diffDays}d${diffHours}h${diffMins}m`
}

export default function HistoryLog({ entries, search = '' }) {
  const filtered = search
    ? entries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries

  if (filtered.length === 0 && search) {
    return <div className="empty">No records match your search.</div>
  }

  // Group by date - each person appears only once
  const grouped = {}

  filtered.forEach(entry => {
    const bookedDate = formatDate(entry.bookingDate || entry.firstSeen)
    if (!grouped[bookedDate]) grouped[bookedDate] = { booked: [], released: [] }

    if (entry.releasedAt) {
      const releasedDate = formatDate(entry.releasedAt)
      if (!grouped[releasedDate]) grouped[releasedDate] = { booked: [], released: [] }
      grouped[releasedDate].released.push(entry)
    } else {
      grouped[bookedDate].booked.push(entry)
    }
  })

  const sortedDates = Object.keys(grouped).sort((a, b) => {
    const [aMonth, aDay, aYear] = a.split('/')
    const [bMonth, bDay, bYear] = b.split('/')
    return new Date(`20${aYear}`, aMonth - 1, aDay) - new Date(`20${bYear}`, bMonth - 1, bDay)
  }).reverse()

  return (
    <div className="history-log">
      <div className="history-header">
        <Link to="/" className="back-link">← Main Page</Link>
        <h2>Booked and Released Log</h2>
        <p className="history-subtitle">Record of all bookings and releases, newest first</p>
      </div>

      {sortedDates.map(date => {
        const dayData = grouped[date]
        const bookedCount = dayData.booked.length
        const releasedCount = dayData.released.length

        if (bookedCount === 0 && releasedCount === 0) return null

        return (
          <div key={date} className="history-day">
            <div className="history-date">{date}</div>

            {bookedCount > 0 && (
              <div className="history-section">
                <div className="history-section-title">BOOKED ({bookedCount})</div>
                <ul className="history-list">
                  {dayData.booked.map(entry => (
                    <li key={entry.idnum} className="history-item">
                      <span className="history-name">{entry.name}</span>
                      <span className="history-meta">
                        Booked: {formatTime(entry.bookingDate || entry.firstSeen)}
                        {entry.charges && entry.charges.length > 0 && (
                          <span className="history-charges"> | Charges: {entry.charges.map(c => c.charge).filter(Boolean).join(', ')}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {releasedCount > 0 && (
              <div className="history-section">
                <div className="history-section-title">RELEASED ({releasedCount})</div>
                <ul className="history-list">
                  {dayData.released.map(entry => {
                    const timeServed = calculateTimeServed(entry.bookingDate || entry.firstSeen, entry.releasedAt)
                    return (
                      <li key={entry.idnum} className="history-item">
                        <span className="history-name">{entry.name}</span>
                        <span className="history-meta">
                          Released: {formatTime(entry.releasedAt)}
                          {timeServed && (
                            <span className="history-time-served"> | Time served: {timeServed}</span>
                          )}
                          {entry.charges && entry.charges.length > 0 && (
                            <span className="history-charges"> | Charges: {entry.charges.map(c => c.charge).filter(Boolean).join(', ')}</span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
