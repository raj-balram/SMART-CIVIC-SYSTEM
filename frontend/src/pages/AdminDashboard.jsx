import { useCallback, useEffect, useRef, useState } from "react";
import API from "../utils/api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

/* ── Helpers ────────────────────────────────────────────────── */
const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

const getInitials = (name = "") =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const formatHours = (h) => (h < 48 ? `${h} hours` : `${(h / 24).toFixed(1)} days`);

/* ── Status config ──────────────────────────────────────────── */
const STATUS_CONFIG = {
  Pending:      { pill: "bg-amber-50 text-amber-700 border border-amber-200",    dot: "bg-amber-500"  },
  "In Progress":{ pill: "bg-blue-50  text-blue-700  border border-blue-200",     dot: "bg-blue-500"   },
  Resolved:     { pill: "bg-green-50 text-green-700 border border-green-200",    dot: "bg-green-500"  },
};

const CATEGORY_COLORS = {
  Road:        { bar: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
  Garbage:     { bar: "bg-lime-500",   text: "text-lime-700",   bg: "bg-lime-50"   },
  Electricity: { bar: "bg-yellow-400", text: "text-yellow-700", bg: "bg-yellow-50" },
  Water:       { bar: "bg-cyan-500",   text: "text-cyan-700",   bg: "bg-cyan-50"   },
  Other:       { bar: "bg-gray-400",   text: "text-gray-600",   bg: "bg-gray-100"  },
};

/* ── Sub-components ─────────────────────────────────────────── */

const StatusBadge = ({ status }) => {
  const c = STATUS_CONFIG[status] ?? { pill: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${c.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
};

const CategoryBadge = ({ category }) => {
  const c = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${c.bg} ${c.text}`}>
      {category}
    </span>
  );
};

/* Stat card */
const StatCard = ({ label, value, accent, icon, live = false }) => (
  <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 shadow-[var(--shadow-sm)] flex items-start justify-between gap-3">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-3)] mb-2">
        {label}
        {live && (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-green-600 normal-case tracking-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            live
          </span>
        )}
      </p>
      <p className={`text-3xl font-semibold font-mono ${accent}`}>{value}</p>
    </div>
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent.replace("text-", "bg-").replace("-600", "-100").replace("-700","100")}`}>
      {icon}
    </div>
  </div>
);

/* Category bar chart */
const CategoryChart = ({ data, total }) => {
  if (!data?.length) return null;
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text-1)] mb-4">Complaints by category</h3>
      <div className="flex flex-col gap-3">
        {data.map(({ _id: cat, count }) => {
          const pct = total ? Math.round((count / total) * 100) : 0;
          const c   = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other;
          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${c.text}`}>{cat}</span>
                <span className="text-xs text-[var(--color-text-3)] font-mono">{count} <span className="text-[var(--color-text-3)]/60">({pct}%)</span></span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.bar} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* 30-day trend: reported vs resolved per day */
const TrendChart = ({ trend = [] }) => {
  if (trend.length === 0) return null;
  const max = Math.max(1, ...trend.flatMap((d) => [d.created, d.resolved]));
  const W = 600, H = 120, pad = 4;
  const slot = W / trend.length;
  const bar = (slot - pad) / 2;

  return (
    <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Last 30 days</h3>
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-3)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Reported</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" /> Resolved</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28" role="img"
           aria-label="Complaints reported and resolved per day">
        {trend.map((d, i) => {
          const x = i * slot + pad / 2;
          const hc = (d.created / max) * (H - 4);
          const hr = (d.resolved / max) * (H - 4);
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${d.created} reported, ${d.resolved} resolved`}</title>
              <rect x={x} y={H - hc} width={bar} height={hc} rx="1" className="fill-blue-500" />
              <rect x={x + bar} y={H - hr} width={bar} height={hr} rx="1" className="fill-green-500" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};


/* Status action buttons: only the moves the server will accept */
const NEXT_STATUSES = {
  Pending: ["In Progress"],
  "In Progress": ["Pending", "Resolved"],
  Resolved: ["In Progress"],
};
const ACTION_STYLES = {
  Pending: "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200",
  "In Progress": "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200",
  Resolved: "bg-green-50 hover:bg-green-100 text-green-700 border border-green-200",
};

const StatusActions = ({ id, current, onUpdate }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    {(NEXT_STATUSES[current] ?? []).map((label) => (
      <button
        key={label}
        onClick={() => onUpdate(id, label)}
        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border-none ${ACTION_STYLES[label]}`}
      >
        → {label}
      </button>
    ))}
  </div>
);

const PAGE_SIZE = 20;

const AdminDashboard = () => {
  const { socket } = useAuth();

  const [complaints, setComplaints] = useState([]); // the CURRENT PAGE only
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({
    total: 0, pending: 0, inProgress: 0, resolved: 0, categoryCounts: [], avgResolutionHours: null, trend: [],
  });
  const [loading, setLoading] = useState(true);
  const [newCount, setNewCount] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCat, setFilterCat] = useState("All");
  const [sortBy, setSortBy] = useState("newest");

  // wait until the admin stops typing before asking the server
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // changing a filter always goes back to page 1
  const pick = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilterStatus("All");
    setFilterCat("All");
    setPage(1);
  };

  /* Fetch one page */
  const latest = useRef(0); // lets us ignore a slow response that arrives after a newer one
  const fetchList = useCallback(async () => {
    const id = ++latest.current;
    try {
      const params = { page, limit: PAGE_SIZE, sort: sortBy };
      if (filterStatus !== "All") params.status = filterStatus;
      if (filterCat !== "All") params.category = filterCat;
      if (debouncedSearch.length >= 2) params.q = debouncedSearch;

      const res = await API.get("/complaints/list", { params });
      if (id !== latest.current) return;
      setComplaints(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      if (id === latest.current) toast.error(err.response?.data?.message || "Failed to load complaints");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, sortBy, filterStatus, filterCat, debouncedSearch]);

  const fetchStats = useCallback(async () => {
    try {
      setStats((await API.get("/complaints/stats")).data);
    } catch {
      toast.error("Failed to load statistics");
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  /* Real-time: refresh the page and the numbers; debounced so a burst causes one refresh */
  const refreshTimer = useRef(null);
  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      fetchList();
      fetchStats();
    }, 400);
  }, [fetchList, fetchStats]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  useEffect(() => {
    if (!socket) return;
    const onCreated = (c) => {
      setNewCount((n) => n + 1);
      toast.success(`New complaint: ${c.title}`);
      refreshSoon();
    };
    const onChanged = () => refreshSoon();

    socket.on("complaint:created", onCreated);
    socket.on("complaint:updated", onChanged);
    socket.on("complaint:supported", onChanged);
    return () => {
      socket.off("complaint:created", onCreated);
      socket.off("complaint:updated", onChanged);
      socket.off("complaint:supported", onChanged);
    };
  }, [socket, refreshSoon]);

  /* Update status (the note prompt becomes a proper dialog in the polish phase) */
  const updateStatus = async (id, status) => {
    const note = window.prompt(`Move to "${status}". Add a short note for the citizen (optional):`, "");
    if (note === null) return; // cancelled
    try {
      await API.put(`/complaints/${id}/status`, { status, note: note.trim().slice(0, 200) });
      toast.success("Status updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
    fetchList();
    fetchStats();
  };

  const filtered = complaints; // the server already filtered, sorted and paged it

  /* ── Render ── */
  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-1)]">Admin Dashboard</h1>
          <p className="text-sm text-[var(--color-text-3)] mt-1">
            Monitor and manage all civic complaints
          </p>
        </div>
        {newCount > 0 && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs font-medium px-3 py-2 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {newCount} new complaint{newCount > 1 ? "s" : ""} since you opened this page
            <button
              onClick={() => setNewCount(0)}
              className="ml-1 text-green-500 hover:text-green-700 bg-transparent border-none cursor-pointer text-sm leading-none"
            >×</button>
          </div>
        )}
      </div>

      {/* ── Stat cards — 4 columns ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          accent="text-[var(--color-text-1)]"
          live
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#6b7a90" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4.5L7 2l6 3 6-2.5V15.5L13 18l-6-3-6 2.5V4.5z"/>
            </svg>
          }
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          accent="text-amber-600"
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="8.5"/><path d="M10 6v4l3 2"/>
            </svg>
          }
        />
        <StatCard
          label="In Progress"
          value={stats.inProgress}
          accent="text-blue-600"
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10a6 6 0 1 1 12 0"/><path d="M10 4V2M16 6l1.5-1.5"/>
            </svg>
          }
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          accent="text-green-600"
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="8.5"/><path d="M6.5 10l2.5 2.5 4.5-4.5"/>
            </svg>
          }
        />
      </div>

      {/* ── Charts + quick info row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category bar chart — takes 2 cols */}
        <div className="lg:col-span-2">
          <CategoryChart data={stats.categoryCounts} total={stats.total} />
        </div>

        {/* Resolution rate card */}
        <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-5 flex flex-col justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-1)] mb-4">Resolution rate</h3>
          {stats.total > 0 ? (
            <>
              {/* Big number */}
              <div className="flex-1 flex flex-col items-center justify-center py-4">
                <p className="text-5xl font-semibold font-mono text-green-600">
                  {Math.round((stats.resolved / stats.total) * 100)}
                  <span className="text-2xl text-[var(--color-text-3)]">%</span>
                </p>
                <p className="text-xs text-[var(--color-text-3)] mt-2">of all complaints resolved</p>
                                {stats.avgResolutionHours != null && (
                  <p className="text-[11px] text-[var(--color-text-3)] mt-1">
                    Average resolution time: {formatHours(stats.avgResolutionHours)}
                  </p>
                )}
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[11px] text-[var(--color-text-3)] mb-1.5">
                  <span>{stats.resolved} resolved</span>
                  <span>{stats.total - stats.resolved} remaining</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-700"
                    style={{ width: `${Math.round((stats.resolved / stats.total) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-3)] text-center py-6">No data yet</p>
          )}
        </div>
      </div>

      <TrendChart trend={stats.trend} />

      {/* ── Complaints table ── */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)]">

        {/* Table header + filters */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text-1)]">All complaints</h3>
            <p className="text-xs text-[var(--color-text-3)] mt-0.5">{total} match</p>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-3)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="6.5" cy="6.5" r="5"/><path d="M10.5 10.5l3.5 3.5"/>
            </svg>
            <input
              type="text"
              placeholder="Search whole words in title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-1)] bg-white outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all w-44"
            />
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={pick(setFilterStatus)}
            className="px-2.5 py-1.5 border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-1)] bg-white outline-none focus:border-[var(--color-accent)] cursor-pointer"
          >
            <option value="All">All statuses</option>
            <option>Pending</option>
            <option>In Progress</option>
            <option>Resolved</option>
          </select>

          {/* Category filter */}
          <select
            value={filterCat}
            onChange={pick(setFilterCat)}
            className="px-2.5 py-1.5 border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-1)] bg-white outline-none focus:border-[var(--color-accent)] cursor-pointer"
          >
            <option value="All">All categories</option>
            <option>Road</option>
            <option>Garbage</option>
            <option>Electricity</option>
            <option>Water</option>
            <option>Other</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={pick(setSortBy)}
            className="px-2.5 py-1.5 border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-1)] bg-white outline-none focus:border-[var(--color-accent)] cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="status">By status</option>
            <option value="support">Most supported</option>
          </select>
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/4" />
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/6" />
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/6" />
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--color-surface-3)] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="5"/><path d="M10.5 10.5l3.5 3.5"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--color-text-2)]">No complaints found</p>
            <p className="text-xs text-[var(--color-text-3)] mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-5 py-3">Complaint</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Submitted by</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Category</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Supporters</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3 hidden md:table-cell">Date</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c._id}
                    className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    {/* Title + description */}
                    <td className="px-5 py-3.5 max-w-[220px]">
                      <div className="flex items-start gap-2">
                        {c.image && (
                          <img
                            src={c.image}
                            alt=""
                            className="w-8 h-8 rounded object-cover shrink-0 border border-[var(--color-border)]"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--color-text-1)] truncate">{c.title}</p>
                          <p className="text-xs text-[var(--color-text-3)] truncate mt-0.5">{c.description}</p>
                        </div>
                      </div>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[var(--color-navy)] flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                          {getInitials(c.user?.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[var(--color-text-1)] truncate">{c.user?.name}</p>
                          <p className="text-[11px] text-[var(--color-text-3)] truncate">{c.user?.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5">
                      <CategoryBadge category={c.category} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    
                    {/* Supporters */}
                    <td className="px-4 py-3.5 text-xs font-mono text-[var(--color-text-2)]">
                      {c.supportCount ?? 0}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3.5 text-xs text-[var(--color-text-3)] whitespace-nowrap hidden md:table-cell">
                      {formatDate(c.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <StatusActions
                        id={c._id}
                        current={c.status}
                        onUpdate={updateStatus}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer + pager */}
        {!loading && total > 0 && (
          <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-[var(--color-text-3)]">
              Page {page} of {totalPages} · {total} complaint{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              {(search || filterStatus !== "All" || filterCat !== "All") && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-[var(--color-accent)] hover:underline bg-transparent border-none cursor-pointer"
                >
                  Clear filters
                </button>
              )}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs rounded-md border border-[var(--color-border)] bg-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-xs rounded-md border border-[var(--color-border)] bg-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;