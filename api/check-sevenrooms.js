// Checks availability for a single SevenRooms watch entry
// Uses SevenRooms' public widget API — no auth required
// Supports flexible date ranges: loops through each day and stops at the first match

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function checkOneDate(watch, date, slug, fromMins, toMins) {
  const { partySize, timeFrom, timeTo } = watch;

  const midMins = Math.round((fromMins + toMins) / 2);
  const midH = Math.floor(midMins / 60).toString().padStart(2, '0');
  const midM = (midMins % 60).toString().padStart(2, '0');
  const timeSlot = `${midH}:${midM}`;

  const url = `https://www.sevenrooms.com/api-yoa/availability/widget/range?venue=${slug}&time_slot=${timeSlot}&party_size=${partySize}&halo_size_interval=16&start_date=${date}&num_days=1&channel=SEVENROOMS_WIDGET`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://www.sevenrooms.com/reservations/create/${slug}`,
      'Accept': 'application/json',
    }
  });

  if (!res.ok) {
    return { ok: false, httpStatus: res.status };
  }

  const data = await res.json();
  const shifts = data?.data?.availability?.[date];
  if (!shifts || !Array.isArray(shifts)) {
    return { ok: true, slots: [] };
  }

  const allSlots = [];
  for (const shift of shifts) {
    if (shift.is_closed) continue;
    const times = shift.times || [];
    for (const slot of times) {
      if (slot.type !== 'book') continue;
      const [h, m] = slot.time.split(':').map(Number);
      const slotMins = h * 60 + m;
      if (slotMins >= fromMins && slotMins <= toMins) {
        allSlots.push(slot.time);
      }
    }
  }

  return { ok: true, slots: allSlots };
}

export async function checkSevenRooms(watch) {
  try {
    const { restaurant, date, timeFrom, timeTo, venueSlug, flexDays } = watch;
    const slug = venueSlug || restaurant.toLowerCase().replace(/[^a-z0-9]+/g, '');

    const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
    const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
    const fromMins = fromH * 60 + fromM;
    const toMins = toH * 60 + toM;

    const numDays = Math.max(1, parseInt(flexDays) || 1);
    const bookingUrl = `https://www.sevenrooms.com/reservations/create/${slug}`;

    for (let i = 0; i < numDays; i++) {
      const checkDate = i === 0 ? date : addDays(date, i);
      const result = await checkOneDate(watch, checkDate, slug, fromMins, toMins);

      if (!result.ok) {
        // If the very first date fails outright, surface the error;
        // otherwise just skip this date and keep checking the range
        if (i === 0) return { available: false, reason: `SevenRooms returned ${result.httpStatus}` };
        continue;
      }

      if (result.slots.length > 0) {
        const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return {
          available: true,
          reason: numDays > 1
            ? `Found ${result.slots.length} slot${result.slots.length === 1 ? '' : 's'} on ${dateLabel}: ${result.slots.join(', ')}`
            : `Found ${result.slots.length} slot${result.slots.length === 1 ? '' : 's'}: ${result.slots.join(', ')}`,
          slots: result.slots,
          matchedDate: checkDate,
          bookingUrl,
        };
      }
    }

    return {
      available: false,
      reason: numDays > 1
        ? `Checked ${numDays} days — no slots in your time window on any of them`
        : 'No bookable slots in preferred time window',
    };

  } catch (err) {
    console.error('SevenRooms check error:', err.message);
    return { available: false, reason: err.message };
  }
}
