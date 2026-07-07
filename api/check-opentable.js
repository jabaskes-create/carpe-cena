// Checks availability for a single OpenTable watch entry
// Uses OpenTable's internal GraphQL API (same one their website uses)

export async function checkOpenTable(watch) {
  try {
    const { restaurant, city, date, partySize, timeFrom, timeTo } = watch;

    // Step 1: Search for restaurant to get numeric ID
    const searchRes = await fetch('https://www.opentable.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.opentable.com/',
        'Accept': 'application/json',
        'OT-Agent-Id': 'b6afe204-c2bc-4f57-a552-cc5d2aa9f674',
      },
      body: JSON.stringify({
        operationName: 'Autocomplete',
        variables: {
          term: restaurant,
          location: city,
          covers: partySize,
          date,
          time: timeFrom || '19:00',
        },
        query: `query Autocomplete($term: String!, $location: String, $covers: Int, $date: String, $time: String) {
          autocomplete(term: $term, location: $location, covers: $covers, date: $date, time: $time) {
            restaurants {
              rid
              name
              slug
              city
            }
          }
        }`
      })
    });

    const searchData = await searchRes.json();
    const restaurants = searchData?.data?.autocomplete?.restaurants;

    if (!restaurants || restaurants.length === 0) {
      return { available: false, reason: 'Restaurant not found on OpenTable' };
    }

    // Pick best match — prefer city match
    const match = restaurants.find(r =>
      r.name.toLowerCase().includes(restaurant.toLowerCase().split(' ')[0]) &&
      r.city?.toLowerCase().includes(city.toLowerCase().split(',')[0].toLowerCase())
    ) || restaurants[0];

    const rid = match.rid;
    const slug = match.slug;

    // Step 2: Check availability
    const availRes = await fetch('https://www.opentable.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://www.opentable.com/r/${slug}`,
        'Accept': 'application/json',
        'OT-Agent-Id': 'b6afe204-c2bc-4f57-a552-cc5d2aa9f674',
      },
      body: JSON.stringify({
        operationName: 'RestaurantsAvailability',
        variables: {
          restaurantIds: [rid],
          date,
          partySize,
          startTime: timeFrom || '17:00',
          endTime: timeTo || '22:00',
        },
        query: `query RestaurantsAvailability($restaurantIds: [Int!]!, $date: String!, $partySize: Int!, $startTime: String, $endTime: String) {
          restaurantsAvailability(restaurantIds: $restaurantIds, date: $date, partySize: $partySize, startTime: $startTime, endTime: $endTime) {
            rid
            availability {
              timeOffered
              canBook
            }
          }
        }`
      })
    });

    const availData = await availRes.json();
    const avail = availData?.data?.restaurantsAvailability?.[0]?.availability;

    if (!avail || avail.length === 0) {
      return { available: false, reason: 'No availability returned' };
    }

    // Filter to bookable slots within time window
    const bookableSlots = avail.filter(s => s.canBook);

    if (bookableSlots.length > 0) {
      const bookingUrl = `https://www.opentable.com/r/${slug}?covers=${partySize}&dateTime=${date}T${timeFrom || '19:00'}`;
      return {
        available: true,
        slots: bookableSlots.map(s => s.timeOffered),
        bookingUrl,
      };
    }

    return { available: false, reason: 'No bookable slots in time window' };

  } catch (err) {
    console.error('OpenTable check error:', err);
    return { available: false, reason: err.message };
  }
}