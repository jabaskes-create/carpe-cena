// Checks availability for a single Resy watch entry
// Called by cron-check.js

export async function checkResy(watch) {
  try {
    const { city, restaurant, date, partySize } = watch;

    // Step 1: Search for venue
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

    // Step 2: Check availability
    const availRes = await fetch(
      `https://api.resy.com/4/find?lat=0&long=0&day=${date}&party_size=${partySize}&venue_id=${venueId}`,
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
      const bookingUrl = `https://resy.com/cities/${encodeURIComponent(city.toLowerCase())}/${venue.url_slug || ''}`;
      return { available: true, reason: `Found ${slots.length} open slot${slots.length === 1 ? '' : 's'}`, slots: slots.length, bookingUrl };
    }

    return { available: false, reason: 'Found the restaurant, but no open slots for that date/party size' };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}