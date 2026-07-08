// Real OpenTable availability checking via the clearpath/opentable-booker
// MCP server on Apify (pay-per-check, ~$0.03/check).
//
// Key finding from live debugging: the documented check_availability tool
// ignores its "time" parameter and always returns the same fixed batch of
// slots starting from opening time — useless for evening reservations.
// search_restaurants, however, correctly returns slots filtered near the
// requested time. So we use search_restaurants exclusively, even just to
// check one known restaurant, and skip check_availability entirely.

const MCP_BASE = 'https://clearpath--opentable-booker.apify.actor/mcp';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function midpointTime(timeFrom, timeTo) {
  const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
  const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
  const midMins = Math.round(((fromH * 60 + fromM) + (toH * 60 + toM)) / 2);
  const midH = Math.floor(midMins / 60).toString().padStart(2, '0');
  const midM = (midMins % 60).toString().padStart(2, '0');
  return `${midH}:${midM}`;
}

function windowToMinutes(timeFrom, timeTo) {
  const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
  const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
  return { fromMins: fromH * 60 + fromM, toMins: toH * 60 + toM };
}

// Minimal MCP client: handles the initialize handshake once per call chain,
// then sends tool call requests. Returns the parsed tool result content.
async function mcpCall(token, method, params, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${token}`,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(MCP_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });

  const newSessionId = res.headers.get('Mcp-Session-Id') || sessionId;
  const text = await res.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    const match = text.match(/data:\s*(\{.*\})/s);
    if (match) {
      try { body = JSON.parse(match[1]); } catch {}
    }
  }

  return { body, sessionId: newSessionId, httpStatus: res.status, raw: text };
}

async function initSession(token) {
  const { body, sessionId } = await mcpCall(token, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'carpe-cena', version: '1.0' },
  });
  if (!body || body.error) {
    throw new Error(`MCP init failed: ${body?.error?.message || 'unknown error'}`);
  }
  return sessionId;
}

async function callTool(token, sessionId, toolName, args) {
  const { body, httpStatus, raw } = await mcpCall(token, 'tools/call', {
    name: toolName,
    arguments: args,
  }, sessionId);

  if (!body) {
    throw new Error(`MCP tool call returned unparseable response (HTTP ${httpStatus}): ${raw.slice(0, 300)}`);
  }
  if (body.error) {
    throw new Error(`MCP tool "${toolName}" error: ${body.error.message}`);
  }

  const content = body.result?.content;
  if (!content || content.length === 0) return null;
  const textBlock = content.find(c => c.type === 'text');
  if (!textBlock) return null;

  try {
    return JSON.parse(textBlock.text);
  } catch {
    return textBlock.text;
  }
}

// Searches for the restaurant on a specific date, biased toward a preferred
// time — this single call gives us both the restaurant ID and its
// time-filtered slots for that date.
async function searchOneDate(token, sessionId, restaurant, city, date, timeFrom, timeTo, partySize) {
  const time = midpointTime(timeFrom, timeTo);

  const result = await callTool(token, sessionId, 'search_restaurants', {
    query: restaurant,
    city,
    date,
    time,
    party_size: partySize,
  });

  const list = Array.isArray(result) ? result : (result?.restaurants || result?.results || result?.result || []);
  if (!list || list.length === 0) return { id: null, slots: [] };

  const match = list[0];
  const id = match?.id || match?.restaurant_id || match?.rid || null;
  const slots = Array.isArray(match?.slots) ? match.slots : [];
  return { id, slots };
}

export async function checkOpenTableReal(watch) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { available: false, reason: 'APIFY_API_TOKEN not configured — real OpenTable checking is off' };
  }

  try {
    const { restaurant, city, date, partySize, timeFrom, timeTo, flexDays } = watch;
    const sessionId = await initSession(token);
    const { fromMins, toMins } = windowToMinutes(timeFrom, timeTo);
    const numDays = Math.max(1, parseInt(flexDays) || 1);

    let lastRestaurantId = null;

    for (let i = 0; i < numDays; i++) {
      const checkDate = i === 0 ? date : addDays(date, i);

      if (Array.isArray(watch.allowedWeekdays) && watch.allowedWeekdays.length < 7) {
        const dow = new Date(checkDate + 'T12:00:00').getDay();
        if (!watch.allowedWeekdays.includes(dow)) continue;
      }

      const { id, slots } = await searchOneDate(token, sessionId, restaurant, city, checkDate, timeFrom, timeTo, partySize);

      if (!id) {
        if (i === 0) return { available: false, reason: `Couldn't find "${restaurant}" on OpenTable via search` };
        continue;
      }
      lastRestaurantId = id;

      const inWindow = slots.filter(s => {
        const timeStr = s.time || s.startTime || '';
        const timePart = timeStr.includes('T') ? timeStr.split('T')[1] : timeStr;
        const m = timePart.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return false;
        const mins = parseInt(m[1]) * 60 + parseInt(m[2]);
        return mins >= fromMins && mins <= toMins;
      });

      if (inWindow.length > 0) {
        const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const times = inWindow.map(s => (s.time || '').split('T')[1]).join(', ');
        return {
          available: true,
          reason: numDays > 1
            ? `Found ${inWindow.length} slot(s) on ${dateLabel} (${times}) via live OpenTable check`
            : `Found ${inWindow.length} slot(s) (${times}) via live OpenTable check`,
          matchedDate: checkDate,
          bookingUrl: `https://www.opentable.com/booking/restref/availability?rid=${id}&partySize=${partySize}&dateTime=${checkDate}T${timeFrom || '19:00'}`,
          confirmedRestaurantId: id,
        };
      }
    }

    return {
      available: false,
      reason: numDays > 1
        ? `Checked ${numDays} days live on OpenTable — no slots in your time window on any of them`
        : 'Checked live on OpenTable — no slots in your time window',
      confirmedRestaurantId: lastRestaurantId,
    };

  } catch (err) {
    console.error('OpenTable MCP check error:', err.message);
    return { available: false, reason: `Live OpenTable check failed: ${err.message}` };
  }
}
