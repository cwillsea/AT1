import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist do a dynamic import of pdf.worker.mjs at runtime.
  // Bundling them through Turbopack rewrites that path and breaks the worker
  // setup ("Cannot find module .../[project]/.../pdf.worker.mjs"). Marking
  // them external lets Node load them straight from node_modules so the
  // dynamic worker import resolves normally.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
