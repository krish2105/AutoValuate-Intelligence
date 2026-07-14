import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AutoValuate Intelligence",
    short_name: "AutoValuate",
    description:
      "Explainable, damage-aware car valuation for the UAE. The damage detector runs on your device — your photos never leave it.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1620",
    theme_color: "#0f1620",
    orientation: "portrait-primary",
    categories: ["finance", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
