import { useEffect, useState } from "react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");

  useEffect(() => {
    if (window.location.pathname === "/login") {
      setStatus("authed");
      return;
    }
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setStatus("authed");
        } else {
          setStatus("guest");
          window.location.href = "/login";
        }
      })
      .catch(() => {
        setStatus("guest");
        window.location.href = "/login";
      });
  }, []);

  if (status === "checking") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        Loading...
      </div>
    );
  }

  if (status === "guest") {
    return null;
  }

  return <>{children}</>;
}
