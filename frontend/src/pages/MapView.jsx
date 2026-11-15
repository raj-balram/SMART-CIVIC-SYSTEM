import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { useSearchParams } from "react-router-dom";
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

/* A complaint has { location: {lat, lng} }, a cluster has { lat, lng, count } */
const pointOf = (p) =>
  p.location ? [Number(p.location.lat), Number(p.location.lng)] : [Number(p.lat), Number(p.lng)];
const hasCoords = (p) => pointOf(p).every(Number.isFinite); // 0 is a valid coordinate

/* ── Heatmap layer ──────────────────────────────────────────── */
const HeatmapLayer = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const layer = L.heatLayer(points, { radius: 25, max: 1 }).addTo(map);
    return () => map.removeLayer(layer);
  }, [points, map]);
  return null;
};

/* ── Fit the map to the data, once ──────────────────────────── */
const FitOnce = ({ items, doneRef }) => {
  const map = useMap();
  useEffect(() => {
    if (doneRef.current || items.length === 0) return;
    doneRef.current = true;
    map.fitBounds(items.map(pointOf), { padding: [50, 50], maxZoom: 16 });
  }, [items, map, doneRef]);
  return null;
};

/* ── Tell the page which area is on screen (admin map) ──────── */
const ViewportReporter = ({ onChange }) => {
  const map = useMap();
  const report = useCallback(() => {
    const b = map.getBounds();
    onChange({
      west: Math.max(-180, b.getWest()),
      south: Math.max(-90, b.getSouth()),
      east: Math.min(180, b.getEast()),
      north: Math.min(90, b.getNorth()),
      zoom: Math.max(1, Math.round(map.getZoom())),
    });
  }, [map, onChange]);
  useMapEvents({ moveend: report });
  useEffect(() => { report(); }, [report]);
  return null;
};

/* ── A cluster of complaints: a numbered circle, red if any are overdue ── */
const clusterIcon = (c) => {
  const count = Number(c.count);
  const size = Math.min(54, 26 + Math.sqrt(count) * 4);
  const bg = c.overdue > 0 ? "#dc2626" : "#1e3a5f";
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px 'DM Sans',sans-serif;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)">${count}</div>`,
    className: "",
    iconSize: [size, size],
  });
};

const ClusterMarker = ({ cluster }) => {
  const map = useMap();
  const position = pointOf(cluster);
  return (
    <Marker
      position={position}
      icon={clusterIcon(cluster)}
      title={`${cluster.count} complaints (${cluster.overdue} overdue)`}
      eventHandlers={{ click: () => map.flyTo(position, Math.min(map.getZoom() + 2, 18)) }}
    />
  );
};

/* ── Status badge (for Leaflet popup) ───────────────────────── */
const StatusBadge = ({ status }) => {
  const c = STATUS_CONFIG[status] ?? { pill: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
};

/* ── Popup for one complaint ────────────────────────────────── */
const ComplaintPopup = ({ c }) => (
  <div style={{ fontFamily: "'DM Sans', sans-serif", padding: "4px 2px" }}>
    <p style={{ fontWeight: 600, fontSize: "13px", color: "#0f1923", marginBottom: 4 }}>{c.title}</p>
    <p style={{ fontSize: "12px", color: "#6b7a90", marginBottom: 8, lineHeight: 1.5 }}>{c.description}</p>

    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      <span style={{ fontSize: "11px", fontWeight: 500, background: "#f5f6f8", color: "#3d4a5c", padding: "1px 7px", borderRadius: 4 }}>
        {c.category}
      </span>
      <StatusBadge status={c.status} />
    </div>

    {c.user?.name && <p style={{ fontSize: "11px", color: "#6b7a90" }}>By {c.user.name}</p>}

    {c.dueAt && c.status !== "Resolved" && (
      <p style={{ fontSize: "11px", color: "#6b7a90", margin: "6px 0 0" }}>
        🎯 Target: resolve by {new Date(c.dueAt).toLocaleDateString()}
      </p>
    )}
    {c.supportCount > 0 && (
      <p style={{ fontSize: "11px", color: "#6b7a90", margin: "6px 0 0" }}>
        👥 {c.supportCount} {c.supportCount === 1 ? "person supports" : "people support"} this
      </p>
    )}

    {Array.isArray(c.statusHistory) && c.statusHistory.length > 0 && (
      <div style={{ marginTop: 8, borderTop: "1px solid #eef0f3", paddingTop: 6 }}>
        {c.statusHistory.slice(-3).reverse().map((h, i) => (
          <p key={i} style={{ fontSize: "11px", color: "#6b7a90", margin: "2px 0", lineHeight: 1.4 }}>
            <strong>{h.status}</strong> · {new Date(h.at).toLocaleDateString()}
            {h.note ? `: ${h.note}` : ""}
          </p>
        ))}
      </div>
    )}

    {c.image && (
      <img
        src={c.image}
        alt=""
        style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginTop: 8, border: "1px solid #dde0e6" }}
      />
    )}
  </div>
);

