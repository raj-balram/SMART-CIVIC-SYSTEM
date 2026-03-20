import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../utils/api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const Register = () => {
  const [form, setForm]           = useState({ name: "", email: "", password: "" });
  const [adminSecret, setSecret]  = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading]     = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      setLoading(true);
      const res = await API.post("/auth/register", { ...form, adminSecret });
      login(res.data, res.data.token);
      toast.success("Account created successfully");
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen font-[var(--font-sans)]">

      {/* ── Left panel (navy) ── */}
      <div className="hidden lg:flex lg:w-[420px] bg-[var(--color-navy)] flex-col justify-between p-10 shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="white">
              <path d="M10 2L2 7h2v9h4v-5h4v5h4V7h2L10 2z"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Civic Portal</p>
            <p className="text-white/40 text-[10px] uppercase tracking-wider">Smart City Management</p>
          </div>
        </div>

        {/* Tagline */}
        <div>
          <h1 className="text-white text-3xl font-semibold leading-tight mb-4">
            Your voice<br/>shapes the city.
          </h1>
          <p className="text-white/55 text-sm leading-relaxed max-w-xs">
            Register to report civic issues, track complaint progress, and see
            how your city improves in real time.
          </p>
        </div>

        {/* Steps */}
        <ol className="flex flex-col gap-4">
          {[
            ["01", "Create your account"],
            ["02", "Submit a complaint with location"],
            ["03", "Track resolution in real time"],
          ].map(([num, text]) => (
            <li key={num} className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-[var(--color-accent)] font-medium w-5 shrink-0">{num}</span>
              <span className="text-white/65 text-xs">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex items-center justify-center bg-[var(--color-surface-2)] p-6">
        <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-md)] w-full max-w-sm p-9">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-7 lg:hidden">
            <div className="w-8 h-8 rounded-md bg-[var(--color-navy)] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="white">
                <path d="M10 2L2 7h2v9h4v-5h4v5h4V7h2L10 2z"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-[var(--color-text-1)]">Civic Portal</span>
          </div>

          <h2 className="text-2xl font-semibold text-[var(--color-text-1)] mb-1">Create account</h2>
          <p className="text-sm text-[var(--color-text-3)] mb-7">Join the civic management platform</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-2)] mb-1.5">
                Full name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white placeholder-[var(--color-text-3)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all"
                placeholder="Your full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-2)] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white placeholder-[var(--color-text-3)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-2)] mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white placeholder-[var(--color-text-3)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </div>

            {/* Admin secret — hidden by default */}
            <div>
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-2)] transition-colors bg-transparent border-none cursor-pointer p-0 font-[inherit]"
              >
                {showSecret ? "▾" : "▸"} Admin registration (optional)
              </button>
              {showSecret && (
                <input
                  type="password"
                  className="mt-2 w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white placeholder-[var(--color-text-3)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all"
                  placeholder="Admin secret key"
                  value={adminSecret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full py-2.5 bg-[var(--color-navy)] hover:bg-[var(--color-navy-hover)] disabled:opacity-55 text-white text-sm font-medium rounded-md transition-colors cursor-pointer border-none"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--color-text-3)] mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-[var(--color-accent)] font-medium no-underline hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;