import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/claudehub/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/claudehub/api": {
        target: "http://localhost:7700",
        rewrite: (path) => path.replace(/^\/claudehub/, ""),
        ws: true,
      },
    },
  },
});
