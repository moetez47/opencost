import { useState } from "react";
import { useNavigate } from "react-router";

export function meta() {
  return [{ title: "Enclaive — Login" }];
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      window.location.href = "/dashboards";
    } catch (err) {
      setError("Network error — is the server running?");
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#f4f4f4",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "#fff",
        padding: "2.5rem",
        borderRadius: 8,
        width: 320,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Enclaive</h1>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: 4 }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: 4 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </div>
        {error && (
          <div style={{ color: "#da1e28", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 10,
            background: "#0f62fe",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}