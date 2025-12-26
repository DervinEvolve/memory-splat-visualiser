// vite.config.js
import glsl from "vite-plugin-glsl"
import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [glsl(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      // Proxy Sharp API calls to your backend server
      // In production, deploy your own backend that handles Sharp API with your API key
      "/api/sharp": {
        target: process.env.SHARP_API_BACKEND || "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
