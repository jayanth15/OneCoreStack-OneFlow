/**
 * Production server for the TanStack Start build.
 *
 * The Vite build emits a fetch-style SSR handler (dist/server/server.js) and
 * static client assets (dist/client). This tiny Node server:
 *   1. proxies /api/** to the backend (BACKEND_URL env)
 *   2. serves static files from dist/client when they exist
 *   3. forwards everything else to the SSR handler
 *
 * Usage:  npm run build && npm start
 * Env:    PORT (default 3000), BACKEND_URL (default http://localhost:8000)
 */
import { createServer } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"
import handler from "./dist/server/server.js"

const PORT = Number(process.env.PORT || 3000)
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "")
// Normalized (no trailing slash) so path-prefix checks below are reliable.
const CLIENT_DIR = normalize(fileURLToPath(new URL("./dist/client/", import.meta.url))).replace(/[\\/]+$/, "")

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname)
  // Strip the leading "/" — path.join() treats absolute segments specially.
  const relative = decoded.replace(/^\/+/, "")
  const candidate = normalize(join(CLIENT_DIR, relative))
  if (candidate !== CLIENT_DIR && !candidate.startsWith(CLIENT_DIR + sep)) {
    return null
  }
  try {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  } catch {
    /* ignore */
  }
  return null
}

function serveFile(res, filePath) {
  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": filePath.endsWith(".html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  })
  createReadStream(filePath).pipe(res)
}

async function proxyApi(req, res, url) {
  const target = new URL(url.pathname + url.search, BACKEND_URL)
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : req

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
        // Ask for identity encoding so we can stream the body as-is.
        "accept-encoding": "identity",
      },
      body,
      // @ts-expect-error - undici duplex option for streaming bodies
      duplex: body ? "half" : undefined,
      redirect: "manual",
    })

    const headers = {}
    for (const [key, value] of upstream.headers.entries()) {
      const lk = key.toLowerCase()
      // Node's fetch auto-decompresses gzip/deflate/br, so the body bytes
      // won't match the original content-length. Strip both and let Node
      // use chunked transfer encoding instead.
      if (lk === "transfer-encoding" || lk === "content-length" || lk === "content-encoding") continue
      headers[key] = value
    }
    const setCookies = upstream.headers.getSetCookie?.() ?? []
    res.writeHead(upstream.status, headers)
    if (setCookies.length > 0) {
      res.setHeader("Set-Cookie", setCookies)
    }

    if (upstream.body) {
      const reader = upstream.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
    }
    res.end()
  } catch {
    res.writeHead(502, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ detail: "Backend unreachable" }))
  }
}

function toWebRequest(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else headers.append(key, value)
  }
  // Stream the response uncompressed so we can relay it byte-for-byte.
  headers.set("accept-encoding", "identity")
  return new Request(url, {
    method: req.method,
    headers,
  })
}

async function handleSsr(req, res) {
  try {
    const webRequest = toWebRequest(req)
    const response = await handler.fetch(webRequest)
    const headers = {}
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === "transfer-encoding") continue
      headers[key] = value
    }
    res.writeHead(response.status, headers)
    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
    }
    res.end()
  } catch (err) {
    console.error("SSR handler error:", err)
    res.writeHead(500, { "Content-Type": "text/plain" })
    res.end("Internal server error")
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)

  if (url.pathname.startsWith("/api/")) {
    proxyApi(req, res, url).catch(() => res.end())
    return
  }

  const staticFile = safeStaticPath(url.pathname)
  if (staticFile) {
    serveFile(res, staticFile)
    return
  }

  handleSsr(req, res)
})

server.listen(PORT, () => {
  console.log(`OneFlow frontend listening on http://0.0.0.0:${PORT}`)
  console.log(`Proxying /api -> ${BACKEND_URL}`)
})
