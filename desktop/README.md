# Enough V2 Desktop (Windows / macOS / Linux)

Bu klasör, web panelini masaüstü uygulamasına saran Electron katmanıdır.
Panel arayüzü ve proxy backend'i `../web-panel` içindedir; Electron yalnızca
gömülü sunucuyu başlatır ve pencereyi açar.

## Gereksinimler

- Node.js 18+ / Bun
- `cd ../web-panel && bun install`

## Geliştirme

```bash
# 1) web panelini ve sunucu paketini derle
cd ../web-panel
bun run build
bun run build:server

# 2) electron bağımlılıklarını kur ve çalıştır
cd ../desktop
bun install
bun run dev
```

## Paketleme

```bash
cd ../desktop
bun install
bun run dist:win    # Windows NSIS (x64 + arm64)
bun run dist:mac    # macOS DMG (x64 + arm64)
bun run dist:linux  # AppImage + deb
```

Çıktılar `desktop/release/` altına yazılır. `extraResources` sayesinde panel
derlemesi (`dist`) ve proxy sunucusu (`server-dist`) uygulamanın içine girer.

## Sessiz otomatik güncelleme

`main.cjs` açılışta `electron-updater` ile güncelleme kontrolü yapar:

- `autoDownload = true` — yeni sürüm varsa arka planda indirir.
- `autoInstallOnAppQuit = true` — çıkışta kurar.
- `update-downloaded` olayında `quitAndInstall(true, true)` ile **sessiz** kurulum
  yapıp uygulamayı yeniden başlatır. Kullanıcıya soru sorulmaz.

Güncelleme kaynağı `package.json` içindeki `build.publish` alanıdır ve GitHub
Releases'a (`provider: github`) işaret eder. Sürüm yayınlama GitHub Actions ile
yapılır: **Actions → Create Release → Run workflow** ve sürüm girin (ör. `v1.0.3`).
Workflow `.exe`, `.exe.blockmap` ve `latest.yml` dosyalarını release'e ekler;
kurulu uygulamalar açılışta `latest.yml` okuyup sessizce güncellenir.

> `desktop/package.json` içindeki `version` ile release tag'i aynı olmalı,
> aksi halde installer adı ile sürüm uyuşmaz.

## API anahtarları (.env)

Kurulu uygulamada kabuk ortam değişkeni yoktur. `main.cjs` açılışta şu dosyayı
okur ve sunucuya aktarır:

```
%APPDATA%\Enough V2 Panel\.env
```

(`C:\Users\<kullanıcı>\AppData\Roaming\Enough V2 Panel\.env`)

Örnek içerik:

```
PROVIDER_DEMO_KEY=demo-secret-123
ALLOWED_HOSTS=httpbin.org
```

`{{env:VAR}}` yer tutucuları bu değerlerle doldurulur ve anahtarlar tarayıcıya
gitmez. `ALLOWED_HOSTS` tanımlı değilse env kullanan istekler reddedilir.

> Not: macOS ve Windows'ta imzalı dağıtım için sertifika gerekir; imzasız
> build'lerde otomatik güncelleme bazı platformlarda çalışmaz. macOS için
> `CSC_LINK`/`CSC_KEY_PASSWORD`, Windows için kod imzalama sertifikası tanımlayın.
