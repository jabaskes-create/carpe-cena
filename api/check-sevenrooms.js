// Checks availability for a single SevenRooms watch entry
// Uses SevenRooms' public widget API — no auth required
// Supports flexible date ranges: loops through each day and stops at the first match

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// SevenRooms sometimes returns "17:30" (24hr) and sometimes "5:30 PM" (12hr) —
// this handles both so slot filtering and display never silently break.
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function formatTime(timeStr) {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return timeStr; // fallback: show raw string rather than break
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

async function checkOneDate(watch, date, slug, fromMins, toMins) {
  const { partySize } = watch;

  const midMins = Math.round((fromMins + toMins) / 2);
  const midH = Math.floor(midMins / 60).toString().padStart(2, '0');
  const midM = (midMins % 60).toString().padStart(2, '0');
  const timeSlot = `${midH}:${midM}`;

  // halo_size_interval covers ± this many 15-min steps around time_slot.
  // Widened to 32 (±8 hours) so we reliably cover the full requested window
  // regardless of how far it sits from the midpoint.
  const url = `https://www.sevenrooms.com/api-yoa/availability/widget/range?venue=${slug}&time_slot=${timeSlot}&party_size=${partySize}&halo_size_interval=32&start_date=${date}&num_days=1&channel=SEVENROOMS_WIDGET`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://www.sevenrooms.com/reservations/create/${slug}`,
      'Accept': 'application/json',
    }
  });

  if (!res.ok) {
    const friendlyReason = res.status === 400
      ? `Couldn't find "${slug}" as a SevenRooms venue — double check you pasted their direct SevenRooms booking link (not a Google Maps link)`
      : res.status === 404
      ? `Venue "${slug}" not found on SevenRooms`
      : `SevenRooms had a problem responding (error ${res.status}) — try again shortly`;
    return { ok: false, httpStatus: res.status, friendlyReason };
  }

  const data = await res.json();
  const shifts = data?.data?.availability?.[date];
  if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
    return { ok: true, slots: [], allTimes: [], noShiftsAtAll: true };
  }

  const allSlots = [];
  const allTimes = []; // unfiltered, for diagnostics
  for (const shift of shifts) {
    if (shift.is_closed) continue;
    const times = shift.times || [];
    for (const slot of times) {
      allTimes.push({ time: slot.time, type: slot.type });
      if (slot.type !== 'book') continue;
      const slotMins = parseTimeToMinutes(slot.time);
      if (slotMins !== null && slotMins >= fromMins && slotMins <= toMins) {
        allSlots.push(slot.time);
      }
    }
  }

  return { ok: true, slots: allSlots, allTimes };
}

export async function checkSevenRooms(watch) {
  try {
    const { restaurant, date, timeFrom, timeTo, venueSlug, flexDays } = watch;
    const slug = venueSlug || restaurant.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const wasGuessed = !venueSlug;

    const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
    const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
    const fromMins = fromH * 60 + fromM;
    const toMins = toH * 60 + toM;

    const numDays = Math.max(1, parseInt(flexDays) || 1);
    const bookingUrl = `https://www.sevenrooms.com/reservations/create/${slug}`;

    let firstDayDiagnostic = null;

    for (let i = 0; i < numDays; i++) {
      const checkDate = i === 0 ? date : addDays(date, i);

      if (Array.isArray(watch.allowedWeekdays) && watch.allowedWeekdays.length < 7) {
        const dow = new Date(checkDate + 'T12:00:00').getDay();
        if (!watch.allowedWeekdays.includes(dow)) continue;
      }

      const result = await checkOneDate(watch, checkDate, slug, fromMins, toMins);

      if (!result.ok) {
        if (i === 0) {
          const reason = wasGuessed
            ? `Guessed "${slug}" as the venue, but that didn't work — paste this restaurant's direct SevenRooms link to fix it`
            : (result.friendlyReason || `SevenRooms returned ${result.httpStatus}`);
          return { available: false, reason };
        }
        continue;
      }

      // Save diagnostic info from the first date checked, in case nothing matches anywhere
      if (i === 0) {
        firstDayDiagnostic = result;
      }

      if (result.slots.length > 0) {
        const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const guessNote = wasGuessed ? ` (guessed venue "${slug}" — correct!)` : '';
        return {
          available: true,
          reason: numDays > 1
            ? `Found ${result.slots.length} slot${result.slots.length === 1 ? '' : 's'} on ${dateLabel}: ${result.slots.join(', ')}${guessNote}`
            : `Found ${result.slots.length} slot${result.slots.length === 1 ? '' : 's'}: ${result.slots.join(', ')}${guessNote}`,
          slots: result.slots,
          matchedDate: checkDate,
          bookingUrl,
          confirmedSlug: wasGuessed ? slug : undefined,
        };
      }
    }

    const guessNote = wasGuessed ? ` (guessed venue "${slug}" — correct, just nothing open)` : '';

    // Build a diagnostic message from the first day's raw data so we can
    // actually see what SevenRooms offered, instead of a blind "not available"
    let diagnosticNote = '';
    if (firstDayDiagnostic) {
      if (firstDayDiagnostic.noShiftsAtAll) {
        diagnosticNote = ' — the restaurant returned no shifts at all for this date (likely fully booked, closed, or a party size they can\'t seat)';
      } else if (firstDayDiagnostic.allTimes.length === 0) {
        diagnosticNote = ' — no times were offered at all for this date';
      } else {
        const bookable = firstDayDiagnostic.allTimes.filter(t => t.type === 'book');
        if (bookable.length === 0) {
          const sample = firstDayDiagnostic.allTimes.slice(0, 5).map(t => `${formatTime(t.time)} (${t.type})`).join(', ');
          diagnosticNote = ` — times exist but none are directly bookable (e.g. ${sample}) — may require calling or joining a waitlist`;
        } else {
          const sample = bookable.slice(0, 8).map(t => formatTime(t.time)).join(', ');
          diagnosticNote = ` — bookable times that day were: ${sample} (outside your ${formatTime(timeFrom || '17:00')}–${formatTime(timeTo || '22:00')} window)`;
        }
      }
    }

    return {
      available: false,
      reason: (numDays > 1
        ? `Checked ${numDays} days — no slots in your time window on any of them`
        : 'No bookable slots in preferred time window') + guessNote + diagnosticNote,
      confirmedSlug: wasGuessed ? slug : undefined,
    };

  } catch (err) {
    console.error('SevenRooms check error:', err.message);
    return { available: false, reason: err.message };
  }
}
