import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import Header from './components/Header'
import StatBar from './components/StatBar'
import BookingCard from './components/BookingCard'
import HistoryLog from './components/HistoryLog'
import StatsPage from './components/StatsPage'

function getDateLabel(entry, field = 'firstSeen') {
  const raw = entry[field] || entry.bookingDate || ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw.split(',')[0].trim()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${month}/${day}/${d.getFullYear()}`
}

function BookingLog({ entries, grouped = false, groupBy = 'firstSeen' }) {
  if (entries.length === 0) {
    return <div className="empty">No records match your search.</div>
  }

  if (!grouped) {
    return (
      <div className="log">
        <div className="log-count">{entries.length} record{entries.length !== 1 ? 's' : ''}</div>
        {entries.map(entry => (
          <BookingCard key={entry.idnum} entry={entry} />
        ))}
      </div>
    )
  }

  const groups = []
  const seen = {}
  for (const entry of entries) {
    const date = getDateLabel(entry, groupBy)
    if (!seen[date]) {
      seen[date] = []
      groups.push({ date, entries: seen[date] })
    }
    seen[date].push(entry)
  }

  return (
    <div className="log">
      <div className="log-count">{entries.length} record{entries.length !== 1 ? 's' : ''}</div>
      {groups.map(({ date, entries: group }) => (
        <div key={date}>
          <div className="date-separator">{date}</div>
          {group.map(entry => (
            <BookingCard key={entry.idnum} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  )
}

function InCustodyPage() {
  const [log, setLog] = useState([])
  const [status, setStatus] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('./data/change_log.json').then(r => r.json()),
      fetch('./data/status.json').then(r => r.json())
    ]).then(([logData, statusData]) => {
      const inCustody = logData
        .filter(e => e.status === 'in_custody')
        .sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate))
      setLog(inCustody)
      setStatus(statusData)
      setLoading(false)
    })
  }, [])

  const filtered = log.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="app">
      <Header />
      {status && <StatBar status={status} />}
      <div className="controls">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <div className="filter-tabs">
          <Link to="/" className="active">In Custody</Link>
          <Link to="/released">Released</Link>
          <Link to="/history">History</Link>
        </div>
      </div>
      {loading ? <div className="loading">Loading records...</div> : <BookingLog entries={filtered} grouped groupBy="bookingDate" />}
    </div>
  )
}

function ReleasedPage() {
  const [log, setLog] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('./data/change_log.json').then(r => r.json()).then(logData => {
      const released = logData
        .filter(e => e.status === 'released')
        .sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt))
      setLog(released)
      setLoading(false)
    })
  }, [])

  const filtered = log.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="app">
      <Header />
      <div className="controls">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <div className="filter-tabs">
          <Link to="/">In Custody</Link>
          <Link to="/released" className="active">Released</Link>
          <Link to="/history">History</Link>
        </div>
      </div>
      {loading ? <div className="loading">Loading records...</div> : <BookingLog entries={filtered} grouped groupBy="releasedAt" />}
    </div>
  )
}

function HistoryPage() {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('./data/change_log.json').then(r => r.json()).then(logData => {
      setLog(logData)
      setLoading(false)
    })
  }, [])

  return (
    <div className="app">
      <Header />
      <div className="controls">
        <div className="filter-tabs">
          <Link to="/">In Custody</Link>
          <Link to="/released">Released</Link>
          <Link to="/history" className="active">History</Link>
        </div>
      </div>
      {loading ? <div className="loading">Loading records...</div> : <HistoryLog entries={log} />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<InCustodyPage />} />
        <Route path="/released" element={<ReleasedPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </HashRouter>
  )
}
