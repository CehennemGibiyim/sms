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

Güncelleme akışı için `package.json` içindeki `build.publish.url` alanını kendi
statik güncelleme sunucunuzla değiştirin (generic provider). Sürüm yayınlamak için:

```bash
# package.json version'ı artırın, sonra:
bun run publish
```

`publish` komutu `release/` altındaki dosyaları ve `latest.yml` /
`latest-mac.yml` / `latest-linux.yml` manifestlerini yükler. İstemciler açılışta
bu manifesti okuyup sessizce güncellenir.

> Not: macOS ve Windows'ta imzalı dağıtım için sertifika gerekir; imzasız
> build'lerde otomatik güncelleme bazı platformlarda çalışmaz. macOS için
> `CSC_LINK`/`CSC_KEY_PASSWORD`, Windows için kod imzalama sertifikası tanımlayın.
