import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  build: {
    target: "es2015",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    react(),
    legacy({
      targets: ["Chrome >= 30", "Android >= 4.4"],
      modernPolyfills: false,
      renderLegacyChunks: true,
    }),
  ],
});
