export default function HBarList({ items, valueLabel = v => v, maxValue }) {
  if (!items.length) return <div className="empty">No data yet.</div>
  const max = maxValue ?? Math.max(...items.map(i => i.count))
  return (
    <div className="hbar-list">
      {items.map((item, i) => (
        <div className="hbar-row" key={item.name || i}>
          <div className="hbar-label">{item.name}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${max ? (item.count / max) * 100 : 0}%` }} />
          </div>
          <div className="hbar-value">{valueLabel(item.count)}{item.pct !== undefined && <span className="hbar-pct"> · {item.pct.toFixed(1)}%</span>}</div>
        </div>
      ))}
    </div>
  )
}
