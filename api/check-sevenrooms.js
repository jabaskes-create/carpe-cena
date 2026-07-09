// Checks availability for a single SevenRooms watch entry
// Uses SevenRooms' public widget API — no auth required
//
// Supports two matching modes:
//  - Day-priority ranked: check days in preferred order, pick the slot
//    closest to idealTime within tolerance, stop at first day with a match.
//  - Legacy: sequential flexDays range, any slot within timeFrom/timeTo counts.

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function dateInRange(startDate, days, weekday) {
  for (let i = 0; i < days; i++) {
    const d = i === 0 ? startDate : addDays(startDate, i);
    if (new Date(d + 'T12:00:00').getDay() === weekday) return d;
  }
  return null;
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
  if (mins === null) return timeStr;
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
  const allTimes = [];
  for (const shift of shifts) {
    if (shift.is_closed) continue;
    const times = shift.times || [];
    for (const slot of times) {
      allTimes.push({ time: slot.time, type: slot.type });
      if (slot.type !== 'book') continue;
      const slotMins = parseTimeToMinutes(slot.time);
      if (slotMins !== null && slotMins >= fromMins && slotMins <= toMins) {
        allSlots.push({
          time: slot.time,
          mins: slotMins,
          // Raw fields needed to actually book this slot later
          accessPersistentId: slot.access_persistent_id,
          shiftPersistentId: shift.shift_persistent_id,
          requiresCreditCard: slot.requires_credit_card || false,
        });
      }
    }
  }

  return { ok: true, slots: allSlots, allTimes };
}

export async function checkSevenRooms(watch) {
  try {
    const { restaurant, date, timeFrom, timeTo, venueSlug, flexDays, dayPriority, idealTime, toleranceMinutes, allowedWeekdays } = watch;
    const slug = venueSlug || restaurant.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const wasGuessed = !venueSlug;

    let fromMins, toMins, targetIdealMins;
    if (idealTime) {
      targetIdealMins = timeToMinutesLocal(idealTime);
      fromMins = targetIdealMins - (toleranceMinutes || 60);
      toMins = targetIdealMins + (toleranceMinutes || 60);
    } else {
      const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
      const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
      fromMins = fromH * 60 + fromM;
      toMins = toH * 60 + toM;
      targetIdealMins = Math.round((fromMins + toMins) / 2);
    }

    const numDays = Math.max(1, parseInt(flexDays) || 1);
    const bookingUrl = `https://www.sevenrooms.com/reservations/create/${slug}`;

    let datesToCheck = [];
    if (Array.isArray(dayPriority) && dayPriority.length > 0) {
      for (const weekday of dayPriority) {
        const d = dateInRange(date, numDays, weekday);
        if (d) datesToCheck.push(d);
      }
    } else {
      for (let i = 0; i < numDays; i++) {
        const checkDate = i === 0 ? date : addDays(date, i);
        if (Array.isArray(allowedWeekdays) && allowedWeekdays.length < 7) {
          const dow = new Date(checkDate + 'T12:00:00').getDay();
          if (!allowedWeekdays.includes(dow)) continue;
        }
        datesToCheck.push(checkDate);
      }
    }

    if (Array.isArray(watch.excludedDates) && watch.excludedDates.length > 0) {
      datesToCheck = datesToCheck.filter(d => !watch.excludedDates.includes(d));
    }

    let firstDayDiagnostic = null;

    for (let idx = 0; idx < datesToCheck.length; idx++) {
      const checkDate = datesToCheck[idx];
      const result = await checkOneDate(watch, checkDate, slug, fromMins, toMins);

      if (!result.ok) {
        if (idx === 0) {
          const reason = wasGuessed
            ? `Guessed "${slug}" as the venue, but that didn't work — paste this restaurant's direct SevenRooms link to fix it`
            : (result.friendlyReason || `SevenRooms returned ${result.httpStatus}`);
          return { available: false, reason };
        }
        continue;
      }

      if (idx === 0) firstDayDiagnostic = result;

      if (result.slots.length > 0) {
        const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const guessNote = wasGuessed ? ` (guessed venue "${slug}" — correct!)` : '';

        // Rank by closeness to ideal time
        const sorted = [...result.slots].sort((a, b) => Math.abs(a.mins - targetIdealMins) - Math.abs(b.mins - targetIdealMins));
        const best = sorted[0];
        const allTimesStr = sorted.map(s => s.time).join(', ');

        return {
          available: true,
          reason: numDays > 1 || datesToCheck.length > 1
            ? `Best match: ${best.time} on ${dateLabel} (${sorted.length} total slot${sorted.length === 1 ? '' : 's'}: ${allTimesStr})${guessNote}`
            : `Best match: ${best.time} (${sorted.length} total slot${sorted.length === 1 ? '' : 's'}: ${allTimesStr})${guessNote}`,
          slots: sorted.map(s => s.time),
          matchedDate: checkDate,
          matchedTime: best.time,
          bookingUrl,
          confirmedSlug: wasGuessed ? slug : undefined,
          // Raw fields needed if this watch has auto-booking enabled
          bookingFields: {
            venueSlug: slug,
            accessPersistentId: best.accessPersistentId,
            shiftPersistentId: best.shiftPersistentId,
            requiresCreditCard: best.requiresCreditCard,
          },
        };
      }
    }

    const guessNote = wasGuessed ? ` (guessed venue "${slug}" — correct, just nothing open)` : '';

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
          diagnosticNote = ` — bookable times that day were: ${sample} (outside your preferred window)`;
        }
      }
    }

    return {
      available: false,
      reason: (datesToCheck.length > 1
        ? `Checked ${datesToCheck.length} day(s) — no slots in your preferred time on any of them`
        : 'No bookable slots in preferred time window') + guessNote + diagnosticNote,
      confirmedSlug: wasGuessed ? slug : undefined,
    };

  } catch (err) {
    console.error('SevenRooms check error:', err.message);
    return { available: false, reason: err.message };
  }
}

function timeToMinutesLocal(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
