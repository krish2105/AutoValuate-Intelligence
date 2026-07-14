"use client";
import { useEffect } from "react";

/** Registers the service worker so the on-device scanner keeps working offline. */
export function PWA() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // don't cache during dev
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => { /* non-fatal */ });
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
