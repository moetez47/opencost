import { useEffect, useRef, useState } from "react";
import { PersonOutlined, KeyboardArrowDown } from "@mui/icons-material";
import { useCurrentUser } from "~/components/current-user-context";

export default function ProfileMenu() {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex h-7 items-center gap-1.5 rounded border px-2 transition-colors"
        style={{
          background: "var(--cds-layer-02)",
          borderColor: "var(--cds-border-subtle)",
          color: "var(--cds-text-secondary)",
        }}
      >
        <PersonOutlined sx={{ fontSize: 15 }} />
        <span className="text-xs font-medium" style={{ color: "var(--cds-text-primary)" }}>
          {user.username}
        </span>
        <KeyboardArrowDown sx={{ fontSize: 14 }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-[1300] w-56 overflow-hidden rounded-lg border"
          style={{
            background: "var(--cds-layer)",
            borderColor: "var(--cds-border-subtle)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--cds-text-primary)" }}>
              {user.username}
            </p>
            <p className="truncate text-xs" style={{ color: "var(--cds-text-secondary)" }}>
              {user.email}
            </p>
            <span
              className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
              style={{ background: "var(--cds-layer-accent)", color: "var(--cds-text-secondary)" }}
            >
              {user.role}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}