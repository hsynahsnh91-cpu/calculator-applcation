import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function offlineNotices(): { path: string; text: string }[] {
  const result: { path: string; text: string }[] = [];
  const collect = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) collect(filename);
      else if (item.isFile())
        result.push({
          path: path.relative(__dirname, filename).replace(/\\/g, "/"),
          text: fs.readFileSync(filename, "utf8"),
        });
    }
  };
  collect(path.join(__dirname, "licenses"));
  result.push({
    path: "THIRD_PARTY_NOTICES.md",
    text: fs.readFileSync(path.join(__dirname, "THIRD_PARTY_NOTICES.md"), "utf8"),
  });
  return result.sort((first, second) => first.path.localeCompare(second.path));
}

/**
 * Production ships cacheable chunks. `npm run build:offline` deliberately
 * opts into a self-contained file for file:// and classroom USB use instead.
 */
export default defineConfig(({ mode }) => {
  const offlineSingleFile =
    mode === "offline" || process.env.CALCULATOR_SINGLE_FILE === "1";
  const offlineLicensePlugin: Plugin = {
    name: "offline-license-notices",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "application/json", id: "offline-license-notices" },
          children: JSON.stringify(offlineNotices()).replace(/</g, "\\u003c"),
          injectTo: "body",
        },
      ];
    },
  };
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (offlineSingleFile) {
    plugins.push({
      name: "inline-solver-worker-offline",
      enforce: "pre",
      transform(code, id) {
        if (!id.replace(/\\/g, "/").endsWith("/src/core/solver/client.ts"))
          return null;
        return code.replace(
          "solver.worker?worker",
          "solver.worker?worker&inline",
        );
      },
    });
  }

  if (offlineSingleFile) {
    plugins.push(offlineLicensePlugin);
    const standalonePlugin: Plugin = {
      name: "standalone-script-source",
      apply: "build",
      enforce: "post",
      generateBundle(_options, bundle) {
        // MathLive identifies inline scripts by this debug label under file://.
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === "chunk")
            chunk.code += "\n//# sourceURL=calculator-inline.js\n";
        }
      },
    };
    plugins.push(standalonePlugin, viteSingleFile());
  }

  return {
    plugins,
    build: {
      rollupOptions: offlineSingleFile
        ? undefined
        : {
            output: {
              manualChunks(id) {
                if (
                  id.includes("node_modules/react-dom") ||
                  id.includes("node_modules/react/")
                ) {
                  return "react";
                }
                if (id.includes("node_modules/katex")) return "katex";
                // mathjs and nerdamer stay with the worker / engine chunks.
              },
            },
          },
    },
    worker: offlineSingleFile
      ? { format: "iife", rollupOptions: { output: { inlineDynamicImports: true } } }
      : { format: "es" },
    server: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
    preview: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  };
});
