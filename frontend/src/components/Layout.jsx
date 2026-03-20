import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* ── Inline SVG icons ─────────────────────────────────────── */
const IconMap = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4.5L7 2l6 3 6-2.5V15.5L13 18l-6-3-6 2.5V4.5z"/>
    <path d="M7 2v13M13 5v13"/>
  </svg>
);
const IconAlert = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="8.5"/><path d="M10 6v5M10 14h.01"/>
  </svg>
);
const IconUser = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="7" r="3.5"/><path d="M2.5 17c0-3.314 3.358-6 7.5-6s7.5 2.686 7.5 6"/>
  </svg>
);
const IconAdmin = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="16" height="13" rx="2"/><path d="M7 4V2.5M13 4V2.5M2 8h16"/>
  </svg>
);
const IconLogout = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3h4v14h-4M9 14l4-4-4-4M13 10H4"/>
  </svg>
);
const IconMenu = () => (
  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 5h14M3 10h14M3 15h14"/>
  </svg>
);
const IconClose = () => (
  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M5 5l10 10M15 5L5 15"/>
  </svg>
);

/* ── Avatar initials ──────────────────────────────────────── */
const getInitials = (name = "") =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/* ── Nav link item ────────────────────────────────────────── */
const SidebarLink = ({ to, icon, label, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-normal transition-all duration-150 no-underline
       ${isActive
         ? "bg-[var(--color-accent)] text-white font-medium"
         : "text-white/60 hover:bg-white/8 hover:text-white/90"
       }`
    }
  >
    {icon}
    {label}
  </NavLink>
);

/* ── Main Layout ──────────────────────────────────────────── */
const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { to: "/map",       label: "Map",             icon: <IconMap /> },
    { to: "/complaint", label: "Submit complaint", icon: <IconAlert /> },
    { to: "/profile",   label: "My profile",       icon: <IconUser /> },
    ...(user?.role === "admin"
      ? [{ to: "/admin", label: "Admin dashboard", icon: <IconAdmin /> }]
      : []),
  ];

  const currentPage = navItems.find((n) => n.to === location.pathname)?.label ?? "";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[99] lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-[240px] z-[100]
          bg-[var(--color-navy)] flex flex-col
          transition-transform duration-250
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-[18px] border-b border-white/8">
          <div className="w-8 h-8 rounded-md bg-[var(--color-accent)] flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
              <path d="M10 2L2 7h2v9h4v-5h4v5h4V7h2L10 2z"/>
            </svg>
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight">Civic Portal</div>
            <div className="text-white/40 text-[10px] uppercase tracking-wider font-normal">
              Smart City Management
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-widest px-2 pb-1.5 pt-1">
            Navigation
          </p>
          {navItems.map(({ to, label, icon }) => (
            <SidebarLink
              key={to}
              to={to}
              label={label}
              icon={icon}
              onClick={closeSidebar}
            />
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/8">
          <NavLink
            to="/profile"
            onClick={closeSidebar}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-white/6 transition-colors no-underline"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {getInitials(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/85 text-xs font-medium truncate">{user?.name}</div>
              <div className="text-white/40 text-[10px] capitalize">{user?.role}</div>
            </div>
          </NavLink>

          <button
            onClick={handleLogout}
            className="mt-1 w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-white/45 hover:bg-white/6 hover:text-white/70 text-xs transition-colors text-left cursor-pointer border-none bg-transparent font-[inherit]"
          >
            <IconLogout />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-[240px]">

        {/* Topbar */}
        <header className="h-14 bg-white border-b border-[var(--color-border)] flex items-center justify-between px-5 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="lg:hidden p-1.5 rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)] transition-colors border-none bg-transparent cursor-pointer"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <IconClose /> : <IconMenu />}
            </button>

            <span className="text-sm font-medium text-[var(--color-text-2)]">
              Smart Civic Management
              {currentPage && (
                <span className="text-[var(--color-text-3)] font-normal">
                  {" "}/ {currentPage}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === "admin" && (
              <span className="bg-purple-50 text-purple-700 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                Admin
              </span>
            )}
            <NavLink
              to="/profile"
              className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-xs font-semibold no-underline hover:opacity-90 transition-opacity"
              title={user?.name}
            >
              {getInitials(user?.name)}
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 md:p-7">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;