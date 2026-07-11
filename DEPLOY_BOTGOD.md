# 🌐 Desplegar God Bot en **botgod.pro**

Guía paso a paso para poner tu dominio en producción.

---

## 1. DNS (en tu registrador)

Crea estos registros apuntando a la **IP de tu VPS**:

| Tipo | Nombre | Valor |
|------|--------|--------|
| **A** | `@` | `TU.IP.VPS` |
| **A** | `www` | `TU.IP.VPS` |

Espera a que propague (minutos–horas). Comprueba:

```bash
ping botgod.pro
```

---

## 2. Discord Developer Portal

1. [discord.com/developers/applications](https://discord.com/developers/applications) → tu app **God**
2. **OAuth2 → General**
   - Redirects (añade **exactamente**):
     ```
     https://botgod.pro/auth/callback
     ```
   - Copia **Client ID** y **Client Secret**
3. **Bot**
   - Token
   - Intents: Server Members, Message Content, Presence
4. (Opcional) En la ficha del bot pon como website: `https://botgod.pro`

---

## 3. `.env` de producción

```env
NODE_ENV=production
DISCORD_TOKEN=...
CLIENT_ID=...
CLIENT_SECRET=...
GUILD_ID=...          # tu server de test/admin
OWNER_IDS=...

DOMAIN=botgod.pro
DASHBOARD_URL=https://botgod.pro
DASHBOARD_PORT=3847
COOKIE_SECURE=true
SESSION_SECRET=un-secreto-muy-largo-aleatorio

XAI_API_KEY=          # opcional
```

---

## 4. VPS (Ubuntu ejemplo)

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential python3

# Código
sudo mkdir -p /opt/god-bot
sudo chown $USER:$USER /opt/god-bot
cd /opt/god-bot
# sube el proyecto (git clone / scp / rsync)
npm install
cp .env.example .env
nano .env   # rellena

# Comandos slash globales (producción)
npm run deploy:global

# Prueba local
NODE_ENV=production node src/index.js
# Debe decir: Web en https://botgod.pro → puerto local 3847
```

### Systemd (siempre online)

```bash
sudo cp deploy/god-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now god-bot
sudo journalctl -u god-bot -f
```

---

## 5. HTTPS con Caddy (recomendado, más fácil)

```bash
sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# Ajusta si el path del log no existe:
sudo mkdir -p /var/log/caddy
sudo systemctl reload caddy
```

Caddy saca certificado Let's Encrypt solo.

### O con Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx-botgod.pro.conf /etc/nginx/sites-available/botgod.pro
sudo ln -s /etc/nginx/sites-available/botgod.pro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d botgod.pro -d www.botgod.pro
```

---

## 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
# NO expongas 3847 al mundo si usas reverse proxy
sudo ufw enable
```

---

## 7. Checklist final

- [ ] `https://botgod.pro` abre la landing
- [ ] `https://botgod.pro/status` muestra Online
- [ ] Login Discord redirige y vuelve a `/servers`
- [ ] Invite del bot funciona desde la web
- [ ] En Discord: `/dashboard` enseña `https://botgod.pro`
- [ ] Redirect OAuth = `https://botgod.pro/auth/callback` (sin slash extra)

---

## Rutas públicas

| URL | Qué es |
|-----|--------|
| https://botgod.pro | Landing |
| https://botgod.pro/features | Features |
| https://botgod.pro/status | Status del bot |
| https://botgod.pro/login | OAuth Discord |
| https://botgod.pro/servers | Dashboard |
| https://botgod.pro/privacy | Privacidad |
| https://botgod.pro/terms | Términos |
| https://botgod.pro/health | Health JSON |

---

## Cloudflare (opcional)

Si usas Cloudflare delante:

1. Proxy naranja OK (HTTPS Full o Full Strict)
2. SSL/TLS → Full (strict) si Caddy/Nginx tienen cert real
3. No hace falta abrir el puerto 3847

---

**Tu marca:** botgod.pro · God Bot ⚡
