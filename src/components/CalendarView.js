import React, { useState } from 'react';

const PLATFORM_COLORS = {
  resy: '#ff6b6b',
  opentable: '#ffa94d',
  sevenrooms: '#c084fc',
  tock: '#4dabf7',
  thefork: '#20c997',
};

function toISODate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function datesCoveredByWatch(watch) {
  const numDays = Math.max(1, parseInt(watch.flexDays) || 1);
  const start = new Date(watch.date + 'T12:00:00');
  const dates = [];

  const restrictToWeekdays = Array.isArray(watch.dayPriority) && watch.dayPriority.length > 0
    ? watch.dayPriority
    : (Array.isArray(watch.allowedWeekdays) && watch.allowedWeekdays.length < 7 ? watch.allowedWeekdays : null);

  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (restrictToWeekdays && !restrictToWeekdays.includes(d.getDay())) continue;
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default function CalendarView({ watches, onStopOthers, onBack, onAddWatch }) {
  const today = new Date();
  const todayISO = today.toISOString().split('T')[0];
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);

  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const dateMap = {};
  for (const w of watches) {
    for (const d of datesCoveredByWatch(w)) {
      if (!dateMap[d]) dateMap[d] = [];
      dateMap[d].push(w);
    }
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedWatches = selectedDate ? (dateMap[selectedDate] || []) : [];
  const isPastDate = (iso) => iso < todayISO;

  const handleDayClick = (iso) => {
    const dayWatches = dateMap[iso] || [];
    if (dayWatches.length === 0 && !isPastDate(iso)) {
      // Empty future date — open Add Watch with date pre-filled
      onAddWatch && onAddWatch(iso);
    } else {
      setSelectedDate(selectedDate === iso ? null : iso);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>
          ← List view
        </button>
        <button
          onClick={() => onAddWatch && onAddWatch(null)}
          style={{
            background: 'var(--gold)', color: '#0f0e0c',
            fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
          }}
        >
          + Watch a Restaurant
        </button>
      </div>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={prevMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 20, padding: '0 8px' }}>‹</button>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
            {monthNames[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 20, padding: '0 8px' }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 10, padding: '2px 0' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const iso = toISODate(viewYear, viewMonth, day);
            const dayWatches = dateMap[iso] || [];
            const isToday = iso === todayISO;
            const isSelected = selectedDate === iso;
            const isPast = isPastDate(iso);
            const hasCompleted = dayWatches.some(w => w.status === 'available' || w.status === 'booked');
            const isEmpty = dayWatches.length === 0;

            return (
              <button
                key={day}
                onClick={() => handleDayClick(iso)}
                disabled={isPast && isEmpty}
                style={{
                  height: 44,
                  background: isSelected ? 'var(--gold)' : isToday ? 'var(--bg-secondary)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--gold)' : isEmpty && !isPast ? 'var(--border)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  cursor: isPast && isEmpty ? 'default' : 'pointer',
                  opacity: isPast && isEmpty ? 0.3 : 1,
                }}
              >
                <span style={{
                  fontSize: 12,
                  color: isSelected ? '#0f0e0c' : isEmpty && !isPast ? 'var(--text-dim)' : 'var(--text-primary)',
                  fontWeight: hasCompleted ? 700 : 400,
                }}>
                  {day}
                </span>
                {dayWatches.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {dayWatches.slice(0, 4).map((w, idx) => (
                      <span key={idx} style={{
                        width: 4, height: 4, borderRadius: '50%',
                        background: isSelected ? '#0f0e0c' : (PLATFORM_COLORS[w.platform] || '#888'),
                      }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <p style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 10, textAlign: 'center' }}>
          Tap a date with watches to manage · Tap an empty date to add a watch
        </p>
      </div>

      {selectedDate && (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: 'var(--gold)', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>

          {selectedWatches.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>No watches covering this date.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {selectedWatches.map(w => (
                  <div key={w.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <span style={{
                      background: PLATFORM_COLORS[w.platform] || '#333', color: '#fff',
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      textTransform: 'uppercase', marginRight: 8,
                    }}>
                      {w.platform}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{w.restaurant}</span>
                    {(w.status === 'available' || w.status === 'booked') && (
                      <span style={{ color: 'var(--green)', fontSize: 11, marginLeft: 8 }}>✓ {w.status}</span>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => onStopOthers(selectedDate, null, selectedWatches)}
                style={{
                  width: '100%',
                  background: 'transparent', border: '1px solid var(--gold-dim)',
                  color: 'var(--gold)', fontSize: 13, fontWeight: 600,
                  padding: '10px 14px', borderRadius: 8,
                }}
              >
                Stop searching for this date — {selectedWatches.length === 1 ? '1 restaurant' : `${selectedWatches.length} restaurants`}
              </button>
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                Only removes {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} from these watches. Any other dates they cover keep being checked as normal.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
