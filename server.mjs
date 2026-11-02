import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, 'dist')
const dataDir = path.join(root, 'data')
const port = Number(process.env.PORT || 5178)

fs.mkdirSync(dataDir, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const safeName = name => {
  const raw = String(name || '')
  const parts = raw.split('/')
  if (parts.length === 0 || parts.length > 2) return null
  for (const p of parts) {
    if (!p || p === '.' || p === '..') return null
    if (!/^[\w.\-]+$/.test(p)) return null
  }
  return parts.join('/')
}

const dataRoot = path.resolve(dataDir)
const insideData = target => {
  const resolved = path.resolve(target)
  return resolved === dataRoot || resolved.startsWith(dataRoot + path.sep)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/api/file') {
    const origin = req.headers.origin
    if (origin) {
      const host = req.headers.host || ''
      const okOrigin = origin === 'http://' + host || origin === 'https://' + host
      if (!okOrigin) {
        res.writeHead(403).end('forbidden')
        return
      }
    }
    const name = safeName(url.searchParams.get('name'))
    if (!name) {
      res.writeHead(400).end('bad name')
      return
    }
    const target = path.join(dataDir, name)
    if (!insideData(target)) {
      res.writeHead(403).end('forbidden')
      return
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })

    if (req.method === 'GET') {
      if (!fs.existsSync(target)) {
        res.writeHead(404).end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(fs.readFileSync(target))
      return
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      fs.writeFileSync(target, Buffer.concat(chunks))
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}')
      return
    }

    if (req.method === 'DELETE') {
      if (fs.existsSync(target)) fs.rmSync(target, { force: true })
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}')
      return
    }

    res.writeHead(405).end('method not allowed')
    return
  }

  if (url.pathname === '/api/list') {
    const origin = req.headers.origin
    if (origin) {
      const host = req.headers.host || ''
      if (origin !== 'http://' + host && origin !== 'https://' + host) {
        res.writeHead(403).end('forbidden')
        return
      }
    }
    const dir = safeName(url.searchParams.get('dir') || '')
    if (!dir) {
      res.writeHead(400).end('bad dir')
      return
    }
    const target = path.join(dataDir, dir)
    if (!insideData(target) || !fs.existsSync(target)) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('[]')
      return
    }
    const names = fs
      .readdirSync(target, { withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => e.name)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(names))
    return
  }

  // 静态文件
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/') rel = '/index.html'
  const file = path.join(dist, rel)
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    // 页面与资源都不缓存，避免改了代码刷新看不到
    'Cache-Control': 'no-store, must-revalidate',
  })
  res.end(fs.readFileSync(file))
})

server.listen(port, '127.0.0.1', () => {
  console.log('Miliastra 2D Rig Editor -> http://127.0.0.1:' + port + '/')
  console.log('数据目录: ' + dataDir)
})

