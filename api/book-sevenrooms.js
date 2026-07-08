// Auto-booking for SevenRooms — hold + create a reservation.
//
// *** IMPORTANT: ENDPOINT URLS BELOW ARE UNVERIFIED ***
// Unlike the availability endpoint (api-yoa/availability/widget/range),
// which we confirmed works through live testing, these hold/create
// endpoints are inferred from third-party documentation of SevenRooms'
// guest-facing booking flow (access_persistent_id + shift_persistent_id
// go into a hold; a hold_duration_sec of ~300s; the hold_id then finalizes
// into a real reservation). The literal URLs and request/response shapes
// have NOT been confirmed against the live SevenRooms API.
//
// DRY_RUN defaults to true. In dry-run mode, this builds and logs exactly
// what it WOULD send, but never actually calls SevenRooms or creates a
// real reservation. Only flip DRY_RUN to false once a dry-run log has been
// manually reviewed and the request shape looks correct.

const DRY_RUN = process.env.SEVENROOMS_BOOKING_DRY_RUN !== 'false'; // dry-run unless explicitly disabled

async function holdReservation({ venueSlug, accessPersistentId, shiftPersistentId, partySize, date }) {
  const payload = {
    venue: venueSlug,
    access_persistent_id: accessPersistentId,
    shift_persistent_id: shiftPersistentId,
    party_size: partySize,
    date,
    channel: 'SEVENROOMS_WIDGET',
  };

  const url = 'https://www.sevenrooms.com/api-yoa/reservation/hold'; // UNVERIFIED

  if (DRY_RUN) {
    console.log('[DRY RUN] Would POST to', url, 'with payload:', JSON.stringify(payload));
    return { ok: true, dryRun: true, reservationHoldId: 'DRY_RUN_FAKE_HOLD_ID', holdDurationSec: 300 };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://www.sevenrooms.com/reservations/create/${venueSlug}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `Hold failed (HTTP ${res.status}): ${text.slice(0, 300)}` };
  }

  const data = await res.json();
  const reservationHoldId = data?.reservation_hold_id || data?.data?.reservation_hold_id;
  if (!reservationHoldId) {
    return { ok: false, reason: `Hold response missing reservation_hold_id: ${JSON.stringify(data).slice(0, 300)}` };
  }

  return { ok: true, reservationHoldId, holdDurationSec: data?.hold_duration_sec || 300 };
}

async function createReservation({ reservationHoldId, venueSlug, guestDetails, cardLast4 }) {
  const payload = {
    reservation_hold_id: reservationHoldId,
    venue: venueSlug,
    client: {
      first_name: guestDetails.firstName,
      last_name: guestDetails.lastName,
      email: guestDetails.email,
      phone_number: guestDetails.phone,
    },
    ...(cardLast4 ? { card_last4: cardLast4 } : {}),
  };

  const url = 'https://www.sevenrooms.com/api-yoa/reservation/create'; // UNVERIFIED

  if (DRY_RUN) {
    console.log('[DRY RUN] Would POST to', url, 'with payload:', JSON.stringify(payload));
    return { ok: true, dryRun: true, reservationId: 'DRY_RUN_FAKE_RESERVATION_ID' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `https://www.sevenrooms.com/reservations/create/${venueSlug}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `Create failed (HTTP ${res.status}): ${text.slice(0, 300)}` };
  }

  const data = await res.json();
  const reservationId = data?.reservation_id || data?.data?.reservation_id;
  if (!reservationId) {
    return { ok: false, reason: `Create response missing reservation_id: ${JSON.stringify(data).slice(0, 300)}` };
  }

  return { ok: true, reservationId };
}

// Full booking flow: hold, then immediately finalize. Requires the
// bookingFields captured from a live availability check (accessPersistentId,
// shiftPersistentId), plus the person's contact details saved on the watch.
export async function bookSevenRoomsReservation(watch, matchResult) {
  const { bookingFields, matchedDate } = matchResult;
  if (!bookingFields?.accessPersistentId || !bookingFields?.shiftPersistentId) {
    return { booked: false, reason: 'Missing slot identifiers needed to book — cannot proceed' };
  }
  if (!watch.guestFirstName || !watch.guestLastName || !watch.guestPhone) {
    return { booked: false, reason: 'Missing guest contact details — add name and phone before enabling auto-book' };
  }
  if (bookingFields.requiresCreditCard && !watch.cardLast4) {
    return { booked: false, reason: 'This slot requires a credit card on file, but no card_last4 is set on the watch' };
  }

  const holdResult = await holdReservation({
    venueSlug: bookingFields.venueSlug,
    accessPersistentId: bookingFields.accessPersistentId,
    shiftPersistentId: bookingFields.shiftPersistentId,
    partySize: watch.partySize,
    date: matchedDate,
  });

  if (!holdResult.ok) {
    return { booked: false, reason: `Hold step failed: ${holdResult.reason}` };
  }

  const createResult = await createReservation({
    reservationHoldId: holdResult.reservationHoldId,
    venueSlug: bookingFields.venueSlug,
    guestDetails: {
      firstName: watch.guestFirstName,
      lastName: watch.guestLastName,
      email: watch.email,
      phone: watch.guestPhone,
    },
    cardLast4: watch.cardLast4,
  });

  if (!createResult.ok) {
    return { booked: false, reason: `Create step failed: ${createResult.reason}` };
  }

  return {
    booked: true,
    dryRun: DRY_RUN,
    reservationId: createResult.reservationId,
  };
}
