// Checks availability for a single SevenRooms watch entry
// Uses SevenRooms' public widget API — no auth required

export async function checkSevenRooms(watch) {
  try {
    const { restaurant, city, date, partySize, timeFrom, timeTo, venueSlug } = watch;

    // Use venueSlug if provided, otherwise derive from restaurant name
    const slug = venueSlug || restaurant.toLowerCase().replace(/[^a-z0-9]+/g, '');

    // Convert timeFrom to minutes from midnight for halo comparison
    const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
    const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
    const fromMins = fromH * 60 + fromM;
    const toMins = toH * 60 + toM;

    // Use midpoint of preferred window as the target time_slot
    const midMins = Math.round((fromMins + toMins) / 2);
    const midH = Math.floor(midMins / 60).toString().padStart(2, '0');
    const midM = (midMins % 60).toString().padStart(2, '0');
    const timeSlot = `${midH}:${midM}`;

    // halo_size_interval=16 means check ±2 hours (16 x 15min intervals)
    const url = `https://www.sevenrooms.com/api-yoa/availability/widget/range?venue=${slug}&time_slot=${timeSlot}&party_size=${partySize}&halo_size_interval=16&start_date=${date}&num_days=1&channel=SEVENROOMS_WIDGET`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://www.sevenrooms.com/reservations/create/${slug}`,
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
      return { available: false, reason: `SevenRooms returned ${res.status}` };
    }

    const data = await res.json();
    console.log('SevenRooms raw response:', JSON.stringify(data).slice(0, 2000));

    // Response structure: data.data.availability is an object keyed by date
    const dateAvail = data?.data?.availability?.[date];
    if (!dateAvail) {
      return { available: false, reason: 'No availability data for date' };
    }

    // Filter time slots within the preferred window
    const slots = Object.entries(dateAvail)
      .filter(([time, slotData]) => {
        if (!slotData?.time_iso) return false;
        const [h, m] = time.split(':').map(Number);
        const slotMins = h * 60 + m;
        return slotMins >= fromMins && slotMins <= toMins;
      })
      .filter(([, slotData]) => slotData?.status === 'available' || slotData?.inventory > 0);

    if (slots.length > 0) {
      const bookingUrl = `https://www.sevenrooms.com/reservations/create/${slug}`;
      return {
        available: true,
        slots: slots.map(([time]) => time),
        bookingUrl,
      };
    }

    return { available: false, reason: 'No slots in preferred time window' };

  } catch (err) {
    console.error('SevenRooms check error:', err.message);
    return { available: false, reason: err.message };
  }
}