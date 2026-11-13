import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const whereAmI = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(whereAmI, '..')
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'custom-services.json')
const DIST_DIR = process.env.DIST_DIR || path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8787)

type CustomService = {
  id: string
  name: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  createdAt: number
}

function ensureData(): CustomService[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveData(list: CustomService[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8')
}

let customServices: CustomService[] = ensureData()

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 2 * 1024 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function clampText(text: string, max = 4000) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

const ENV_PLACEHOLDER = /\{\{env:([A-Z0-9_]+)\}\}/g
const HAS_ENV_PLACEHOLDER = /\{\{env:[A-Z0-9_]+\}\}/

function hostOf(value: string): string {
  try { return new URL(value).hostname } catch { return '' }
}

function allowedHosts(): string[] {
  return (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * {{env:VAR}} yer tutucularını backend ortam değişkenlerinden çözer.
 * API anahtarları tarayıcıya hiç gitmez. Kötüye kullanımı önlemek için
 * env kullanılan isteklerde hedef host ALLOWED_HOSTS içinde olmalıdır.
 */
function resolveSecrets(payload: any) {
  const rawUrl = String(payload?.url || '')
  const method = String(payload?.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
  const rawHeaders: Record<string, unknown> =
    payload?.headers && typeof payload.headers === 'object' ? payload.headers : {}
  const rawBody = typeof payload?.body === 'string' ? payload.body : undefined

  const usesEnv = HAS_ENV_PLACEHOLDER.test(
    JSON.stringify([rawUrl, rawHeaders, rawBody ?? '']),
  )

  const resolve = (input: string) =>
    input.replace(ENV_PLACEHOLDER, (_, key: string) => {
      const value = process.env[key]
      if (!value) throw new Error(`eksik ortam değişkeni: ${key}`)
      return value
    })

  const url = resolve(rawUrl)
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).map(([k, v]) => [k, resolve(String(v))]),
  )
  const body = rawBody !== undefined ? resolve(rawBody) : undefined

  if (usesEnv) {
    const host = hostOf(url).toLowerCase()
    const allow = allowedHosts()
    if (!host || allow.length === 0 || !allow.includes(host)) {
      throw new Error(
        `env kullanımı için ALLOWED_HOSTS tanımlı olmalı (hedef: ${host || 'geçersiz'})`,
      )
    }
  }

  return { url, method, headers, body }
}

async function proxy(req: http.IncomingMessage, res: http.ServerResponse) {
  let payload: any
  try {
    payload = await readBody(req)
  } catch (e: any) {
    return sendJson(res, 400, { ok: false, status: 0, body: '', error: e.message })
  }

  let resolved: ReturnType<typeof resolveSecrets>
  try {
    resolved = resolveSecrets(payload)
  } catch (e: any) {
    return sendJson(res, 400, { ok: false, status: 0, body: '', error: e.message })
  }
  const { url, method, headers, body } = resolved
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return sendJson(res, 400, { ok: false, status: 0, body: '', error: 'geçersiz url' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const upstream = await fetch(url, {
      method: String(method).toUpperCase() === 'GET' ? 'GET' : 'POST',
      headers: typeof headers === 'object' && headers ? headers : {},
      body: String(method).toUpperCase() === 'GET' ? undefined : (body ?? undefined),
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = await upstream.text().catch(() => '')
    sendJson(res, 200, {
      ok: upstream.ok,
      status: upstream.status,
      body: clampText(text),
      error: upstream.ok ? undefined : `${upstream.status} ${upstream.statusText}`,
    })
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'zaman aşımı (15s)' : (e?.message || 'ağ hatası')
    sendJson(res, 200, { ok: false, status: 0, body: '', error: msg })
  } finally {
    clearTimeout(timer)
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function serveStatic(res: http.ServerResponse, pathname: string) {
  let rel = pathname === '/' ? '/index.html' : pathname
  rel = rel.split('?')[0]
  const filePath = path.join(DIST_DIR, rel)
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403)
    return res.end('forbidden')
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    return fs.createReadStream(filePath).pipe(res)
  }
  const indexPath = path.join(DIST_DIR, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    return fs.createReadStream(indexPath).pipe(res)
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Panel derlemesi bulunamadı. Önce `bun run build` çalıştırın.')
}

export function startServer(port = PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      return res.end()
    }

    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        customCount: customServices.length,
        uptime: Math.round(process.uptime()),
      })
    }

    if (pathname === '/api/services' && req.method === 'GET') {
      return sendJson(res, 200, { services: customServices })
    }

    if (pathname === '/api/services' && req.method === 'POST') {
      try {
        const body = await readBody(req)
        const name = String(body?.name || '').trim()
        const targetUrl = String(body?.url || '').trim()
        const method = String(body?.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST'
        if (!name || !targetUrl || !/^https?:\/\//i.test(targetUrl)) {
          return sendJson(res, 400, { error: 'ad ve geçerli url gerekli' })
        }
        if (customServices.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          return sendJson(res, 409, { error: 'bu isimde bir servis zaten var' })
        }
        const svc: CustomService = {
          id: randomUUID(),
          name,
          url: targetUrl,
          method,
          headers: body?.headers && typeof body.headers === 'object' ? body.headers : {},
          body: typeof body?.body === 'string' ? body.body : '',
          createdAt: Date.now(),
        }
        customServices = [...customServices, svc]
        saveData(customServices)
        return sendJson(res, 201, { service: svc, services: customServices })
      } catch (e: any) {
        return sendJson(res, 400, { error: e.message })
      }
    }

    const delMatch = pathname.match(/^\/api\/services\/([^/]+)$/)
    if (delMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(delMatch[1])
      const before = customServices.length
      customServices = customServices.filter((s) => s.id !== id)
      if (customServices.length === before) return sendJson(res, 404, { error: 'servis bulunamadı' })
      saveData(customServices)
      return sendJson(res, 200, { services: customServices })
    }

    if (pathname === '/api/proxy') {
      return proxy(req, res)
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'bulunamadı' })
    }

    return serveStatic(res, pathname)
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`[server] http://localhost:${port} üzerinde çalışıyor`)
  })
  return server
}

if (!process.env.ENOUGH_NO_AUTOSTART) startServer()
