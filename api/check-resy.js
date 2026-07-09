// Checks availability for a single Resy watch entry.
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
  // Finds the first occurrence of a given weekday within the flex range
  for (let i = 0; i < days; i++) {
    const d = i === 0 ? startDate : addDays(startDate, i);
    if (new Date(d + 'T12:00:00').getDay() === weekday) return d;
  }
  return null;
}

// Best-effort extraction of a slot's start time as "HH:MM" — Resy's response
// shape isn't fully documented, so this tries a few likely field paths and
// falls back gracefully to "unknown" (in which case we can't rank by time,
// but the slot still counts as available).
function extractSlotTime(slot) {
  const candidates = [
    slot?.date?.start,
    slot?.start,
    slot?.time,
    slot?.config?.date?.start,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const match = c.match(/(\d{1,2}):(\d{2})/);
      if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
  }
  return null;
}

function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function fetchSlotsForDate(venueId, checkDate, partySize) {
  const availRes = await fetch(
    'https://api.resy.com/4/find',
    {
      method: 'POST',
      headers: {
        'Authorization': `ResyAPI api_key="${process.env.RESY_API_KEY}"`,
        'X-Origin': 'https://resy.com',
        'X-Resy-Auth-Token': process.env.RESY_AUTH_TOKEN || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lat: 0,
        long: 0,
        day: checkDate,
        party_size: parseInt(partySize),
        venue_id: venueId,
      })
    }
  );
  const text = await availRes.text();
  try {
    const availData = JSON.parse(text);
    return availData?.results?.venues?.[0]?.slots || [];
  } catch {
    throw new Error(`Resy /4/find returned non-JSON (status ${availRes.status}): ${text.slice(0, 120)}`);
  }
}

export async function checkResy(watch) {
  try {
    const { city, restaurant, date, partySize, flexDays, allowedWeekdays, dayPriority, idealTime, toleranceMinutes, timeFrom, timeTo } = watch;

    // Step 1: Search for venue (only need to do this once)
    const searchRes = await fetch(
      'https://api.resy.com/3/venuesearch/search',
      {
        method: 'POST',
        headers: {
          'Authorization': `ResyAPI api_key="${process.env.RESY_API_KEY}"`,
          'X-Origin': 'https://resy.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          geo: { latitude: 0, longitude: 0 },
          highlight: { pre_tag: '<b>', post_tag: '</b>' },
          per_page: 5,
          query: restaurant,
          slot_filter: { day: date, party_size: parseInt(partySize) },
          types: ['venue', 'cuisine'],
        })
      }
    );
    const searchText = await searchRes.text();
    let searchData;
    try {
      searchData = JSON.parse(searchText);
    } catch {
      return { available: false, reason: `Resy search returned non-JSON (status ${searchRes.status}): ${searchText.slice(0, 120)}` };
    }

    const venues = searchData?.search?.hits;
    if (!venues || venues.length === 0) return { available: false, reason: 'Venue not found' };

    const venue = venues[0];
    const venueId = venue.id?.resy;
    if (!venueId) return { available: false, reason: 'No venue ID' };

    const bookingUrl = `https://resy.com/cities/${encodeURIComponent(city.toLowerCase())}/${venue.url_slug || ''}`;
    const numDays = Math.max(1, parseInt(flexDays) || 1);

    // Determine time window: prefer the new ideal-time+tolerance model,
    // fall back to the legacy timeFrom/timeTo range
    let fromMins, toMins;
    if (idealTime) {
      const idealMins = timeToMinutes(idealTime);
      fromMins = idealMins - (toleranceMinutes || 60);
      toMins = idealMins + (toleranceMinutes || 60);
    } else if (timeFrom || timeTo) {
      fromMins = timeToMinutes(timeFrom || '00:00');
      toMins = timeToMinutes(timeTo || '23:59');
    }

    // Build the list of dates to check, in the right order
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

    // Drop any dates the person explicitly said to stop watching
    // (e.g. via the calendar's "got a reservation elsewhere" action)
    if (Array.isArray(watch.excludedDates) && watch.excludedDates.length > 0) {
      datesToCheck = datesToCheck.filter(d => !watch.excludedDates.includes(d));
    }

    for (const checkDate of datesToCheck) {
      const slots = await fetchSlotsForDate(venueId, checkDate, partySize);
      if (!slots || slots.length === 0) continue;

      const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      if (fromMins === undefined) {
        // No time preference at all — any slot on this date counts
        return {
          available: true,
          reason: numDays > 1 ? `Found ${slots.length} open slot(s) on ${dateLabel}` : `Found ${slots.length} open slot(s)`,
          slots: slots.length,
          matchedDate: checkDate,
          bookingUrl,
        };
      }

      // Try to rank by closeness to ideal time
      const withTimes = slots
        .map(s => ({ slot: s, time: extractSlotTime(s) }))
        .filter(s => s.time !== null);

      if (withTimes.length === 0) {
        // Couldn't parse any slot times — fall back to "any slot counts"
        return {
          available: true,
          reason: numDays > 1
            ? `Found ${slots.length} open slot(s) on ${dateLabel} (couldn't verify exact times)`
            : `Found ${slots.length} open slot(s) (couldn't verify exact times)`,
          slots: slots.length,
          matchedDate: checkDate,
          bookingUrl,
        };
      }

      const idealMins = idealTime ? timeToMinutes(idealTime) : Math.round((fromMins + toMins) / 2);
      const inWindow = withTimes.filter(s => {
        const m = timeToMinutes(s.time);
        return m >= fromMins && m <= toMins;
      });

      if (inWindow.length > 0) {
        inWindow.sort((a, b) => Math.abs(timeToMinutes(a.time) - idealMins) - Math.abs(timeToMinutes(b.time) - idealMins));
        const best = inWindow[0];
        return {
          available: true,
          reason: numDays > 1
            ? `Found a ${best.time} slot on ${dateLabel}`
            : `Found a ${best.time} slot`,
          slots: inWindow.length,
          matchedDate: checkDate,
          bookingUrl,
        };
      }
      // No slots in this date's preferred time window — move to next candidate date
    }

    return {
      available: false,
      reason: datesToCheck.length > 1
        ? `Checked ${datesToCheck.length} day(s) — no slots in your preferred time on any of them`
        : 'Found the restaurant, but no slots in your preferred time',
    };

  } catch (err) {
    return { available: false, reason: err.message };
  }
}