import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ComplaintForm from "./pages/ComplaintForm";
import MapView from "./pages/MapView";
import AdminDashboard from "./pages/AdminDashboard";
import Profile from "./pages/Profile";
import Layout from "./components/Layout";

/* Combines auth guard + sidebar layout in one wrapper */
const ProtectedLayout = ({ children, adminOnly = false }) => {
  const { isAuth, user } = useAuth();
  if (!isAuth) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== "admin") return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
};

function App() {
  const { isAuth, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--color-surface-2)] gap-2.5 text-sm text-[var(--color-text-3)]">
        <svg
          className="w-5 h-5 animate-spin"
          viewBox="0 0 20 20"
          fill="none"
        >
          <circle cx="10" cy="10" r="8" stroke="#dde0e6" strokeWidth="2.5"/>
          <path d="M10 2a8 8 0 0 1 8 8" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        Loading...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={!isAuth ? <Login />    : <Navigate to="/" replace />} />
        <Route path="/register" element={!isAuth ? <Register /> : <Navigate to="/" replace />} />

        {/* Protected — all wrapped in sidebar Layout */}
        <Route path="/map"       element={<ProtectedLayout><MapView /></ProtectedLayout>} />
        <Route path="/complaint" element={<ProtectedLayout><ComplaintForm /></ProtectedLayout>} />
        <Route path="/profile"   element={<ProtectedLayout><Profile /></ProtectedLayout>} />
        <Route path="/admin"     element={<ProtectedLayout adminOnly><AdminDashboard /></ProtectedLayout>} />

        {/* Defaults */}
        <Route path="/"  element={<Navigate to={isAuth ? "/map" : "/login"} replace />} />
        <Route path="*"  element={
          <ProtectedLayout>
            <div className="text-center py-16 text-[var(--color-text-3)]">
              <p className="text-5xl font-mono font-light text-[var(--color-border-dark)] mb-3">404</p>
              <p className="text-sm">Page not found</p>
            </div>
          </ProtectedLayout>
        }/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;