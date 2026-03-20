import { useState, useEffect } from "react";
import Map from "../components/Map";
import API from "../utils/api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = ["Road", "Garbage", "Electricity", "Water", "Other"];

const ComplaintForm = () => {
  const { socket } = useAuth();

  const [form, setForm] = useState({ title: "", description: "", category: "Road" });
  const [image, setImage]     = useState(null);
  const [preview, setPreview] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading]   = useState(false);

  /* Real-time: notify user when their complaint gets a status update */
  useEffect(() => {
    if (!socket) return;
    socket.on("newComplaint", (c) => {
      toast.success(`Complaint received: ${c.title}`);
    });
    return () => socket.off("newComplaint");
  }, [socket]);

  const handleImage = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or less");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImage(file);
  };

  const clearImage = () => {
    setImage(null);
    setPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    if (!location) {
      toast.error("Location not detected — please allow location access");
      return;
    }

    const formData = new FormData();
    formData.append("title",       form.title.trim());
    formData.append("description", form.description.trim());
    formData.append("category",    form.category);
    formData.append("lat",         location.lat);
    formData.append("lng",         location.lng);
    if (image) formData.append("image", image);

    try {
      setLoading(true);
      await API.post("/complaints", formData);
      toast.success("Complaint submitted successfully");
      setForm({ title: "", description: "", category: "Road" });
      setImage(null);
      setPreview(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-1)]">Submit a complaint</h1>
        <p className="text-sm text-[var(--color-text-3)] mt-1">
          Report a civic issue in your area — we'll notify the right department
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Main form card ── */}
        <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-6 space-y-5">

          <h2 className="text-sm font-semibold text-[var(--color-text-1)] pb-1 border-b border-[var(--color-border)]">
            Complaint details
          </h2>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-2)] mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white placeholder-[var(--color-text-3)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all"
              placeholder="e.g. Pothole on MG Road near main junction"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={100}
            />
            <p className="text-[11px] text-[var(--color-text-3)] mt-1 text-right">
              {form.title.length}/100
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-2)] mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-1)] bg-white placeholder-[var(--color-text-3)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15 transition-all resize-none"
              placeholder="Describe the issue in detail — location landmarks, severity, how long it's been present…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={500}
            />
            <p className="text-[11px] text-[var(--color-text-3)] mt-1 text-right">
              {form.description.length}/500
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-2)] mb-1.5">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm({ ...form, category: cat })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer
                    ${form.category === cat
                      ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                      : "bg-white text-[var(--color-text-2)] border-[var(--color-border)] hover:border-[var(--color-border-dark)] hover:bg-[var(--color-surface-2)]"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Image upload card ── */}
        <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-6">
          <h2 className="text-sm font-semibold text-[var(--color-text-1)] mb-4 pb-1 border-b border-[var(--color-border)]">
            Photo <span className="text-[var(--color-text-3)] font-normal">(optional)</span>
          </h2>

          {preview ? (
            /* Preview */
            <div className="relative">
              <img
                src={preview}
                alt="Preview"
                className="w-full h-48 object-cover rounded-lg border border-[var(--color-border)]"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white border border-[var(--color-border)] shadow-sm flex items-center justify-center text-[var(--color-text-3)] hover:text-[var(--color-danger)] hover:border-red-200 transition-colors cursor-pointer"
                title="Remove image"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1 1l10 10M11 1L1 11"/>
                </svg>
              </button>
              <p className="text-[11px] text-[var(--color-text-3)] mt-2 text-center">{image?.name}</p>
            </div>
          ) : (
            /* Drop zone */
            <label
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[var(--color-border)] rounded-lg py-10 px-4 cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]/30 transition-all group"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="w-10 h-10 rounded-full bg-[var(--color-surface-3)] flex items-center justify-center group-hover:bg-[var(--color-accent-light)] transition-colors">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 13l-3-3-3 3M10 10v7"/>
                  <path d="M16.88 14.39A5 5 0 0 0 15 5h-1.26A8 8 0 1 0 3 16.3"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--color-text-2)]">
                  Drop image here or <span className="text-[var(--color-accent)]">browse</span>
                </p>
                <p className="text-xs text-[var(--color-text-3)] mt-0.5">PNG, JPG up to 5 MB</p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImage(e.target.files[0])}
              />
            </label>
          )}
        </div>

        {/* ── Location card ── */}
        <div className="bg-white border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-sm)] p-6">
          <div className="flex items-center justify-between mb-4 pb-1 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-1)]">Your location</h2>
            {location ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Detected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Detecting…
              </span>
            )}
          </div>

          <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
            <Map setLocation={setLocation} />
          </div>

          {location && (
            <p className="text-[11px] text-[var(--color-text-3)] mt-2 font-mono">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </p>
          )}
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[var(--color-navy)] hover:bg-[var(--color-navy-hover)] disabled:opacity-55 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer border-none flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
                <path d="M10 2a8 8 0 0 1 8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              Submitting…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10l14-7-7 14V10H3z"/>
              </svg>
              Submit complaint
            </>
          )}
        </button>

      </form>
    </div>
  );
};

export default ComplaintForm;