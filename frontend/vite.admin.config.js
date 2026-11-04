import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "shared-admin-entry",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/" || request.url?.startsWith("/r/")) request.url = "/admin.html";
        next();
      });
    },
  }],
  define: { "import.meta.env.VITE_SHARED_ADMIN": JSON.stringify("true") },
  build: { outDir: "dist-admin", rollupOptions: { input: "admin.html" } },
});
