import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexora",
    short_name: "Nexora",
    description: "Joyería, tecnología para el hogar y bienestar seleccionados con intención.",
    start_url: "/",
    display: "browser",
    background_color: "#0F0F0F",
    theme_color: "#0F0F0F",
    icons: [{ src: "/brand/nexora-logo.png", sizes: "1024x1024", type: "image/png" }],
  };
}
