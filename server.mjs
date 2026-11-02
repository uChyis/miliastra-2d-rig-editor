import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, 'dist')
const dataDir = path.join(root, 'data')
const port = Number(process.env.PORT || 5178)

/** 请求体上限：正常工程远小于这个值，超过一律拒绝，避免被灌满磁盘 */
const MAX_BODY = 32 * 1024 * 1024

/** 允许删除的顶层文件名（docs/ 下的文件另外放行） */
const DELETABLE_ROOT_FILES = new Set([
  'workspace.json',
  'settings.json',
  'clipboard.json',
  'rig.autosave.json',
  'rig.history.json',
])

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

/** 归一化成 `docs/x.json` 形式；含非法字符或越级则返回 null */
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

const distRoot = path.resolve(dist)
const insideDist = target => {
  const resolved = path.resolve(target)
  return resolved === distRoot || resolved.startsWith(distRoot + path.sep)
}

/** 只接受本机来源：防止别的网页 / DNS 重绑定把 Host 指过来 */
const HOSTS = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])
function hostAllowed(req) {
  return HOSTS().has(String(req.headers.host || ''))
}

/** 同源检查：带 Origin 时必须与 Host 一致 */
function originAllowed(req) {
  const origin = req.headers.origin
  if (!origin) return true
  const host = String(req.headers.host || '')
  return origin === 'http://' + host || origin === 'https://' + host
}

const guard = (req, res) => {
  if (!hostAllowed(req)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' }).end('bad host')
    return false
  }
  if (!originAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('forbidden')
    return false
  }
  return true
}

/** 读取请求体；超过上限直接拒绝 */
function readBody(req, res) {
  return new Promise(resolve => {
    const chunks = []
    let size = 0
    let aborted = false
    req.on('data', chunk => {
      if (aborted) return
      size += chunk.length
      if (size > MAX_BODY) {
        aborted = true
        res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' }).end('payload too large')
        req.destroy()
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks))
    })
    req.on('error', () => {
      if (!aborted) resolve(null)
    })
  })
}

function decodeParam(value) {
  try {
    return decodeURIComponent(String(value ?? ''))
  } catch {
    return null
  }
}

async function handleFile(req, res, url) {
  const rawName = decodeParam(url.searchParams.get('name'))
  if (rawName === null) {
    res.writeHead(400).end('bad name')
    return
  }
  const name = safeName(rawName)
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
    const body = await readBody(req, res)
    if (body === null) return
    fs.writeFileSync(target, body)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}')
    return
  }

  if (req.method === 'DELETE') {
    // 只允许删工具自己管理的文件，避免一条请求毁掉别的东西
    const top = name.includes('/') ? name.split('/')[0] : name
    const deletable = name.startsWith('docs/') || DELETABLE_ROOT_FILES.has(top)
    if (!deletable) {
      res.writeHead(403).end('forbidden')
      return
    }
    if (fs.existsSync(target)) fs.rmSync(target, { force: true })
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}')
    return
  }

  res.writeHead(405).end('method not allowed')
}

function handleList(req, res, url) {
  const rawDir = decodeParam(url.searchParams.get('dir') || '')
  if (rawDir === null || rawDir === '') {
    res.writeHead(400).end('bad dir')
    return
  }
  const dir = safeName(rawDir)
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
}

function handleStatic(req, res, url) {
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end('bad path')
    return
  }
  if (rel === '/') rel = '/index.html'
  const file = path.join(dist, rel)
  if (!insideDist(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    // 页面与资源都不缓存，避免改了代码刷新看不到
    'Cache-Control': 'no-store, must-revalidate',
  })
  res.end(fs.readFileSync(file))
}

const server = http.createServer(async (req, res) => {
  try {
    if (!guard(req, res)) return
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    if (url.pathname === '/api/file') {
      await handleFile(req, res, url)
      return
    }
    if (url.pathname === '/api/list') {
      handleList(req, res, url)
      return
    }
    handleStatic(req, res, url)
  } catch (err) {
    // 单个请求出错不能带走整个服务
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('server error')
    console.error('[server] 请求处理失败：', err)
  }
})

server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})

process.on('uncaughtException', err => {
  console.error('[server] 未捕获异常（服务继续运行）：', err)
})
process.on('unhandledRejection', err => {
  console.error('[server] 未处理的 Promise 拒绝（服务继续运行）：', err)
})

server.listen(port, '127.0.0.1', () => {
  console.log('Miliastra 2D Rig Editor -> http://127.0.0.1:' + port + '/')
  console.log('数据目录: ' + dataDir)
})
