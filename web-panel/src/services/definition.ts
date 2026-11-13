// Tipli servis tanımı: main.py'deki bir metodu TypeScript'e taşımanın karşılığı.
// Her tanım URL, metot, header, gövde ve başarı kontrolünden oluşur.

export type Ctx = {
  phone: string
  mail: string
  rand: (n: number) => string
  randEmail: () => string
}

export type ProxyRequest = {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

export type ServiceDefinition = {
  /** Benzersiz kimlik (log ve seçim için) */
  id: string
  /** Panelde görünecek ad */
  name: string
  method: 'GET' | 'POST'
  url: (ctx: Ctx) => string
  headers?: (ctx: Ctx) => Record<string, string>
  body?: (ctx: Ctx) => string
  /**
   * Yanıt başarılı mı? Dönen proxy sonucu { status, body } ile çağrılır.
   * true → yeşil "başarılı", false → kırmızı "başarısız" logu.
   */
  check?: (status: number, body: string) => boolean
  /** Backend'de tanımlı olması gereken ortam değişkenleri (sadece bilgi amaçlı) */
  requiredEnv?: string[]
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function rand(n: number): string {
  return Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
}

export function buildCtx(phone: string, mail: string): Ctx {
  return {
    phone,
    mail,
    rand,
    randEmail: () => `${rand(12)}@gmail.com`,
  }
}

/**
 * Tanımı proxy'nin beklediği isteğe çevirir.
 * Header/gövde içinde {{env:VAR}} bırakılabilir; backend bunu ortam
 * değişkeninden çözer, böylece API anahtarı tarayıcıya hiç gitmez.
 */
export function toRequest(def: ServiceDefinition, ctx: Ctx): ProxyRequest {
  return {
    url: def.url(ctx),
    method: def.method,
    headers: def.headers?.(ctx) ?? {},
    body: def.method === 'POST' ? def.body?.(ctx) : undefined,
  }
}

export function domainOf(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}
