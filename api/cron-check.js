import { useState } from "react";
import Icon from "./Icon";
import { groupByDate, formatDateFull } from "../utils";

const segmentEmoji = (type) => {
  const map = { flight: "✈️", hotel: "🏨", restaurant: "🍽", activity: "⭐", train: "🚆", car: "🚗" };
  return map[type] || "📍";
};

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const [, mo, d] = dateStr.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[mo - 1]} ${d}`;
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const [, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m1 - 1]} ${d1} — ${months[m2 - 1]} ${d2}, ${y2}`;
}

function buildItineraryText(trip, segments, selectedIds) {
  const selected = segments.filter(s => selectedIds.has(s.id));
  const grouped = groupByDate(selected);

  let text = `${trip.name}\n`;
  if (trip.startDate && trip.endDate) {
    text += `${formatDateRange(trip.startDate, trip.endDate)}\n`;
  }
  text += `${"─".repeat(40)}\n\n`;

  for (const [date, segs] of grouped) {
    text += `${formatDateFull(date)}\n\n`;
    for (const seg of segs) {
      const isHotel = seg.type === "hotel";

      text += `${segmentEmoji(seg.type)} ${seg.title}`;

      if (isHotel) {
        // Hotels: show check-in/check-out dates inline, skip raw time
        const checkIn = formatDateShort(seg.date);
        const checkOut = seg.checkoutDate ? formatDateShort(seg.checkoutDate) : null;
        if (checkOut) text += ` · ${checkIn} – ${checkOut}`;
      } else if (seg.time) {
        text += ` · ${formatTime(seg.time)}`;
      }
      text += "\n";

      if (seg.address) text += `   📍 ${seg.address}\n`;
      if (seg.detail) text += `   ${seg.detail}\n`;
      if (seg.confirmation) text += `   🔖 Confirmation: ${seg.confirmation}\n`;
      if (seg.phone) text += `   📞 ${seg.phone}\n`;
      // URLs omitted — tracking links are too noisy for a human-readable export
      text += "\n";
    }
  }

  text += `${"─".repeat(40)}\n`;
  text += `Organized with Gulliver Travels · gullivertravels.app`;
  return text;
}

export default function ExportModal({ trip, segments, onClose }) {
  const [selectedIds, setSelectedIds] = useState(new Set(segments.map(s => s.id)));
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const toggleAll = () => {
    if (selectedIds.size === segments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(segments.map(s => s.id)));
    }
  };

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = () => {
    const text = buildItineraryText(trip, segments, selectedIds);
    navigator.clipboard?.writeText(text);
    showToast("Copied to clipboard!");
  };

  const handleDownload = () => {
    const text = buildItineraryText(trip, segments, selectedIds);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trip.name.replace(/\s+/g, "-")}-itinerary.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded!");
  };

  const handleEmail = async () => {
    if (!email) return;
    setSending(true);
    try {
      const text = buildItineraryText(trip, segments, selectedIds);
      const response = await fetch("/api/send-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          tripName: trip.name,
          itinerary: text,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(`Sent to ${email}!`);
        setEmail("");
      } else {
        showToast(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch (e) {
      showToast(`Error: ${e.message}`);
    }
    setSending(false);
  };

  const grouped = groupByDate(segments);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Export itinerary</div>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        {/* Select all toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--ink-light)" }}>
            {selectedIds.size} of {segments.length} selected
          </div>
          <button className="seg-btn" onClick={toggleAll} style={{ fontSize: 11 }}>
            {selectedIds.size === segments.length ? "Deselect all" : "Select all"}
          </button>
        </div>

        {/* Segment checklist */}
        <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 16, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
          {grouped.map(([date, segs]) => (
            <div key={date}>
              <div style={{ padding: "6px 12px", background: "var(--paper-warm)", fontSize: 11, fontWeight: 500, color: "var(--ink-light)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {formatDateFull(date)}
              </div>
              {segs.map(seg => (
                <div
                  key={seg.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => toggleOne(seg.id)}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 3, border: "1.5px solid var(--border)",
                    background: selectedIds.has(seg.id) ? "var(--ink)" : "white",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                  }}>
                    {selectedIds.has(seg.id) && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ fontSize: 14 }}>{segmentEmoji(seg.type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{seg.title}</div>
                    {seg.time && <div style={{ fontSize: 11, color: "var(--ink-light)" }}>{seg.time}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Export actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className="seg-btn" onClick={handleCopy} style={{ flex: 1, justifyContent: "center" }}>
            📋 Copy
          </button>
          <button className="seg-btn" onClick={handleDownload} style={{ flex: 1, justifyContent: "center" }}>
            ⬇️ Download
          </button>
        </div>

        {/* Email */}
        <div className="form-group">
          <label className="form-label">Email itinerary</label>
          <div className="share-row">
            <input
              className="form-input"
              placeholder="recipient@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmail()}
              style={{ flex: 1 }}
            />
            <button className="seg-btn primary" onClick={handleEmail} disabled={!email || sending}>
              {sending ? "..." : "Send"}
            </button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}