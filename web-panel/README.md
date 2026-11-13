# Enough V2 Panel (TypeScript + React)

`enough-V2/main.py` içindeki SMS servislerini görüntüleyen, filtreleyen,
proxy üzerinden çalıştıran ve yeni servis ekleyebilen web paneli.

## Mimari

- **Frontend** — `src/` (React + TypeScript + Vite), Cyber Neon teması.
- **Backend / proxy** — `server/index.ts`, Node `http` ile:
  - `POST /api/proxy` → hedef servise isteği sunucudan gönderir (CORS aşılır)
  - `GET|POST /api/services` → özel servisleri listeler / ekler
  - `DELETE /api/services/:id` → özel servisi siler
  - üretimde `dist/` klasörünü statik olarak sunar
- Özel servisler `data/custom-services.json` içinde saklanır.

## Çalıştırma (geliştirme)

İki süreç gerekir:

```bash
cd web-panel
bun install

# terminal 1 — proxy/backend (http://localhost:8787)
bun run dev:server

# terminal 2 — panel (http://localhost:3000, /api → 8787 proxy)
bun run dev
```

## Üretim derlemesi

```bash
bun run build          # dist/ üretir
bun run build:server   # server-dist/server.cjs üretir
bun run start          # backend dist/ + API'yi birlikte sunar (varsayılan 8787)
```

## Yeni servis ekleme

Panelde **＋ Yeni Servis** butonu ile:

- **Ad**, **Metot** (GET/POST), **URL**
- **Headers** (JSON)
- **Body** (POST gövdesi)

URL ve body içinde `{{phone}}`, `{{mail}}` yer tutucuları çalıştırma anında
doldurulur. Eklenen servis listede `özel` etiketiyle görünür ve silinebilir.

## Not

Servis çağrıları artık tarayıcıdan değil backend'den yapıldığı için CORS engeli
yoktur. Başarısız sonuçlar hedef servisin kendi yanıtından (durum kodu, zaman
aşımı vb.) kaynaklanır.

## GitHub Pages (statik panel)

`https://cehennemgibiyim.github.io/sms/` adresi GitHub Actions ile otomatik
yayınlanır (`.github/workflows/deploy-pages.yml`). Ayarlar:

- **Settings → Pages → Build and deployment → Source: GitHub Actions**
- `main` dalına `web-panel/` değişikliği push edildiğinde workflow derler ve yayınlar.
- Derleme `VITE_BASE=/sms/` ile yapılır, böylece varlıklar `/sms/assets/...` altından yüklenir.

### Önemli: proxy GitHub Pages'te çalışmaz

GitHub Pages yalnızca statik dosya sunar; `/api/proxy` backend'i orada yoktur.
Bu yüzden Pages'te arayüz açılır ama "proxy çevrimdışı" görünür ve işlemler
çalışmaz. Tam işlev için bir backend gerekir. Uzak bir backend'e bağlanmak için:

```bash
VITE_BASE=/sms/ VITE_API_BASE=https://api.ornek.com bun run build
```

`VITE_API_BASE` boşsa panel aynı origin'i (`/api`) kullanır. Backend'i
Cloudflare Workers / Render / VPS üzerinde yayınlayıp bu değişkeni workflow'a
ekleyerek Pages panelini canlı proxy'ye bağlayabilirsiniz.

## Sağlayıcı ekleme (ServiceDefinition)

Kodla sağlayıcı eklemek için `src/services/providers.ts` içindeki
`serviceRegistry` dizisine tanım ekleyin:

```ts
import type { ServiceDefinition } from './definition'

export const serviceRegistry: ServiceDefinition[] = [
  {
    id: 'firma-sms',
    name: 'FirmaSms',
    method: 'POST',
    url: ({ phone }) => 'https://api.firmaniz.com/v1/messages',
    headers: () => ({
      'Content-Type': 'application/json',
      Authorization: 'Bearer {{env:PROVIDER_FIRMA_KEY}}',
    }),
    body: ({ phone }) => JSON.stringify({ to: `+90${phone}`, template: 'welcome' }),
    check: (status, text) => status === 200 && text.includes('"ok":true'),
    requiredEnv: ['PROVIDER_FIRMA_KEY'],
  },
]
```

Panel bu tanımı otomatik listeler, `kod` etiketiyle gösterir. Çalıştırınca
`check(status, body)` sonucuna göre yeşil **başarılı** veya kırmızı
**başarısız** logu üretilir.

### API anahtarları (backend ortam değişkeni)

Anahtarlar tarayıcıya gitmez. Header/gövde/URL içinde `{{env:DEGISKEN}}`
yazılır, backend bunu `process.env` üzerinden çözer.

`.env` (yerel, git'e eklenmez):

```bash
PROVIDER_FIRMA_KEY=gercek-anahtar
ALLOWED_HOSTS=api.firmaniz.com
```

Güvenlik: `{{env:...}}` kullanan isteklerde hedef host **mutlaka**
`ALLOWED_HOSTS` içinde olmalıdır; aksi halde backend isteği reddeder. Bu,
anahtarların başka bir adrese sızdırılmasını engeller.

`bun run dev:server` `.env` dosyasını otomatik okur. Derlenmiş sunucuda
(`node server-dist/server.cjs`) değişkenleri ortamdan verin.
