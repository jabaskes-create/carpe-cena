import React, { useState } from 'react';

const PLATFORMS = [
  { value: 'resy', label: 'Resy' },
  { value: 'opentable', label: 'OpenTable' },
  { value: 'sevenrooms', label: 'SevenRooms' },
  { value: 'tock', label: 'Tock' },
  { value: 'thefork', label: 'TheFork' },
];

const TIMES = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'
];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

// Mini calendar component
function CalendarPicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const selected = value ? new Date(value + 'T12:00:00') : null;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

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

  const selectDay = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    if (d < today) return;
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(iso);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 16
    }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 18, padding: '0 8px' }}>‹</button>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
          {monthNames[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 18, padding: '0 8px' }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const cellDate = new Date(viewYear, viewMonth, day);
          const isPast = cellDate < today;
          const isSelected = selected &&
            selected.getFullYear() === viewYear &&
            selected.getMonth() === viewMonth &&
            selected.getDate() === day;
          const isToday = cellDate.getTime() === today.getTime();

          return (
            <button
              key={day}
              onClick={() => selectDay(day)}
              disabled={isPast}
              style={{
                background: isSelected ? 'var(--gold)' : isToday ? 'var(--border)' : 'transparent',
                color: isSelected ? '#0f0e0c' : isPast ? 'var(--text-dim)' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 6,
                padding: '6px 2px',
                fontSize: 13,
                cursor: isPast ? 'default' : 'pointer',
                fontWeight: isSelected ? 700 : 'normal',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      {value && (
        <div style={{ marginTop: 10, textAlign: 'center', color: 'var(--gold)', fontSize: 13 }}>
          {new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}

export default function AddWatchModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    restaurant: '',
    city: '',
    date: '',
    partySize: 2,
    platform: 'resy',
    autoBook: false,
    windowDays: '',
    timeFrom: '18:00',
    timeTo: '21:00',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const valid = form.restaurant.trim() && form.city.trim() && form.date;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    await onSave(form);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16, overflowY: 'auto'
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, width: '100%', maxWidth: 440,
        margin: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font)', color: 'var(--gold)', fontWeight: 'normal', fontSize: 20 }}>
            Watch a Restaurant
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-dim)', fontSize: 22 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            placeholder="Restaurant name"
            value={form.restaurant}
            onChange={e => set('restaurant', e.target.value)}
          />
          <input
            placeholder="City (e.g. London, Paris, New York)"
            value={form.city}
            onChange={e => set('city', e.target.value)}
          />

          {/* Calendar picker */}
          <CalendarPicker value={form.date} onChange={v => set('date', v)} />

          {/* Platform + party size */}
          <div style={{ display: 'flex', gap: 10 }}>
            <select value={form.platform} onChange={e => set('platform', e.target.value)} style={{ flex: 2 }}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={form.partySize} onChange={e => set('partySize', Number(e.target.value))} style={{ flex: 1 }}>
              {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
            </select>
          </div>

          {/* Preferred time range */}
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Preferred time window
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={form.timeFrom} onChange={e => set('timeFrom', e.target.value)} style={{ flex: 1 }}>
                {TIMES.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
              <span style={{ color: 'var(--text-dim)', fontSize: 13, flexShrink: 0 }}>to</span>
              <select value={form.timeTo} onChange={e => set('timeTo', e.target.value)} style={{ flex: 1 }}>
                {TIMES.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </div>
          </div>

          {(form.platform === 'opentable' || form.platform === 'thefork') && (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Booking window (days in advance)
              </p>
              <input
                type="number"
                placeholder={form.platform === 'opentable' ? 'Default: 30 days' : 'Default: 60 days'}
                value={form.windowDays}
                onChange={e => set('windowDays', e.target.value)}
              />
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6 }}>
                We'll email you when this window opens. Leave blank to use the default.
              </p>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.autoBook}
              onChange={e => set('autoBook', e.target.checked)}
              style={{ width: 'auto' }}
            />
            Auto-book when available (where supported)
          </label>

          <button
            onClick={handleSave}
            disabled={!valid || saving}
            style={{
              background: valid ? 'var(--gold)' : 'var(--border)',
              color: valid ? '#0f0e0c' : 'var(--text-dim)',
              padding: '13px', borderRadius: 8, fontWeight: 600,
              fontSize: 15, marginTop: 4
            }}
          >
            {saving ? 'Saving…' : 'Start Watching'}
          </button>
        </div>
      </div>
    </div>
  );
}