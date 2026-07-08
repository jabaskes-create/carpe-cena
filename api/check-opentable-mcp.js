// Real OpenTable availability checking via the clearpath/opentable-booker
// MCP server on Apify (pay-per-check, ~$0.05/check).
// This talks MCP protocol (JSON-RPC over HTTP) directly — no SDK, since we
// just need two tool calls: search_restaurants and check_availability.

const MCP_BASE = 'https://clearpath--opentable-booker.apify.actor/mcp';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
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
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const newSessionId = res.headers.get('Mcp-Session-Id') || sessionId;
  const text = await res.text();

  // Response may be plain JSON or SSE-formatted ("data: {...}")
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

  console.log(`OpenTable MCP callTool(${toolName}) httpStatus=${httpStatus} body=`, JSON.stringify(body).slice(0, 1000));

  if (!body) {
    throw new Error(`MCP tool call returned unparseable response (HTTP ${httpStatus}): ${raw.slice(0, 300)}`);
  }
  if (body.error) {
    throw new Error(`MCP tool "${toolName}" error: ${body.error.message}`);
  }

  // Tool results come back as content blocks; usually one text block with JSON or plain text
  const content = body.result?.content;
  if (!content || content.length === 0) {
    return null;
  }
  const textBlock = content.find(c => c.type === 'text');
  if (!textBlock) return null;

  try {
    return JSON.parse(textBlock.text);
  } catch {
    return textBlock.text; // fall back to raw text if not JSON
  }
}

async function findRestaurantId(token, sessionId, restaurant, city) {
  const result = await callTool(token, sessionId, 'search_restaurants', {
    query: restaurant,
    city: city,
  });

  console.log('OpenTable MCP search_restaurants raw result:', JSON.stringify(result).slice(0, 1500));

  // Expecting an array of restaurant objects with an id/name; be defensive about shape
  const list = Array.isArray(result) ? result : (result?.restaurants || result?.results || []);
  if (!list || list.length === 0) return null;

  const match = list[0];
  const id = match?.id || match?.restaurant_id || match?.rid || null;
  console.log('OpenTable MCP resolved restaurant match:', JSON.stringify(match), 'id used:', id);
  return id;
}

async function checkOneDate(token, sessionId, restaurantId, date, partySize, timeFrom, timeTo) {
  // The API appears to cap results (~10 slots) starting from the earliest
  // time of day, so evening slots can be cut off entirely unless we tell it
  // which time we actually want. Pass the midpoint of the window as a hint.
  const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
  const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
  const midMins = Math.round(((fromH * 60 + fromM) + (toH * 60 + toM)) / 2);
  const midH = Math.floor(midMins / 60).toString().padStart(2, '0');
  const midM = (midMins % 60).toString().padStart(2, '0');
  const preferredTime = `${midH}:${midM}`;

  const result = await callTool(token, sessionId, 'check_availability', {
    restaurant: String(restaurantId),
    date,
    party_size: partySize,
    time: preferredTime,
  });

  console.log('OpenTable MCP check_availability raw result:', JSON.stringify(result).slice(0, 6000));

  // Expecting something like { slots: [{ time: "19:00", ... }, ...] }
  const slots = result?.slots || result?.times || (Array.isArray(result) ? result : []);
  return Array.isArray(slots) ? slots : [];
}

export async function checkOpenTableReal(watch) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { available: false, reason: 'APIFY_API_TOKEN not configured — real OpenTable checking is off' };
  }

  try {
    const { restaurant, city, date, partySize, timeFrom, timeTo, flexDays, openTableRestaurantId } = watch;

    const sessionId = await initSession(token);

    // One-time diagnostic: list the actual tool schemas so we stop guessing
    // parameter names. This is a free MCP protocol call, not a billed event.
    const toolsList = await mcpCall(token, 'tools/list', {}, sessionId);
    console.log('OpenTable MCP tools/list:', JSON.stringify(toolsList.body).slice(0, 4000));

    let restaurantId = openTableRestaurantId;
    if (!restaurantId) {
      restaurantId = await findRestaurantId(token, sessionId, restaurant, city);
      if (!restaurantId) {
        return { available: false, reason: `Couldn't find "${restaurant}" on OpenTable via search` };
      }
    }

    const [fromH, fromM] = (timeFrom || '17:00').split(':').map(Number);
    const [toH, toM] = (timeTo || '22:00').split(':').map(Number);
    const fromMins = fromH * 60 + fromM;
    const toMins = toH * 60 + toM;

    const numDays = Math.max(1, parseInt(flexDays) || 1);

    for (let i = 0; i < numDays; i++) {
      const checkDate = i === 0 ? date : addDays(date, i);
      const slots = await checkOneDate(token, sessionId, restaurantId, checkDate, partySize, timeFrom, timeTo);

      const inWindow = slots.filter(s => {
        const timeStr = s.time || s.startTime || '';
        // OpenTable returns full ISO datetimes like "2026-07-14T11:00" —
        // pull just the time-of-day portion after "T"
        const timePart = timeStr.includes('T') ? timeStr.split('T')[1] : timeStr;
        const m = timePart.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return false;
        const mins = parseInt(m[1]) * 60 + parseInt(m[2]);
        return mins >= fromMins && mins <= toMins;
      });

      if (inWindow.length > 0) {
        const dateLabel = new Date(checkDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return {
          available: true,
          reason: numDays > 1
            ? `Found ${inWindow.length} slot(s) on ${dateLabel} via live OpenTable check`
            : `Found ${inWindow.length} slot(s) via live OpenTable check`,
          matchedDate: checkDate,
          bookingUrl: `https://www.opentable.com/booking/restref/availability?rid=${restaurantId}&partySize=${partySize}&dateTime=${checkDate}T${timeFrom || '19:00'}`,
          confirmedRestaurantId: restaurantId,
        };
      }
    }

    return {
      available: false,
      reason: numDays > 1
        ? `Checked ${numDays} days live on OpenTable — no slots in your time window on any of them`
        : 'Checked live on OpenTable — no slots in your time window',
      confirmedRestaurantId: restaurantId,
    };

  } catch (err) {
    console.error('OpenTable MCP check error:', err.message);
    return { available: false, reason: `Live OpenTable check failed: ${err.message}` };
  }
}
