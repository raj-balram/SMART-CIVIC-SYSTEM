import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API from "../utils/api";
import toast from "react-hot-toast";

/* ── Helpers ────────────────────────────────────────────────── */
const getInitials = (name = "") =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

/* ── Status badge ───────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending:     "bg-amber-50 text-amber-700 border border-amber-200",
    "In Progress": "bg-blue-50 text-blue-700 border border-blue-200",
    Resolved:    "bg-green-50 text-green-700 border border-green-200",
  };
  const dot = {
    Pending:     "bg-amber-500",
    "In Progress": "bg-blue-500",
    Resolved:    "bg-green-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? "bg-gray-400"}`} />
      {status}
    </span>
  );
};

/* ── Category badge ─────────────────────────────────────────── */
const CategoryBadge = ({ category }) => {
  const map = {
    Road:        "bg-orange-50 text-orange-700",
    Garbage:     "bg-lime-50 text-lime-700",
    Electricity: "bg-yellow-50 text-yellow-700",
    Water:       "bg-cyan-50 text-cyan-700",
    Other:       "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${map[category] ?? "bg-gray-100 text-gray-600"}`}>
      {category}
    </span>
  );
};

/* ── Stat card ──────────────────────────────────────────────── */
const StatCard = ({ label, value, color }) => (
  <div className="bg-white border border-[var(--color-border)] rounded-xl p-5 shadow-[var(--shadow-sm)]">
    <p className="text-[11px] font-medium text-[var(--color-text-3)] uppercase tracking-widest mb-2">{label}</p>
    <p className={`text-3xl font-semibold font-mono ${color}`}>{value}</p>
  </div>
);

/* ── Main component ─────────────────────────────────────────── */
const Profile = () => {
  const { user, login } = useAuth();

  const [complaints, setComplaints] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Edit name state
  const [editing, setEditing]   = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? "");
  const [saving, setSaving]     = useState(false);

  // Fetch user's complaints
  useEffect(() => {
    const fetchComplaints = async () => {
      try {
        const res = await API.get("/complaints");
        setComplaints(res.data);
      } catch {
        toast.error("Failed to load complaints");
      } finally {
        setLoadingData(false);
      }
    };
    fetchComplaints();
  }, []);

  // Derived stats
  const total      = complaints.length;
  const pending    = complaints.filter((c) => c.status === "Pending").length;
  const inProgress = complaints.filter((c) => c.status === "In Progress").length;
  const resolved   = complaints.filter((c) => c.status === "Resolved").length;

  // Save name
  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    try {
      setSaving(true);
      const res = await API.put("/auth/me", { name: nameInput.trim() });
      // Update context + localStorage
      const updatedUser = { ...user, name: res.data.name };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      login(updatedUser, localStorage.getItem("token"));
      toast.success("Name updated");
      setEditing(false);
    } catch {
      toast.error("Failed to update name");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setNameInput(user?.name ?? "");
    setEditing(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-1)]">My Profile</h1>
        <p className="text-sm text-[var(--color-text-3)] mt-1">
          Manage your account and view your complaint history
        </p>
      </div>

      {/* ── Profile card ── */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">

          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-[var(--color-navy)] flex items-center justify-center text-white text-xl font-semibold shrink-0 select-none">
            {getInitials(user?.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Name row */}
            {editing ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  className="px-3 py-1.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all w-52"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving}
                  className="px-3 py-1.5 bg-[var(--color-navy)] hover:bg-[var(--color-navy-hover)] text-white text-xs font-medium rounded-md transition-colors border-none cursor-pointer disabled:opacity-55"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1.5 bg-transparent border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] text-xs font-medium rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-[var(--color-text-1)]">{user?.name}</h2>
                <button
                  onClick={() => { setNameInput(user?.name ?? ""); setEditing(true); }}
                  className="p-1 rounded text-[var(--color-text-3)] hover:text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition-colors border-none bg-transparent cursor-pointer"
                  title="Edit name"
                >
                  {/* Pencil icon */}
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z"/>
                  </svg>
                </button>
              </div>
            )}

            <p className="text-sm text-[var(--color-text-3)]">{user?.email ?? "—"}</p>

            <div className="flex items-center gap-2 mt-3">
              {user?.role === "admin" ? (
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                  Admin
                </span>
              ) : (
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-surface-3)] text-[var(--color-text-2)] border border-[var(--color-border)]">
                  Citizen
                </span>
              )}
              <span className="text-[11px] text-[var(--color-text-3)]">
                Member since {user?.createdAt ? formatDate(user.createdAt) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total"       value={total}      color="text-[var(--color-text-1)]" />
        <StatCard label="Pending"     value={pending}    color="text-amber-600" />
        <StatCard label="In Progress" value={inProgress} color="text-blue-600" />
        <StatCard label="Resolved"    value={resolved}   color="text-green-600" />
      </div>

      {/* ── Complaint history ── */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Complaint history</h3>
          <span className="text-xs text-[var(--color-text-3)]">{total} total</span>
        </div>

        {loadingData ? (
          /* Loading skeleton */
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/3" />
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/5" />
                <div className="h-4 bg-[var(--color-surface-3)] rounded w-1/5" />
              </div>
            ))}
          </div>
        ) : complaints.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--color-surface-3)] flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="8.5"/><path d="M10 6v5M10 14h.01"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--color-text-2)]">No complaints yet</p>
            <p className="text-xs text-[var(--color-text-3)] mt-1">
              Submit your first complaint to see it here
            </p>
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-5 py-3">Title</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Category</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-[11px] font-semibold text-[var(--color-text-3)] uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c, i) => (
                  <tr
                    key={c._id}
                    className={`border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-2)] transition-colors ${i % 2 === 0 ? "" : "bg-[var(--color-surface-2)]/40"}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-[var(--color-text-1)] truncate max-w-[200px]">
                        {c.title}
                      </div>
                      {c.description && (
                        <div className="text-xs text-[var(--color-text-3)] truncate max-w-[200px] mt-0.5">
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <CategoryBadge category={c.category} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[var(--color-text-3)] hidden sm:table-cell whitespace-nowrap">
                      {formatDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default Profile;