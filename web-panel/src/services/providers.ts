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

export const serviceRegistry: ServiceDefinition[] = []
