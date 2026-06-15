import React, { useEffect } from "react";
import { useLocation } from "wouter";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("admin_token");

  useEffect(() => {
    if (!token) navigate("/admin/login");
  }, [token, navigate]);

  if (!token) return null;
  return <>{children}</>;
}
