import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import registration from "./api/pendaftaran.js";
import admin from "./api/admin.js";

const apiRoutes = { "/api/pendaftaran": registration, "/api/admin": admin };

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    optimizeDeps: {
      include: ["jsqr"],
    },
    build: {
      rollupOptions: {
        input: {
          home: resolve("index.html"),
          registration: resolve("daftar/index.html"),
          dashboard: resolve("admin/index.html"),
        },
      },
    },
    plugins: [
      {
        name: "redial-api",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const protocol = server.config.server.https ? "https:" : "http:";
            const requestUrl = new URL(req.url, `${protocol}//localhost`);
            const loopback = /^127\.0\.0\.1(?::(\d+))?$/.exec(req.headers.host ?? "");
            // YouTube accepts this video's embed from localhost in local previews.
            if (
              loopback && req.method === "GET" &&
              (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") &&
              req.headers.accept?.includes("text/html")
            ) {
              requestUrl.hostname = "localhost";
              requestUrl.port = loopback[1] ?? "";
              res.writeHead(302, { Location: requestUrl.href });
              return res.end();
            }
            const handler = apiRoutes[requestUrl.pathname];
            if (!handler) return next();
            res.status = (status) => {
              res.statusCode = status;
              return res;
            };
            res.json = (value) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(value));
            };
            if (handler === registration) return await handler(req, res);
            const maxBytes = 4096;
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size <= maxBytes) chunks.push(chunk);
            }
            if (size > maxBytes) return res.status(413).json({ error: "Data terlalu besar." });
            try {
              req.body = size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
            } catch {
              return res
                .status(400)
                .json({ error: "Format data tidak valid." });
            }
            await handler(req, res);
          });
        },
      },
    ],
  };
});
