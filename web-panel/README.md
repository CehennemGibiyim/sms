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
