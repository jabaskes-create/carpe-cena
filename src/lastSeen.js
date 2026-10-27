// Copy this file into each app's src folder (e.g. src/lastSeen.js).
// Replace the URL below with your app-activity Vercel URL.
const PING_URL = 'https://app-activity.vercel.app/api/ping';

// Call once whenever a user is signed in. Pings at most every 6 hours per user.
export function reportLastSeen(user) {
  try {
    if (!user) return;
    const key = 'lastSeenPing_' + user.uid;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;
    user.getIdToken()
      .then((token) =>
        fetch(PING_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      )
      .then((r) => { if (r.ok) localStorage.setItem(key, String(Date.now())); })
      .catch(() => {});
  } catch (e) { /* never break the app over analytics */ }
}
