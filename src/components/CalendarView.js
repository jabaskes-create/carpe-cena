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

// Every calendar date a watch is actively covering — respects flexDays range
// and, if set, dayPriority/allowedWeekdays narrowing.
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

export default function CalendarView({ watches, onStopOthers, onBack }) {
  const today = new Date();
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

  // Build a map of date -> [watches covering that date]
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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>
          ← List view
        </button>
      </div>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 22, padding: '0 10px' }}>‹</button>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }}>
            {monthNames[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 22, padding: '0 10px' }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: '2px 0' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;
            const iso = toISODate(viewYear, viewMonth, day);
            const dayWatches = dateMap[iso] || [];
            const isToday = new Date(new Date().toDateString()).getTime() === new Date(viewYear, viewMonth, day).getTime();
            const isSelected = selectedDate === iso;
            const hasCompleted = dayWatches.some(w => w.status === 'available' || w.status === 'booked');

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(iso)}
                style={{
                  aspectRatio: '1',
                  background: isSelected ? 'var(--gold)' : isToday ? 'var(--bg-secondary)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 13,
                  color: isSelected ? '#0f0e0c' : 'var(--text-primary)',
                  fontWeight: hasCompleted ? 700 : 400,
                }}>
                  {day}
                </span>
                {dayWatches.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {dayWatches.slice(0, 4).map((w, idx) => (
                      <span key={idx} style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: isSelected ? '#0f0e0c' : (PLATFORM_COLORS[w.platform] || '#888'),
                      }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div style={{ marginTop: 20 }}>
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
