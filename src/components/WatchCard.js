import React, { useState, useEffect } from 'react';

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

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

export default function WatchCard({ watch, onDelete, onEdit, isPast }) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setTimeout(() => setCooldownSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSeconds]);

  const dateStr = watch.flexDays > 1
    ? (() => {
        const start = new Date(watch.date + 'T12:00:00');
        const end = new Date(watch.date + 'T12:00:00');
        end.setDate(end.getDate() + watch.flexDays - 1);
        const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${startStr} – ${endStr}`;
      })()
    : new Date(watch.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });

  // Show which specific weekdays are targeted, if the person narrowed it down
  const weekdayStr = (watch.flexDays > 1 && Array.isArray(watch.allowedWeekdays) && watch.allowedWeekdays.length < 7)
    ? watch.allowedWeekdays.slice().sort().map(d => WEEKDAY_LABELS[d]).join(', ')
    : null;

  const statusColor = watch.status === 'available' ? 'var(--green)'
    : watch.status === 'booked' ? 'var(--gold)'
    : 'var(--text-secondary)';

  const statusLabel = watch.status === 'available' ? '✓ Available!'
    : watch.status === 'booked' ? '✓ Booked'
    : '👁 Watching';

  const matchedDateStr = watch.matchedDate
    ? new Date(watch.matchedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const timeRange = watch.timeFrom && watch.timeTo
    ? `${formatTime(watch.timeFrom)} – ${formatTime(watch.timeTo)}`
    : null;

  const handleCheckNow = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(`/api/check-single?watchId=${watch.id}`);
      const data = await res.json();
      setCheckResult(data);
      if (data.cooldown && data.waitSeconds) {
        setCooldownSeconds(data.waitSeconds);
      } else {
        setCooldownSeconds(60); // normal cooldown after a real check
      }
    } catch (err) {
      setCheckResult({ available: false, reason: 'Check failed — try again' });
    }
    setChecking(false);
  };

  const checkDisabled = checking || cooldownSeconds > 0;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
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
          {weekdayStr && (
            <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 3 }}>
              📅 Only: {weekdayStr}
            </p>
          )}
          {matchedDateStr && watch.status !== 'watching' && (
            <p style={{ color: 'var(--green)', fontSize: 12, marginTop: 3, fontWeight: 600 }}>
              ✓ Matched: {matchedDateStr}
            </p>
          )}
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
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={() => onEdit(watch)} style={{
              background: 'transparent', color: 'var(--text-dim)',
              fontSize: 15, padding: '4px 8px'
            }} title="Edit">
              ✎
            </button>
            <button onClick={() => onDelete(watch.id)} style={{
              background: 'transparent', color: 'var(--text-dim)',
              fontSize: 18, padding: '4px 8px'
            }} title="Delete">
              ×
            </button>
          </div>
        )}
      </div>

      {!isPast && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleCheckNow}
            disabled={checkDisabled}
            style={{
              background: 'transparent',
              border: '1px solid var(--gold-dim)',
              color: checkDisabled ? 'var(--text-dim)' : 'var(--gold)',
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            {checking ? 'Checking…' : cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s…` : '🔍 Test this watch'}
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>
            Verifies setup — daily automatic checks do the real monitoring
          </span>

          {checkResult && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: checkResult.available ? 'rgba(46, 204, 113, 0.15)' : 'rgba(196, 188, 171, 0.12)',
              border: `1px solid ${checkResult.available ? 'var(--green)' : 'var(--text-dim)'}`,
            }}>
              <p style={{
                fontSize: 13,
                color: checkResult.available ? 'var(--green)' : 'var(--text-secondary)',
                fontWeight: 600,
                marginBottom: checkResult.reason ? 4 : 0,
              }}>
                {checkResult.available ? '✓ Available now!' : checkResult.cooldown ? '⏱ Please wait' : '○ Not yet available'}
              </p>
              {checkResult.reason && (
                <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {checkResult.reason}
                </p>
              )}
              {checkResult.bookingUrl && (
                <a
                  href={checkResult.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 8, color: 'var(--gold)', fontSize: 12, fontWeight: 600 }}
                >
                  Book Now →
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
