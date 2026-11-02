#!/usr/bin/env node
/**
 * 本地服务检查：Host/Origin 校验、路径穿越、请求体上限、DELETE 白名单。
 * 会自动起一个临时端口的 server.mjs，跑完关掉。
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const PORT = 5199
const HOST = `127.0.0.1:${PORT}`

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: repo,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
})

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: pathname,
        // 每个请求新建连接：413 会中断 socket，复用连接会拿到 ECONNRESET
        agent: false,
        headers: { host: HOST, connection: 'close', ...headers },
      },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
      },
    )
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await request('GET', '/api/list?dir=docs')
      if (r.status === 200) return
    } catch {
      /* 还没起来 */
    }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('server.mjs 没能在 5 秒内启动')
}

let failed = 0
const check = async (label, fn) => {
  try {
    await fn()
    console.log('PASS  ' + label)
  } catch (e) {
    failed += 1
    console.log('FAIL  ' + label + ' — ' + (e?.message ?? e))
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

try {
  await waitReady()

  await check('正常写入 / 读取', async () => {
    const put = await request('PUT', '/api/file?name=docs/__check.json', { body: '{"ok":1}' })
    expect(put.status === 200, `PUT 返回 ${put.status}`)
    const get = await request('GET', '/api/file?name=docs/__check.json')
    expect(get.status === 200 && get.body === '{"ok":1}', `GET 返回 ${get.status} ${get.body}`)
  })

  await check('路径穿越被拒（../escape.json）', async () => {
    const r = await request('PUT', '/api/file?name=..%2Fescape.json', { body: 'x' })
    expect(r.status === 400, `返回 ${r.status}`)
  })

  await check('非法字符文件名被拒', async () => {
    const r = await request('PUT', '/api/file?name=docs%2F..%2F..%2Fx.json', { body: 'x' })
    expect(r.status === 400, `返回 ${r.status}`)
  })

  await check('DELETE 白名单：docs/ 下允许', async () => {
    const r = await request('DELETE', '/api/file?name=docs/__check.json')
    expect(r.status === 200, `返回 ${r.status}`)
  })

  await check('DELETE 白名单：无关文件名被拒', async () => {
    const r = await request('DELETE', '/api/file?name=evil.txt')
    expect(r.status === 403, `返回 ${r.status}`)
  })

  await check('Host 不是本机时拒绝', async () => {
    const r = await request('GET', '/api/list?dir=docs', { headers: { host: 'evil.example' } })
    expect(r.status === 421, `返回 ${r.status}`)
  })

  await check('跨站 Origin 被拒', async () => {
    const r = await request('PUT', '/api/file?name=docs/__x.json', {
      headers: { origin: 'https://evil.example' },
      body: 'x',
    })
    expect(r.status === 403, `返回 ${r.status}`)
  })

  await check('请求体超限返回 413', async () => {
    const big = Buffer.alloc(33 * 1024 * 1024, 0x61)
    const r = await request('PUT', '/api/file?name=docs/__big.json', { body: big })
    expect(r.status === 413, `返回 ${r.status}`)
  })

  await check('静态资源路径穿越返回 404', async () => {
    const r = await request('GET', '/..%2F..%2Fserver.mjs')
    expect(r.status === 404, `返回 ${r.status}`)
  })

  await check('服务在异常请求后仍然存活', async () => {
    const r = await request('GET', '/api/list?dir=docs')
    expect(r.status === 200, `返回 ${r.status}`)
  })
} finally {
  server.kill()
}

if (failed) {
  console.log(`\n${failed} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
