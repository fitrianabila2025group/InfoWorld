# InfoWorld Mirror Server

Full mirror server untuk www.infoworld.com dengan fitur anti-duplikat untuk Google Search Console.

## Fitur Utama

- **Full Mirror** — Semua halaman, CSS, JS, gambar, font di-proxy secara transparan
- **Anti Duplikat SEO** — Semua canonical URL, og:url, hreflang, JSON-LD, twitter:url di-rewrite ke domain mirror
- **Robots.txt Custom** — Generate robots.txt otomatis dengan sitemap mengarah ke mirror
- **Redirect Handling** — Redirect dari origin di-rewrite ke domain mirror
- **In-Memory Cache** — Response di-cache untuk performa (default 10 menit)
- **Kompatibel** — Bisa deploy ke Railway, Render, VPS, Easypanel, Docker

## Environment Variables

| Variable | Wajib | Default | Keterangan |
|---|---|---|---|
| `PORT` | Tidak | `3000` | Port server |
| `MIRROR_DOMAIN` | Tidak | `infoworld.media` | Domain mirror, contoh: `infoworld.media` |
| `CACHE_TTL` | Tidak | `600` | Cache TTL dalam detik |

> **PENTING**: Set `MIRROR_DOMAIN` ke domain kamu agar canonical URL dan semua meta tag mengarah ke domain mirror, bukan domain asli. Ini yang mencegah duplikat di Google.

## Deploy

### Railway

1. Push repo ini ke GitHub
2. Buka [railway.app](https://railway.app), buat project baru dari repo
3. Set environment variable:
   ```
   MIRROR_DOMAIN=infoworld.media
   ```
4. Railway akan otomatis build dan deploy

### Render

1. Push repo ini ke GitHub
2. Buka [render.com](https://render.com), buat Web Service baru dari repo
3. Set environment variable:
   ```
   MIRROR_DOMAIN=infoworld.media
   ```
4. Render akan otomatis build dan deploy via `render.yaml`

### VPS (Docker)

```bash
# Clone repo
git clone https://github.com/fitrianabila2025group/InfoWorld.git
cd InfoWorld

# Set domain mirror
export MIRROR_DOMAIN=infoworld.media

# Build dan jalankan
docker compose up -d
```

### VPS (Tanpa Docker)

```bash
# Clone repo
git clone https://github.com/fitrianabila2025group/InfoWorld.git
cd InfoWorld

# Install dependencies
npm ci --omit=dev

# Jalankan
MIRROR_DOMAIN=infoworld.media PORT=3000 node server.js
```

Kemudian pasang reverse proxy (Nginx/Caddy) di depannya untuk SSL.

Contoh Nginx:

```nginx
server {
    listen 80;
    server_name infoworld.media;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### Easypanel

1. Buka Easypanel dashboard
2. Buat service baru → pilih **App** → pilih sumber **GitHub repo** atau **Docker**
3. Jika Docker: set image build dari Dockerfile yang ada
4. Set environment variable:
   ```
   MIRROR_DOMAIN=infoworld.media
   PORT=3000
   ```
5. Set domain/subdomain di Easypanel
6. Deploy

## Cara Kerja Anti-Duplikat

Script ini mengatasi masalah duplikat di Google Search Console dengan cara:

1. **Canonical URL** — `<link rel="canonical">` di-rewrite dari `www.infoworld.com` ke domain mirror
2. **Open Graph** — `og:url` di-rewrite ke domain mirror
3. **Twitter Cards** — `twitter:url` di-rewrite ke domain mirror
4. **Hreflang** — `<link rel="alternate" hreflang="...">` di-rewrite
5. **JSON-LD** — Structured data URLs di-rewrite
6. **Sitemap** — Robots.txt mengarah ke sitemap mirror
7. **Internal Links** — Semua link dalam HTML/CSS/JS yang mengarah ke source domain di-rewrite ke mirror
8. **Redirects** — Header Location pada redirect di-rewrite ke mirror

Dengan semua rewriting ini, Google melihat domain mirror sebagai sumber unik dan tidak menandainya sebagai duplikat.

## Troubleshooting

**Google Search Console masih menunjukkan duplikat:**
- Pastikan `MIRROR_DOMAIN` sudah di-set dengan benar
- Verifikasi canonical URL sudah mengarah ke domain mirror (inspect page source)
- Submit sitemap ke Google Search Console
- Tunggu Google re-crawl (bisa beberapa hari sampai minggu)

**Halaman tidak loading:**
- Cek apakah origin server (www.infoworld.com) bisa diakses
- Cek log error di console