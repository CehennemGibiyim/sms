import { useEffect, useMemo, useRef, useState } from 'react'
import servicesData from './data/services.json'
import type { ServiceInfo, ServiceStatus, LogEntry, CustomService, ProxyResult } from './types'
import type { ServiceDefinition } from './services/definition'
import { buildCtx, toRequest } from './services/definition'
import { serviceRegistry } from './services/providers'

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '').replace(/\/$/, '')

const builtin = servicesData as Record<string, ServiceInfo>
const builtinNames = Object.keys(builtin)

type MergedService = ServiceInfo & { name: string; custom: boolean; registry?: boolean; definition?: ServiceDefinition }

const emptyForm = {
  name: '',
  url: '',
  method: 'POST' as 'GET' | 'POST',
  headers: '{\n  "Content-Type": "application/json"\n}',
  body: '{\n  "phone": "{{phone}}"\n}',
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('tr-TR', { hour12: false })
}

function domainOf(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

function fillTemplate(text: string, phone: string, mail: string) {
  return text
    .replace(/\{\{\s*phone\s*\}\}/g, phone)
    .replace(/\{\{\s*mail\s*\}\}/g, mail || `${Math.random().toString(36).slice(2, 12)}@gmail.com`)
    .replace(/\{self\.phone\}/g, phone)
    .replace(/\{self\.mail\}/g, mail || `${Math.random().toString(36).slice(2, 12)}@gmail.com`)
}

export default function App() {
  const [custom, setCustom] = useState<CustomService[]>([])
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set([...builtinNames, ...serviceRegistry.map((d) => d.name)]))
  const [search, setSearch] = useState('')
  const [phone, setPhone] = useState('')
  const [mail, setMail] = useState('')
  const [threadCount, setThreadCount] = useState(10)
  const [targetCount, setTargetCount] = useState('')
  const [intervalSec, setIntervalSec] = useState(0)
  const [mode, setMode] = useState<'normal' | 'turbo'>('normal')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const logId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  // Load custom services + health
  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/health`)
      .then(async (r) => {
        const ct = r.headers.get('content-type') || ''
        if (!r.ok || !ct.includes('application/json')) return false
        try { await r.json(); return true } catch { return false }
      })
      .then((ok) => alive && setServerOnline(ok))
      .catch(() => alive && setServerOnline(false))
    fetch(`${API_BASE}/api/services`)
      .then((r) => r.json())
      .then((d) => alive && setCustom(Array.isArray(d.services) ? d.services : []))
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const merged = useMemo(() => {
    const map: Record<string, MergedService> = {}
    for (const name of builtinNames) {
      map[name] = { ...builtin[name], name, custom: false }
    }
    for (const c of custom) {
      map[c.name] = { url: c.url, method: c.method, domain: domainOf(c.url), headers: c.headers, body: c.body, name: c.name, custom: true }
    }
    for (const def of serviceRegistry) {
      if (map[def.name]) continue
      const preview = def.url(buildCtx('0000000000', ''))
      map[def.name] = {
        name: def.name,
        url: preview,
        method: def.method,
        domain: domainOf(preview),
        custom: false,
        registry: true,
        definition: def,
      }
    }
    return map
  }, [custom])

  const allNames = useMemo(() => Object.keys(merged), [merged])
  const totalCount = allNames.length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allNames
    return allNames.filter((n) => {
      const s = merged[n]
      return n.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)
    })
  }, [search, allNames, merged])

  const selectedCount = selected.size

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name) } else { next.add(name) }
      return next
    })
  }

  const selectAll = () => setSelected(new Set(allNames))
  const clearAll = () => setSelected(new Set())

  const updateLog = (id: number, status: ServiceStatus, message: string) => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, status, message } : l)))
  }

  const buildRequest = (svc: MergedService, phoneVal: string) => {
    if (svc.definition) {
      return toRequest(svc.definition, buildCtx(phoneVal, mail))
    }
    const url = fillTemplate(svc.url, phoneVal, mail)
    let headers = svc.headers || {}
    let body: string | undefined
    if (svc.method === 'POST') {
      if (svc.custom) {
        body = fillTemplate(svc.body || '{}', phoneVal, mail)
      } else {
        body = JSON.stringify({ phone: phoneVal, email: mail || undefined })
        headers = { 'Content-Type': 'application/json', ...headers }
      }
    }
    return { url, method: svc.method, headers, body }
  }

  const runOne = async (name: string, phoneVal: string) => {
    const svc = merged[name]
    const req = buildRequest(svc, phoneVal)
    const id = ++logId.current
    setLogs((prev) => [
      { id, service: name, status: 'running' as ServiceStatus, message: `→ ${svc.method} ${domainOf(req.url)}`, time: formatTime(new Date()) },
      ...prev,
    ].slice(0, 500))
    try {
      const res = await fetch(`${API_BASE}/api/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      const text = await res.text()
      let data: ProxyResult
      try {
        data = JSON.parse(text)
      } catch {
        updateLog(id, 'fail', 'Backend yok (statik yayın). Yerelde dev:server gerekli.')
        return
      }
      let ok = data.ok
      if (svc.definition?.check) {
        try {
          ok = data.status !== 0 && svc.definition.check(data.status, data.body)
        } catch {
          ok = false
        }
      }
      if (ok) {
        updateLog(id, 'success', `${data.status} OK${data.body ? ' · ' + data.body.slice(0, 60).replace(/\s+/g, ' ') : ''}`)
      } else {
        updateLog(id, 'fail', data.error || `${data.status} hata`)
      }
    } catch (e: any) {
      updateLog(id, 'fail', e?.message || 'proxy hatası')
    }
  }

  const startRun = async () => {
    if (serverOnline === false) {
      alert('Backend çevrimdışı. GitHub Pages statik yayındır; göndermek için yerelde "bun run dev:server" çalıştırın.')
      return
    }
    const phoneVal = phone.trim()
    if (!/^\d{10}$/.test(phoneVal)) {
      alert('Telefon numarası 10 haneli olmalı (başında +90 olmadan).')
      return
    }
    const list = Array.from(selected)
    if (list.length === 0) {
      alert('En az bir servis seçin.')
      return
    }
    setRunning(true)
    setLogs([])
    setProgress(0)
    const controller = new AbortController()
    abortRef.current = controller

    const target = targetCount.trim() === '' ? null : parseInt(targetCount, 10)
    let sent = 0
    const chunkSize = Math.max(1, Math.ceil(list.length / Math.max(1, threadCount)))
    const chunks: string[][] = []
    for (let i = 0; i < list.length; i += chunkSize) chunks.push(list.slice(i, i + chunkSize))

    try {
      if (mode === 'turbo') {
        while (!controller.signal.aborted) {
          if (target !== null && sent >= target) break
          await Promise.all(chunks.map((chunk) => Promise.all(chunk.map((n) => runOne(n, phoneVal)))))
          sent += list.length
          setProgress(target ? Math.min(100, Math.round((sent / target) * 100)) : 50)
          if (target === null) break
          if (intervalSec > 0) await new Promise((r) => setTimeout(r, intervalSec * 1000))
        }
      } else {
        while (!controller.signal.aborted) {
          if (target !== null && sent >= target) break
          for (const chunk of chunks) {
            if (controller.signal.aborted) break
            if (target !== null && sent >= target) break
            await Promise.all(chunk.map((n) => runOne(n, phoneVal)))
            sent += chunk.length
            setProgress(target ? Math.min(100, Math.round((sent / target) * 100)) : 50)
            if (intervalSec > 0) await new Promise((r) => setTimeout(r, intervalSec * 1000))
          }
          if (target === null) break
        }
      }
    } finally {
      setRunning(false)
      setProgress(100)
      abortRef.current = null
    }
  }

  const stopRun = () => abortRef.current?.abort()

  const saveService = async () => {
    setFormError('')
    const name = form.name.trim()
    const url = form.url.trim()
    if (!name) return setFormError('Servis adı gerekli.')
    if (!/^https?:\/\//i.test(url)) return setFormError('Geçerli bir http(s) URL girin.')
    let headers: Record<string, string> = {}
    if (form.headers.trim()) {
      try {
        const parsed = JSON.parse(form.headers)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          headers = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
        } else {
          return setFormError('Headers geçerli bir JSON nesnesi olmalı.')
        }
      } catch {
        return setFormError('Headers JSON olarak geçersiz.')
      }
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, method: form.method, headers, body: form.body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'kayıt başarısız')
      setCustom(Array.isArray(data.services) ? data.services : [])
      setSelected((prev) => new Set(prev).add(name))
      setShowAdd(false)
      setForm(emptyForm)
      setServerOnline(true)
    } catch (e: any) {
      setFormError(e?.message || 'Sunucuya ulaşılamadı.')
    } finally {
      setSaving(false)
    }
  }

  const deleteService = async (name: string) => {
    const svc = custom.find((c) => c.name === name)
    if (!svc) return
    if (!confirm(`"${name}" servisini silmek istiyor musunuz?`)) return
    try {
      const res = await fetch(`${API_BASE}/api/services/${encodeURIComponent(svc.id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setCustom(Array.isArray(data.services) ? data.services : [])
        setSelected((prev) => { const n = new Set(prev); n.delete(name); return n })
      }
    } catch {
      alert('Silme başarısız.')
    }
  }

  const stats = useMemo(() => {
    const ok = logs.filter((l) => l.status === 'success').length
    const fail = logs.filter((l) => l.status === 'fail').length
    return { ok, fail }
  }, [logs])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">E2</div>
          <div>
            <div className="brand-name">Enough V2</div>
            <div className="brand-sub">sms service control panel</div>
          </div>
        </div>
        <div className="topbar-stats">
          <div className="stat"><span className="stat-dot" />{totalCount} servis</div>
          <div className="stat">seçili <b>{selectedCount}</b></div>
          <div className="stat">başarılı <b style={{ color: 'var(--green)' }}>{stats.ok}</b></div>
          <div className="stat">başarısız <b style={{ color: 'var(--red)' }}>{stats.fail}</b></div>
        </div>
      </header>

      <main className="content">
        <section className="hero">
          <div className="ascii"> ░▒▓██████▓▒░  Enough V2  [ cyrozer_ ]</div>
          <h1>ENOUGH V2 PANEL</h1>
          <p>
            Kütüphanedeki {totalCount} SMS servisini görüntüleyen, filtreleyen ve proxy üzerinden çalıştıran
            TypeScript tabanlı kontrol paneli. Kendi servislerinizi de ekleyip aynı mantıkla yönetebilirsiniz.
          </p>
          <div className="hero-meta">
            <span className="chip"><b>{totalCount}</b> servis yüklü</span>
            <span className="chip"><b>{custom.length}</b> özel servis</span>
            <span className="chip">
              proxy <b>{serverOnline === null ? 'kontrol...' : serverOnline ? 'aktif' : 'çevrimdışı'}</b>
            </span>
            <span className="chip">tema <b>Cyber Neon</b></span>
          </div>
        </section>

        <div className="grid">
          <aside className="panel">
            <h2 className="panel-title">İşlem Ayarları</h2>

            <div className="field">
              <label>Telefon Numarası (10 hane)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="5XXXXXXXXX"
                disabled={running}
              />
            </div>

            <div className="field">
              <label>Mail Adresi (opsiyonel)</label>
              <input
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                placeholder="ornek@gmail.com"
                disabled={running}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Thread Sayısı</label>
                <input
                  type="number"
                  min={1}
                  max={3000}
                  value={threadCount}
                  onChange={(e) => setThreadCount(Math.max(1, Math.min(3000, parseInt(e.target.value || '1', 10))))}
                  disabled={running}
                />
              </div>
              <div className="field">
                <label>Hedef Adet</label>
                <input
                  value={targetCount}
                  onChange={(e) => setTargetCount(e.target.value.replace(/\D/g, ''))}
                  placeholder="sonsuz = boş"
                  disabled={running}
                />
              </div>
            </div>

            <div className="field">
              <label>Aralık (saniye)</label>
              <input
                type="number"
                min={0}
                value={intervalSec}
                onChange={(e) => setIntervalSec(Math.max(0, parseInt(e.target.value || '0', 10)))}
                disabled={running}
              />
            </div>

            <div className="toggle-row">
              <div className={'toggle' + (mode === 'normal' ? ' active' : '')} onClick={() => !running && setMode('normal')}>
                Normal
              </div>
              <div className={'toggle' + (mode === 'turbo' ? ' active' : '')} onClick={() => !running && setMode('turbo')}>
                Turbo
              </div>
            </div>

            {!running ? (
              <button className="btn btn-primary btn-block" onClick={startRun} disabled={serverOnline === false}>
                {serverOnline === false ? '◼ Backend çevrimdışı' : '▶ İşlemi Başlat'}
              </button>
            ) : (
              <button className="btn btn-danger btn-block" onClick={stopRun}>
                ■ Durdur
              </button>
            )}

            <div className="progress-bar">
              <div style={{ width: `${progress}%` }} />
            </div>

            <div className="cors-note">
              GitHub Pages yalnızca statik dosya sunar; proxy backend orada çalışmaz. Panel GitHub'da
              katalog olarak açılır. Göndermek için yerelde <b>bun run dev:server</b> + <b>bun run dev</b>
              çalıştırın; proxy aktifken istekler tarayıcı yerine backend üzerinden gider ve CORS engeli aşılır.
            </div>
          </aside>

          <section className="panel">
            <h2 className="panel-title">Servis Listesi</h2>

            <div className="search-box">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="servis veya domain ara..." />
            </div>

            <div className="services-header">
              <span>gösterilen <b>{filtered.length}</b> / {totalCount}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={() => setShowAdd(true)}>
                  ＋ Yeni Servis
                </button>
                <button className="btn" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={selectAll}>
                  Tümünü Seç
                </button>
                <button className="btn" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={clearAll}>
                  Temizle
                </button>
              </span>
            </div>

            <div className="services-grid">
              {filtered.map((name) => {
                const s = merged[name]
                const isSel = selected.has(name)
                return (
                  <div key={name} className={'service-card' + (isSel ? ' selected' : '')} onClick={() => toggle(name)}>
                    <div className="cb">{isSel ? '✓' : ''}</div>
                    <div className="meta">
                      <div className="name">
                        {name} {s.custom && <span className="badge">özel</span>}
                        {s.registry && <span className="badge">kod</span>}
                      </div>
                      <div className="domain">{s.domain}</div>
                    </div>
                    {s.custom ? (
                      <button
                        className="row-del"
                        title="Servisi sil"
                        onClick={(e) => { e.stopPropagation(); deleteService(name) }}
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="method">{s.method}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <section className="panel log-panel">
          <div className="log-toolbar">
            <h2 className="panel-title" style={{ margin: 0 }}>İşlem Günlüğü</h2>
            <div className="log-stats">
              <span className="ok">✓ {stats.ok} başarılı</span>
              <span className="fail">✗ {stats.fail} başarısız</span>
              <span>toplam {logs.length}</span>
            </div>
          </div>
          <div className="log-list">
            {logs.length === 0 ? (
              <div className="empty-log">Henüz işlem yok. Başlatmak için ayarları doldurun.</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className={'log-entry ' + l.status}>
                  <span className="log-time">{l.time}</span>
                  <span className="log-name">{l.service}</span>
                  <span className="log-msg">{l.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        ENOUGH V2 — TypeScript Panel · {totalCount} servis · Discord: cyrozer_
      </footer>

      {showAdd && (
        <div className="modal-overlay" onClick={() => !saving && setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Yeni Servis Ekle</h3>
              <button className="modal-x" onClick={() => !saving && setShowAdd(false)}>✕</button>
            </div>
            <p className="modal-desc">
              Mevcut servislerle aynı mantık: <code>{'{{phone}}'}</code> ve <code>{'{{mail}}'}</code> yer tutucuları
              çalıştırma anında doldurulur. URL içinde de kullanılabilir.
            </p>

            <div className="field-row">
              <div className="field">
                <label>Servis Adı</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OrnekServis" />
              </div>
              <div className="field">
                <label>Metot</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as 'GET' | 'POST' })}>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>Hedef URL</label>
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://ornek.com/api/sms?gsm={{phone}}"
              />
            </div>

            <div className="field">
              <label>Headers (JSON)</label>
              <textarea
                rows={3}
                value={form.headers}
                onChange={(e) => setForm({ ...form, headers: e.target.value })}
                spellCheck={false}
              />
            </div>

            <div className="field">
              <label>Body (POST — JSON/şablon)</label>
              <textarea
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                spellCheck={false}
              />
            </div>

            {formError && <div className="form-error">{formError}</div>}

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowAdd(false)} disabled={saving}>Vazgeç</button>
              <button className="btn btn-primary" onClick={saveService} disabled={saving}>
                {saving ? 'Kaydediliyor...' : 'Servisi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}