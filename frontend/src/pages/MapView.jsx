import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import API from "../utils/api";
import { useAuth } from "../context/AuthContext";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";

/* Fix Leaflet default icon */
import markerIcon   from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow });

/* ── Status config ──────────────────────────────────────────── */
const STATUS_CONFIG = {
  Pending:       { pill: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-500" },
  "In Progress": { pill: "bg-blue-50 text-blue-700 border border-blue-200",   dot: "bg-blue-500"  },
  Resolved:      { pill: "bg-green-50 text-green-700 border border-green-200", dot: "bg-green-500" },
};

/* ── Heatmap layer ──────────────────────────────────────────── */
const HeatmapLayer = ({ complaints }) => {
  const map = useMap();
  useEffect(() => {
    if (!complaints.length) return;
    const data = complaints
      .filter((c) => c.location?.lat && c.location?.lng)
      .map((c) => [Number(c.location.lat), Number(c.location.lng), 0.5]);
    if (!data.length) return;
    const layer = L.heatLayer(data, { radius: 25 }).addTo(map);
    return () => map.removeLayer(layer);
  }, [complaints, map]);
  return null;
};

/* ── Auto fit bounds ────────────────────────────────────────── */
const FitBounds = ({ complaints }) => {
  const map = useMap();
  useEffect(() => {
    const bounds = complaints
      .filter((c) => c.location?.lat && c.location?.lng)
      .map((c) => [Number(c.location.lat), Number(c.location.lng)]);
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
  }, [complaints, map]);
  return null;
};

/* ── Status badge (for Leaflet popup — plain HTML) ─────────── */
const StatusBadge = ({ status }) => {
  const c = STATUS_CONFIG[status] ?? { pill: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
};

/* ── Map View ───────────────────────────────────────────────── */
const MapView = () => {
  const { socket, user } = useAuth();
  const [complaints, setComplaints]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showHeat, setShowHeat]       = useState(true);
  const [filterStatus, setFilterStatus] = useState("All");

  const defaultCenter = [20.5937, 78.9629];

  /* Fetch */
  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const url = user.role === "admin" ? "/complaints/all" : "/complaints";
        const res = await API.get(url);
        setComplaints(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  /* Real-time */
  useEffect(() => {
    if (!socket) return;
    socket.on("newComplaint", (c) => setComplaints((p) => [c, ...p]));
    socket.on("statusUpdated", (c) => setComplaints((p) => p.map((x) => x._id === c._id ? c : x)));
    return () => { socket.off("newComplaint"); socket.off("statusUpdated"); };
  }, [socket]);

  /* Filtered list */
  const visible = filterStatus === "All"
    ? complaints
    : complaints.filter((c) => c.status === filterStatus);

  /* Stats */
  const total      = complaints.length;
  const pending    = complaints.filter((c) => c.status === "Pending").length;
  const inProgress = complaints.filter((c) => c.status === "In Progress").length;
  const resolved   = complaints.filter((c) => c.status === "Resolved").length;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-1)]">Complaint map</h1>
          <p className="text-sm text-[var(--color-text-3)] mt-1">
            {user?.role === "admin" ? "All complaints across the city" : "Your submitted complaints"}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-1)] bg-white outline-none focus:border-[var(--color-accent)] cursor-pointer"
          >
            <option value="All">All statuses</option>
            <option>Pending</option>
            <option>In Progress</option>
            <option>Resolved</option>
          </select>

          {/* Heatmap toggle */}
          <button
            onClick={() => setShowHeat((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer
              ${showHeat
                ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                : "bg-white text-[var(--color-text-2)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
              }`}
          >
            Heatmap {showHeat ? "on" : "off"}
          </button>
        </div>
      </div>

      {/* ── Quick stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",       value: total,      color: "text-[var(--color-text-1)]" },
          { label: "Pending",     value: pending,    color: "text-amber-600"             },
          { label: "In Progress", value: inProgress, color: "text-blue-600"              },
          { label: "Resolved",    value: resolved,   color: "text-green-600"             },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white border border-[var(--color-border)] rounded-xl px-4 py-3.5 shadow-[var(--shadow-sm)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-3)] mb-1.5">{label}</p>
            <p className={`text-2xl font-semibold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Map card ── */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] overflow-hidden">

        {/* Map header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M10 2C6.13 2 3 5.13 3 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z"/>
            </svg>
            <span className="text-xs font-medium text-[var(--color-text-2)]">
              Showing {visible.filter(c => c.location?.lat).length} pin{visible.filter(c => c.location?.lat).length !== 1 ? "s" : ""}
              {filterStatus !== "All" && ` · ${filterStatus}`}
            </span>
          </div>

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-4">
            {[
              { label: "Pending",     dot: "bg-amber-400" },
              { label: "In Progress", dot: "bg-blue-400"  },
              { label: "Resolved",    dot: "bg-green-400" },
            ].map(({ label, dot }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-[11px] text-[var(--color-text-3)]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Map container */}
        {loading ? (
          <div className="h-[60vh] flex items-center justify-center bg-[var(--color-surface-2)]">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-3)]">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="#dde0e6" strokeWidth="2.5"/>
                <path d="M10 2a8 8 0 0 1 8 8" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Loading map…
            </div>
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={5}
            style={{ height: "60vh", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {visible.length > 0 && <FitBounds complaints={visible} />}
            {showHeat && <HeatmapLayer complaints={visible} />}

            {visible.map((c) =>
              c.location?.lat && c.location?.lng ? (
                <Marker
                  key={c._id}
                  position={[Number(c.location.lat), Number(c.location.lng)]}
                >
                  <Popup maxWidth={240}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", padding: "4px 2px" }}>
                      <p style={{ fontWeight: 600, fontSize: "13px", color: "#0f1923", marginBottom: 4 }}>
                        {c.title}
                      </p>
                      <p style={{ fontSize: "12px", color: "#6b7a90", marginBottom: 8, lineHeight: 1.5 }}>
                        {c.description}
                      </p>

                      {/* Category + status row */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{
                          fontSize: "11px", fontWeight: 500,
                          background: "#f5f6f8", color: "#3d4a5c",
                          padding: "1px 7px", borderRadius: 4
                        }}>
                          {c.category}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>

                      {/* User (admin view) */}
                      {c.user?.name && (
                        <p style={{ fontSize: "11px", color: "#6b7a90" }}>
                          By {c.user.name}
                        </p>
                      )}

                      {/* Image */}
                      {c.image && (
                        <img
                          src={c.image}
                          alt=""
                          style={{
                            width: "100%", height: 90,
                            objectFit: "cover", borderRadius: 6,
                            marginTop: 8, border: "1px solid #dde0e6"
                          }}
                        />
                      )}
                    </div>
                  </Popup>
                </Marker>
              ) : null
            )}
          </MapContainer>
        )}

        {/* Empty state overlay */}
        {!loading && visible.filter(c => c.location?.lat).length === 0 && (
          <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center gap-2 text-sm text-[var(--color-text-3)]">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="10" cy="10" r="8.5"/><path d="M10 6v5M10 14h.01"/>
            </svg>
            No complaints to display
            {filterStatus !== "All" && (
              <button
                onClick={() => setFilterStatus("All")}
                className="text-[var(--color-accent)] hover:underline bg-transparent border-none cursor-pointer text-sm p-0"
              >
                — clear filter
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default MapView;