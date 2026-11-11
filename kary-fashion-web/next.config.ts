import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Panel privado: cada página depende de la sesión, se renderiza en cada petición.
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
