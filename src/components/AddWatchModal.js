import React, { useState, useEffect } from 'react';

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

const WEEKDAYS = [
  { value: 0, label: 'Su' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

// Extracts the venue slug from a SevenRooms URL
function extractSevenRoomsSlug(url) {
  if (!url) return '';
  try {
    const match = url.match(/sevenrooms\.com\/(?:reservations\/create|explore)\/([a-z0-9-]+)/i);
    if (match) return match[1];
    const venuesMatch = url.match(/[?&]venues=([a-z0-9-]+)/i);
    if (venuesMatch) return venuesMatch[1];
  } catch (e) {}
  return '';
}

function isGoogleMapsReserveUrl(url) {
  return /google\.com\/maps\/reserve/i.test(url || '');
}

// Mini calendar component
function CalendarPicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const initial = value ? new Date(value + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 18, padding: '0 8px' }}>‹</button>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
          {monthNames[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={{ background: 'transparent', color: 'var(--gold)', fontSize: 18, padding: '0 8px' }}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, padding: '2px 0' }}>{d}</div>
        ))}
      </div>

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

      {value && (
        <div style={{ marginTop: 10, textAlign: 'center', color: 'var(--gold)', fontSize: 13 }}>
          {new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}

const emptyForm = {
  restaurant: '',
  city: '',
  date: '',
  partySize: 2,
  platform: 'resy',
  autoBook: false,
  guestFirstName: '',
  guestLastName: '',
  guestPhone: '',
  cardLast4: '',
  windowDays: '',
  furthestBookableDate: '',
  furthestBookableObservedAt: '',
  bookingUrl: '',
  venueSlug: '',
  flexDays: 1,
  // New rank-based model
  dayPriority: [],
  idealTime: '19:00',
  toleranceMinutes: 60,
  // Legacy fields, kept in sync for older checker code paths and old watches
  timeFrom: '18:00',
  timeTo: '21:00',
  allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
};

export default function AddWatchModal({ onSave, onClose, editingWatch }) {
  const [form, setForm] = useState(() =>
    editingWatch
      ? { ...emptyForm, ...editingWatch,
          allowedWeekdays: editingWatch.allowedWeekdays || [0,1,2,3,4,5,6],
          dayPriority: editingWatch.dayPriority || [],
          idealTime: editingWatch.idealTime || '19:00',
          toleranceMinutes: editingWatch.toleranceMinutes || 60,
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);

  const isEditing = !!editingWatch;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setSevenRoomsUrl = (url) => {
    const slug = extractSevenRoomsSlug(url);
    setForm(f => ({ ...f, bookingUrl: url, venueSlug: slug || f.venueSlug }));
  };

  // Tapping a day appends it to the end of the priority list (or removes it
  // if already ranked). Order of taps IS the preference order — no drag
  // handles needed.
  const toggleDayPriority = (day) => {
    setForm(f => {
      const has = f.dayPriority.includes(day);
      const nextPriority = has ? f.dayPriority.filter(d => d !== day) : [...f.dayPriority, day];
      // Keep legacy allowedWeekdays in sync: if any days are ranked, only
      // those are "allowed"; if none are ranked, all days are allowed
      // (matches the old default-all-days behavior).
      const nextAllowed = nextPriority.length === 0 ? [0,1,2,3,4,5,6] : nextPriority;
      return { ...f, dayPriority: nextPriority, allowedWeekdays: nextAllowed };
    });
  };

  const valid = form.restaurant.trim() && form.city.trim() && form.date;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    // Derive legacy timeFrom/timeTo from the new ideal-time + tolerance
    // model, so checkers that haven't been updated yet still work sensibly.
    const [ih, im] = form.idealTime.split(':').map(Number);
    const idealMins = ih * 60 + im;
    const fromMins = Math.max(0, idealMins - form.toleranceMinutes);
    const toMins = Math.min(23 * 60 + 59, idealMins + form.toleranceMinutes);
    const toHHMM = (m) => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;

    const dataToSave = {
      ...form,
      timeFrom: toHHMM(fromMins),
      timeTo: toHHMM(toMins),
    };

    await onSave(dataToSave);
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
            {isEditing ? 'Edit Watch' : 'Watch a Restaurant'}
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

          <CalendarPicker value={form.date} onChange={v => set('date', v)} />

          {/* Flexible date range */}
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Flexible dates
            </p>
            <select value={form.flexDays} onChange={e => set('flexDays', Number(e.target.value))}>
              <option value={1}>Just this date</option>
              <option value={2}>This date, +1 day (2 days)</option>
              <option value={3}>This date, +2 days (3 days)</option>
              <option value={4}>This date, +3 days (4 days)</option>
              <option value={5}>This date, +4 days (5 days)</option>
              <option value={7}>This date, +6 days (1 week)</option>
              <option value={10}>This date, +9 days (10 days)</option>
              <option value={14}>This date, +13 days (2 weeks)</option>
            </select>
            {form.date && form.flexDays > 1 && (
              <p style={{ color: 'var(--gold)', fontSize: 12, marginTop: 6 }}>
                Range: {new Date(form.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} through{' '}
                {(() => {
                  const end = new Date(form.date + 'T12:00:00');
                  end.setDate(end.getDate() + form.flexDays - 1);
                  return end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                })()}
              </p>
            )}
          </div>

          {/* Day priority — tap in the order you'd prefer them */}
          {form.flexDays > 1 && (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Which days, in order of preference
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {WEEKDAYS.map(w => {
                  const rank = form.dayPriority.indexOf(w.value);
                  const active = rank !== -1;
                  return (
                    <button
                      key={w.value}
                      onClick={() => toggleDayPriority(w.value)}
                      style={{
                        flex: 1,
                        position: 'relative',
                        background: active ? 'var(--gold)' : 'var(--bg-secondary)',
                        color: active ? '#0f0e0c' : 'var(--text-dim)',
                        border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                        borderRadius: 6,
                        padding: '8px 0',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {active && (
                        <span style={{
                          position: 'absolute', top: -6, right: -4,
                          background: '#0f0e0c', color: 'var(--gold)',
                          border: '1px solid var(--gold)', borderRadius: '50%',
                          width: 16, height: 16, fontSize: 9, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {rank + 1}
                        </span>
                      )}
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
                {form.dayPriority.length === 0
                  ? "Tap days in the order you'd take them — e.g. Saturday first, then Friday as backup. Leave blank to check all days equally."
                  : `We'll check ${WEEKDAYS.find(w => w.value === form.dayPriority[0])?.label} first, then move down your list only if it's not available.`}
              </p>
            </div>
          )}

          {/* Ideal time + tolerance, replacing a plain start/end range */}
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Ideal time
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={form.idealTime} onChange={e => set('idealTime', e.target.value)} style={{ flex: 1 }}>
                {TIMES.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
              <span style={{ color: 'var(--text-dim)', fontSize: 13, flexShrink: 0 }}>±</span>
              <select value={form.toleranceMinutes} onChange={e => set('toleranceMinutes', Number(e.target.value))} style={{ flex: 1 }}>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
              </select>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
              We'll pick whichever open slot lands closest to {formatTime(form.idealTime)}, within your tolerance.
            </p>
          </div>

          {/* Platform + party size */}
          <div style={{ display: 'flex', gap: 10 }}>
            <select value={form.platform} onChange={e => set('platform', e.target.value)} style={{ flex: 2 }}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={form.partySize} onChange={e => set('partySize', Number(e.target.value))} style={{ flex: 1 }}>
              {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
            </select>
          </div>

          {(form.platform === 'opentable' || form.platform === 'thefork') && (
            <div>
              <p style={{ color: 'var(--gold)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>
                Furthest bookable date you currently see
              </p>
              <input
                type="date"
                value={form.furthestBookableDate || ''}
                onChange={e => {
                  set('furthestBookableDate', e.target.value);
                  // Capture "today" as the observation date — this anchors
                  // the lead-time calculation regardless of when the watch
                  // is later edited or re-saved.
                  set('furthestBookableObservedAt', e.target.value ? new Date().toISOString().split('T')[0] : '');
                }}
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                Open {form.platform === 'opentable' ? 'OpenTable' : 'TheFork'} right now and look at the furthest date it'll let you book. This makes checking dramatically more efficient — <strong style={{ color: 'var(--gold)' }}>with it, we check as often as daily right when your window is likely to open.</strong> Without it, we fall back to a much sparser schedule (weekly, then twice-weekly) since we're checking blind.
              </p>
              <details style={{ marginTop: 10 }}>
                <summary style={{ color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer' }}>Advanced: override days-in-advance manually (only used if you skip the field above)</summary>
                <input
                  type="number"
                  placeholder={form.platform === 'opentable' ? 'Default: 30 days' : 'Default: 60 days'}
                  value={form.windowDays}
                  onChange={e => set('windowDays', e.target.value)}
                  style={{ marginTop: 8 }}
                />
              </details>
            </div>
          )}

          {form.platform === 'sevenrooms' ? (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                SevenRooms link
              </p>
              <input
                placeholder="Paste the restaurant's SevenRooms booking link"
                value={form.bookingUrl}
                onChange={e => setSevenRoomsUrl(e.target.value)}
              />
              <p style={{ color: isGoogleMapsReserveUrl(form.bookingUrl) ? '#ff8a75' : 'var(--text-secondary)', fontSize: 11, marginTop: 6 }}>
                {isGoogleMapsReserveUrl(form.bookingUrl)
                  ? "⚠️ This is a Google Maps link — we can't read the venue from it. Find the restaurant's direct SevenRooms link instead."
                  : form.venueSlug
                  ? `✓ Found venue: ${form.venueSlug}`
                  : "Paste any sevenrooms.com link for this restaurant — we'll figure out the rest."}
              </p>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Booking URL <span style={{ color: 'var(--text-dim)', fontWeight: 'normal' }}>(optional)</span>
              </p>
              <input
                placeholder="Paste direct booking link for email button"
                value={form.bookingUrl}
                onChange={e => set('bookingUrl', e.target.value)}
              />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.autoBook}
              onChange={e => set('autoBook', e.target.checked)}
              style={{ width: 'auto' }}
            />
            Auto-book when available (SevenRooms only, currently in testing)
          </label>

          {form.autoBook && (
            <div style={{
              background: 'rgba(201, 168, 76, 0.08)', border: '1px solid var(--gold-dim)',
              borderRadius: 8, padding: 14
            }}>
              <p style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                ⚠️ Auto-booking is in dry-run testing — it will log what it would book, but won't actually reserve anything yet.
              </p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input
                  placeholder="First name"
                  value={form.guestFirstName || ''}
                  onChange={e => set('guestFirstName', e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  placeholder="Last name"
                  value={form.guestLastName || ''}
                  onChange={e => set('guestLastName', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <input
                placeholder="Phone number"
                value={form.guestPhone || ''}
                onChange={e => set('guestPhone', e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <input
                placeholder="Card last 4 digits (only needed for some reservations)"
                value={form.cardLast4 || ''}
                onChange={e => set('cardLast4', e.target.value)}
                maxLength={4}
              />
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 8 }}>
                We never store your full card number — only the last 4 digits, used to reference a card already saved on your SevenRooms account.
              </p>
            </div>
          )}

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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Start Watching'}
          </button>
        </div>
      </div>
    </div>
  );
}