/* ── Map View ───────────────────────────────────────────────── */
const MapView = () => {
  const { socket, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchParams] = useSearchParams();

  // the dashboard can link to a spot: /map?lat=..&lng=..&zoom=..
  const startView = useMemo(() => {
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const zoom = Number(searchParams.get("zoom"));
    if (searchParams.get("lat") === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { center: [lat, lng], zoom: Number.isFinite(zoom) ? Math.min(Math.max(zoom, 3), 18) : 15 };
  }, [searchParams]);

  const [mapData, setMapData] = useState({ mode: "points", total: 0, items: [] });
  const [adminStats, setAdminStats] = useState(null);
  const [view, setView] = useState(null); // the area currently on screen (admin)
  const [loading, setLoading] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [filterStatus, setFilterStatus] = useState("All");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const latest = useRef(0);
  const fitted = useRef(Boolean(startView)); // a link to a spot skips the automatic fit

  const defaultCenter = [20.5937, 78.9629];
  const handleViewport = useCallback((v) => setView(v), []);

  /* Citizens: their own complaints, loaded once */
  useEffect(() => {
    if (!user || isAdmin) return;
    API.get("/complaints")
      .then((res) => setMapData({ mode: "points", total: res.data.length, items: res.data }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user, isAdmin]);

  /* Admins: the totals, and then only what is on screen */
  const fetchAdminStats = useCallback(
    () => API.get("/complaints/stats").then((r) => setAdminStats(r.data)).catch(() => {}),
    []
  );
  useEffect(() => { if (isAdmin) fetchAdminStats(); }, [isAdmin, fetchAdminStats]);

  useEffect(() => {
    if (!isAdmin || !view) return;
    const id = ++latest.current; // lets us ignore a slow response that arrives after a newer one
    const timer = setTimeout(async () => {
      try {
        const params = { ...view };
        if (filterStatus !== "All") params.status = filterStatus;
        if (overdueOnly) params.overdue = "true";
        const res = await API.get("/complaints/map", { params });
        if (id === latest.current) setMapData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [isAdmin, view, filterStatus, overdueOnly, refreshTick]);

  /* Real-time */
  useEffect(() => {
    if (!socket || !user) return;

    if (isAdmin) {
      const refresh = () => {
        setRefreshTick((n) => n + 1);
        fetchAdminStats();
      };
      const events = ["complaint:created", "complaint:updated", "complaint:supported", "complaint:overdue"];
      events.forEach((e) => socket.on(e, refresh));
      return () => events.forEach((e) => socket.off(e, refresh));
    }

    const onCreated = (c) =>
      setMapData((d) => (d.items.some((x) => x._id === c._id) ? d : { ...d, total: d.total + 1, items: [c, ...d.items] }));
    const onUpdated = (c) =>
      setMapData((d) => ({ ...d, items: d.items.map((x) => (x._id === c._id ? c : x)) }));
    socket.on("complaint:created", onCreated);
    socket.on("complaint:updated", onUpdated);
    return () => {
      socket.off("complaint:created", onCreated);
      socket.off("complaint:updated", onUpdated);
    };
  }, [socket, user, isAdmin, fetchAdminStats]);

  /* What to draw */
  const visible = useMemo(() => {
    const list = mapData.items.filter(hasCoords);
    if (isAdmin) return list; // the server already applied the filters
    return filterStatus === "All" ? list : list.filter((c) => c.status === filterStatus);
  }, [mapData.items, isAdmin, filterStatus]);

  const heatPoints = useMemo(
    () => visible.map((p) => [...pointOf(p), mapData.mode === "clusters" ? Math.min(1, p.count / 25) : 0.5]),
    [visible, mapData.mode]
  );

  const counts = isAdmin
    ? {
        total: adminStats?.total ?? 0,
        pending: adminStats?.pending ?? 0,
        inProgress: adminStats?.inProgress ?? 0,
        resolved: adminStats?.resolved ?? 0,
      }
    : {
        total: mapData.items.length,
        pending: mapData.items.filter((c) => c.status === "Pending").length,
        inProgress: mapData.items.filter((c) => c.status === "In Progress").length,
        resolved: mapData.items.filter((c) => c.status === "Resolved").length,
      };

  const summary =
    mapData.mode === "clusters"
      ? `${mapData.total} complaints in view, grouped into ${visible.length} clusters. Zoom in to see each one.`
      : `Showing ${visible.length} pin${visible.length !== 1 ? "s" : ""}${filterStatus !== "All" ? ` · ${filterStatus}` : ""}`;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-1)]">Complaint map</h1>
          <p className="text-sm text-[var(--color-text-3)] mt-1">
            {isAdmin ? "All complaints across the city" : "Your submitted complaints"}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
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

          {isAdmin && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-2)] cursor-pointer select-none">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
          )}

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
          { label: "Total",       value: counts.total,      color: "text-[var(--color-text-1)]" },
          { label: "Pending",     value: counts.pending,    color: "text-amber-600"             },
          { label: "In Progress", value: counts.inProgress, color: "text-blue-600"              },
          { label: "Resolved",    value: counts.resolved,   color: "text-green-600"             },
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

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)]">
          <span className="text-xs font-medium text-[var(--color-text-2)]">{summary}</span>

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

        <div className="relative">
          <MapContainer
            center={startView?.center ?? defaultCenter}
            zoom={startView?.zoom ?? 5}
            style={{ height: "60vh", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {isAdmin && <ViewportReporter onChange={handleViewport} />}
            <FitOnce items={visible} doneRef={fitted} />
            {showHeat && <HeatmapLayer points={heatPoints} />}

            {mapData.mode === "clusters"
              ? visible.map((c, i) => <ClusterMarker key={`${c.lat},${c.lng},${i}`} cluster={c} />)
              : visible.map((c) => (
                  <Marker key={c._id} position={pointOf(c)}>
                    <Popup maxWidth={240}>
                      <ComplaintPopup c={c} />
                    </Popup>
                  </Marker>
                ))}
          </MapContainer>

          {loading && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 text-sm text-[var(--color-text-3)]">
              Loading map…
            </div>
          )}
        </div>

        {!loading && visible.length === 0 && (
          <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center gap-2 text-sm text-[var(--color-text-3)]">
            No complaints to display here
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