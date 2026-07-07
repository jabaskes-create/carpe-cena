// Checks availability for a single SevenRooms watch entry
// Uses SevenRooms public widget API — no auth required

export async function checkSevenRooms(watch) {
  try {
    const { date, partySize, timeFrom, timeTo, venueSlug } = watch;

    if (!venueSlug) {
      return { available: false, reason: 'No venue slug — paste the SevenRooms URL when adding watch' };
    }

    // Use the public widget range API
    const url = `https://www.sevenrooms.com/api-yoa/availability/widget/range?` +
      `venue=${encodeURIComponent(venueSlug)}` +
      `&time_slot=${timeFrom || '19:00'}` +
      `&party_size=${partySize}` +
      `&halo_size_interval=16` +
      `&start_date=${date}` +
      `&num_days=1` +
      `&channel=SEVENROOMS_WIDGET`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://www.sevenrooms.com/reservations/create/${venueSlug}`,
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
      return { available: false, reason: `SevenRooms API returned ${res.status}` };
    }

    const data = await res.json();

    // Response contains time_slots array for the requested date
    const dateData = data?.data?.availability?.[date];
    if (!dateData) {
      return { available: false, reason: 'No data for requested date' };
    }

    // Filter slots within preferred time window
    const fromMinutes = timeToMinutes(timeFrom || '17:00');
    const toMinutes = timeToMinutes(timeTo || '22:00');

    const bookableSlots = Object.entries(dateData)
      .filter(([time, slot]) => {
        const slotMinutes = timeToMinutes(time);
        return slotMinutes >= fromMinutes &&
               slotMinutes <= toMinutes &&
               slot?.times?.some(t => t.status === 'available');
      });

    if (bookableSlots.length > 0) {
      const bookingUrl = `https://www.sevenrooms.com/reservations/create/${venueSlug}`;
      const times = bookableSlots.map(([time]) => time);
      return { available: true, slots: times, bookingUrl };
    }

    return { available: false, reason: 'No bookable slots in time window' };

  } catch (err) {
    console.error('SevenRooms check error:', err);
    return { available: false, reason: err.message };
  }
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}