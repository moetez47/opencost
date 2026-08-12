import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return setError("This reset link is missing a token.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f4f4f4" }}>
      <div style={{ width: 380, background: "white", borderRadius: 12, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
        <h1 style={{ fontSize: 22, marginBottom: 20 }}>Reset password</h1>
        {done ? (
          <p>Your password has been reset. Redirecting to login…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p style={{ color: "#da1e28", marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: 10, marginBottom: 14, border: "1px solid #ccc", borderRadius: 4 }} required />
            <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              style={{ width: "100%", padding: 10, marginBottom: 20, border: "1px solid #ccc", borderRadius: 4 }} required />
            <button type="submit" disabled={submitting}
              style={{ width: "100%", padding: 12, background: "#0f62fe", color: "white", border: "none", borderRadius: 4, fontWeight: 600 }}>
              {submitting ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}