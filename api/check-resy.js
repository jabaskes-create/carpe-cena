// Checks availability for a single Resy watch entry
// Supports flexible date ranges: loops through each day and stops at the first match

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export async function checkResy(watch) {
  try {
    const { city, restaurant, date, partySize, flexDays } = watch;

    // Step 1: Search for venue (only need to do this once)
    const searchRes = await fetch(
      `https://api.resy.com/3/venue/search?query=${encodeURIComponent(restaurant)}&location=${encodeURIComponent(city)}&limit=5`,
      {
        headers: {
          'Authorization': `ResyAPI api_key="${process.env.RESY_API_KEY}"`,
          'X-Origin': 'https://resy.com',
        }
      }
    );
    const searchData = await searchRes.json();
    const venues = searchData?.search?.hits;
    if (!venues || venues.length === 0) return { available: false, reason: 'Venue not found' };

    const venue = venues[0];
    const venueId = venue.id?.resy;
    if (!venueId) return { available: false, reason: 'No venue ID' };

    const bookingUrl = `https://resy.com/cities/${encodeURIComponent(city.toLowerCase())}/${venue.url_slug || ''}`;
    const numDays = Math.max(1, parseInt(flexDays) || 1);

    // Step 2: Check availability for each date in the range
    for (let i = 0; i < numDays; i++) {
      const checkDate = i === 0 ? date : addDays(date, i);

      const availRes = await fetch(
        `https://api.resy.com/4/find?lat=0&long=0&day=${checkDate}&party_size=${partySize}&venue_id=${venueId}`,
        {
          headers: {
            'Authorization': `ResyAPI api_key="${process.env.RESY_API_KEY}"`,
            'X-Origin': 'https://resy.com',
            'X-Resy-Auth-Token': process.env.RESY_AUTH_TOKEN || '',
          }
        }
      );
      const availData = await availRes.json();
      const slots = availData?.results?.venues?.[0]?.slots;

      if (slots && slots.length > 0) {
        const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return {
          available: true,
          reason: numDays > 1
            ? `Found ${slots.length} open slot${slots.length === 1 ? '' : 's'} on ${dateLabel}`
            : `Found ${slots.length} open slot${slots.length === 1 ? '' : 's'}`,
          slots: slots.length,
          matchedDate: checkDate,
          bookingUrl,
        };
      }
    }

    return {
      available: false,
      reason: numDays > 1
        ? `Checked ${numDays} days — no open slots on any of them`
        : 'Found the restaurant, but no open slots for that date/party size',
    };

  } catch (err) {
    return { available: false, reason: err.message };
  }
}
