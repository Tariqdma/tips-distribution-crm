// Entry point for Hostinger Node.js hosting
// Hostinger requires this file as the app entry point
import("./dist/index.js").catch((err) => {
  console.error("Failed to start Tips CRM server:", err);
  process.exit(1);
});
