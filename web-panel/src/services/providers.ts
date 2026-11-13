import type { ServiceDefinition } from './definition'

// Kendi sağlayıcılarınızı buraya ekleyin. Her tanım panelde otomatik görünür
// ve "kod" etiketiyle işaretlenir.
//
// API anahtarı ASLA buraya yazılmaz. Backend'de ortam değişkeni olarak tutulur
// ve {{env:DEGISKEN_ADI}} ile isteğe enjekte edilir.
//
// Backend tarafında güvenlik için ALLOWED_HOSTS tanımlanmalıdır:
//   PROVIDER_FIRMA_KEY=...  ALLOWED_HOSTS=api.firmaniz.com
//
// Örnek (kendi firmanızın uç noktasıyla değiştirin):
//
// {
//   id: 'firma-sms',
//   name: 'FirmaSms',
//   method: 'POST',
//   url: ({ phone }) => `https://api.firmaniz.com/v1/messages`,
//   headers: () => ({
//     'Content-Type': 'application/json',
//     Authorization: 'Bearer {{env:PROVIDER_FIRMA_KEY}}',
//   }),
//   body: ({ phone, randEmail }) =>
//     JSON.stringify({
//       to: `+90${phone}`,
//       email: randEmail(),
//       template: 'welcome',
//     }),
//   check: (status, text) => {
//     if (status !== 200) return false
//     try { return JSON.parse(text).ok === true } catch { return false }
//   },
//   requiredEnv: ['PROVIDER_FIRMA_KEY'],
// },
//
// GET örneği:
//
// {
//   id: 'firma-get',
//   name: 'FirmaGet',
//   method: 'GET',
//   url: ({ phone }) => `https://api.firmaniz.com/v1/check?msisdn=${phone}`,
//   headers: () => ({ 'X-Api-Key': '{{env:PROVIDER_FIRMA_KEY}}' }),
//   check: (status) => status === 200,
//   requiredEnv: ['PROVIDER_FIRMA_KEY'],
// },

export const serviceRegistry: ServiceDefinition[] = [
  // Uçtan uca test için nötr bir echo servisi (SMS göndermez).
  // Backend'de ALLOWED_HOSTS=httpbin.org ve PROVIDER_DEMO_KEY tanımlı olmalı.
  {
    id: 'ornek-echo',
    name: 'OrnekEcho',
    method: 'POST',
    url: () => 'https://httpbin.org/post',
    headers: () => ({
      'Content-Type': 'application/json',
      'X-Demo-Key': '{{env:PROVIDER_DEMO_KEY}}',
    }),
    body: ({ phone, mail }) => JSON.stringify({ phone, mail, source: 'enough-panel' }),
    check: (status, text) => status === 200 && text.includes('"phone"'),
    requiredEnv: ['PROVIDER_DEMO_KEY'],
  },
]
