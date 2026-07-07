import React from 'react';

const PLATFORM_COLORS = {
  resy: '#e74c3c',
  opentable: '#da3743',
  sevenrooms: '#1a1a2e',
  tock: '#2c3e50',
  thefork: '#00b28a',
};

const PLATFORM_LABELS = {
  resy: 'Resy',
  opentable: 'OpenTable',
  sevenrooms: 'SevenRooms',
  tock: 'Tock',
  thefork: 'TheFork',
};

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

export default function WatchCard({ watch, onDelete, isPast }) {
  const dateStr = new Date(watch.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  const statusColor = watch.status === 'available' ? 'var(--green)'
    : watch.status === 'booked' ? 'var(--gold)'
    : 'var(--text-secondary)';

  const statusLabel = watch.status === 'available' ? '✓ Available!'
    : watch.status === 'booked' ? '✓ Booked'
    : '👁 Watching';

  const timeRange = watch.timeFrom && watch.timeTo
    ? `${formatTime(watch.timeFrom)} – ${formatTime(watch.timeTo)}`
    : null;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{
            background: PLATFORM_COLORS[watch.platform] || '#333',
            color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '2px 7px', borderRadius: 4, letterSpacing: 0.5,
            textTransform: 'uppercase', flexShrink: 0
          }}>
            {PLATFORM_LABELS[watch.platform] || watch.platform}
          </span>
          <span style={{ color: statusColor, fontSize: 12, fontWeight: 600 }}>
            {statusLabel}
          </span>
        </div>

        <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 2 }}>
          {watch.restaurant}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {watch.city} · {dateStr} · {watch.partySize} {watch.partySize === 1 ? 'guest' : 'guests'}
        </p>
        {timeRange && (
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 3 }}>
            🕐 {timeRange}
          </p>
        )}
        {watch.autoBook && (
          <p style={{ color: 'var(--gold-dim)', fontSize: 12, marginTop: 3 }}>⚡ Auto-book enabled</p>
        )}
      </div>

      {!isPast && (
        <button onClick={() => onDelete(watch.id)} style={{
          background: 'transparent', color: 'var(--text-dim)',
          fontSize: 18, padding: '4px 8px', flexShrink: 0
        }}>
          ×
        </button>
      )}
    </div>
  );
}