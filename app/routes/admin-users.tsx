import { useEffect, useState } from "react";

interface UserRow {
  user_id: number;
  username: string;
  email: string;
  role: "admin" | "user";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", role: "user" as "user" | "admin" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setCreatedPassword(data.temporaryPassword);
      setForm({ username: "", email: "", role: "user" });
      await loadUsers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPassword.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetSubmitting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/users/${resetTarget.user_id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      closeResetModal();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setResetSubmitting(false);
    }
  }

  function closeResetModal() {
    setResetTarget(null);
    setNewPassword("");
    setConfirmPassword("");
    setResetError(null);
  }

  function closeCreateModal() {
    setShowCreate(false);
    setCreatedPassword(null);
    setFormError(null);
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold" style={{ color: "var(--cds-text-primary)" }}>Users</h1>
        <button type="button" onClick={() => setShowCreate(true)}
          className="rounded px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: "var(--cds-button-primary)" }}>
          Add user
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p style={{ color: "var(--cds-text-secondary)" }}>Loading…</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--cds-border-subtle)" }}>
              <th className="px-3 py-2 text-left" style={{ color: "var(--cds-text-secondary)" }}>Username</th>
              <th className="px-3 py-2 text-left" style={{ color: "var(--cds-text-secondary)" }}>Email</th>
              <th className="px-3 py-2 text-left" style={{ color: "var(--cds-text-secondary)" }}>Role</th>
              <th className="px-3 py-2 text-right" style={{ color: "var(--cds-text-secondary)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} style={{ borderBottom: "1px solid var(--cds-border-subtle)" }}>
                <td className="px-3 py-2" style={{ color: "var(--cds-text-primary)" }}>{u.username}</td>
                <td className="px-3 py-2" style={{ color: "var(--cds-text-primary)" }}>{u.email}</td>
                <td className="px-3 py-2" style={{ color: "var(--cds-text-primary)" }}>{u.role}</td>
                <td className="relative px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setMenuOpenFor(menuOpenFor === u.user_id ? null : u.user_id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border"
                    style={{
                      background: "var(--cds-layer)",
                      borderColor: "var(--cds-border-subtle)",
                      color: "var(--cds-text-secondary)",
                    }}
                    aria-label="More options"
                  >
                    ⋮
                  </button>
                  {menuOpenFor === u.user_id && (
                    <>
                      <div className="fixed inset-0 z-[1100]" onClick={() => setMenuOpenFor(null)} />
                      <div
                        className="absolute right-3 top-9 z-[1101] w-44 rounded border py-1 text-left text-sm shadow-lg"
                        style={{ background: "var(--cds-layer)", borderColor: "var(--cds-border-subtle)" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(u);
                            setMenuOpenFor(null);
                          }}
                          className="block w-full px-3 py-2 text-left hover:opacity-80"
                          style={{ color: "var(--cds-text-primary)" }}
                        >
                          Reset Password
                        </button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.4)" }} onClick={closeCreateModal}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-lg border p-5"
            style={{ background: "var(--cds-layer)", borderColor: "var(--cds-border-subtle)" }}>

            {createdPassword ? (
              <>
                <h2 className="mb-3 text-base font-semibold" style={{ color: "var(--cds-text-primary)" }}>User created</h2>
                <p className="mb-2 text-sm" style={{ color: "var(--cds-text-secondary)" }}>
                  Share this temporary password with the user — it won't be shown again:
                </p>
                <div className="mb-4 rounded border px-3 py-2 font-mono text-sm"
                  style={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)", color: "var(--cds-text-primary)" }}>
                  {createdPassword}
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={closeCreateModal}
                    className="rounded px-3 py-1.5 text-sm font-medium text-white"
                    style={{ background: "var(--cds-button-primary)" }}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreate}>
                <h2 className="mb-3 text-base font-semibold" style={{ color: "var(--cds-text-primary)" }}>Add user</h2>
                {formError && <p className="mb-2 text-sm text-red-500">{formError}</p>}
                <div className="mb-2">
                  <label className="mb-1 block text-xs" style={{ color: "var(--cds-text-secondary)" }}>Username</label>
                  <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)", color: "var(--cds-text-primary)" }} />
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-xs" style={{ color: "var(--cds-text-secondary)" }}>Email</label>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)", color: "var(--cds-text-primary)" }} />
                </div>
                <div className="mb-4">
                  <label className="mb-1 block text-xs" style={{ color: "var(--cds-text-secondary)" }}>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "user" | "admin" })}
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)", color: "var(--cds-text-primary)" }}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeCreateModal} className="rounded px-3 py-1.5 text-sm"
                    style={{ color: "var(--cds-text-secondary)" }}>Cancel</button>
                  <button type="submit" disabled={submitting} className="rounded px-3 py-1.5 text-sm font-medium text-white"
                    style={{ background: "var(--cds-button-primary)" }}>
                    {submitting ? "Creating…" : "Create"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {resetTarget && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.4)" }} onClick={closeResetModal}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-lg border p-5"
            style={{ background: "var(--cds-layer)", borderColor: "var(--cds-border-subtle)" }}>
            <form onSubmit={handleResetPassword}>
              <h2 className="mb-1 text-base font-semibold" style={{ color: "var(--cds-text-primary)" }}>
                Reset password
              </h2>
              <p className="mb-3 text-sm" style={{ color: "var(--cds-text-secondary)" }}>
                Set a new password for <strong>{resetTarget.username}</strong>.
              </p>
              {resetError && <p className="mb-2 text-sm text-red-500">{resetError}</p>}
              <div className="mb-2">
                <label className="mb-1 block text-xs" style={{ color: "var(--cds-text-secondary)" }}>New password</label>
                <input required type="password" minLength={8} value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)", color: "var(--cds-text-primary)" }} />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs" style={{ color: "var(--cds-text-secondary)" }}>Confirm password</label>
                <input required type="password" minLength={8} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)", color: "var(--cds-text-primary)" }} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeResetModal} className="rounded px-3 py-1.5 text-sm"
                  style={{ color: "var(--cds-text-secondary)" }}>Cancel</button>
                <button type="submit" disabled={resetSubmitting} className="rounded px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: "var(--cds-button-primary)" }}>
                  {resetSubmitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}