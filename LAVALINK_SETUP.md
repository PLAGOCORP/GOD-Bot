# 🎵 Configuración de música con Lavalink

La música de Discord **requiere UDP**, que Railway no soporta. Por eso el bot
delega el audio a un servidor **Lavalink** que corre en un host con UDP. El
bot (en Railway) solo se comunica con Lavalink por WebSocket/TCP.

```
┌────────────────────┐   WebSocket/TCP    ┌─────────────────────┐   UDP    ┌─────────┐
│  God Bot (Railway) │ ─────────────────► │ Lavalink (host UDP) │ ───────► │ Discord │
└────────────────────┘   puerto 2333      └─────────────────────┘  voz     └─────────┘
```

---

## Paso 1 — Elegir un host con UDP para Lavalink

Lavalink **no puede ir en Railway** (mismo problema de UDP). Opciones baratas:

| Host | Precio | Notas |
|------|--------|-------|
| **VPS Hetzner** | ~€4/mes | Recomendado. Ubuntu + Docker. |
| **Contabo / Vultr / DigitalOcean** | ~$5/mes | Cualquier VPS con Docker sirve. |
| **Oracle Cloud** | Gratis | Capa gratuita (ARM). Un poco más de setup. |
| **Fly.io** | Gratis/bajo | Permite UDP saliente. |

Necesitas **~1 GB de RAM** libre para Lavalink (es una app Java).

---

## Paso 2 — Desplegar Lavalink (con Docker, lo más fácil)

En tu VPS, con Docker instalado:

```bash
# 1. Copia la carpeta lavalink/ de este repo al servidor
#    (contiene application.yml y docker-compose.yml)
cd lavalink

# 2. CAMBIA la contraseña en application.yml (campo password)
nano application.yml     # cambia "youshallnotpass" por una tuya

# 3. Levanta Lavalink
docker compose up -d

# 4. Verifica que arrancó (espera ~30s a que baje el plugin de YouTube)
docker compose logs -f
# Debe decir: "Lavalink is ready to accept connections."
```

Lavalink queda escuchando en el **puerto 2333** de tu VPS.

> **Firewall:** asegúrate de que el puerto 2333 esté abierto SOLO para la IP de
> Railway si puedes, o al menos protegido con una contraseña fuerte. Como mínimo:
> `sudo ufw allow 2333/tcp`

---

## Paso 3 — Conectar el bot (variables en Railway)

En Railway → tu servicio → **Variables**, añade:

| Variable | Valor |
|----------|-------|
| `LAVALINK_HOST` | La IP pública de tu VPS (ej. `123.45.67.89`) |
| `LAVALINK_PORT` | `2333` |
| `LAVALINK_PASSWORD` | La contraseña que pusiste en `application.yml` |
| `LAVALINK_SECURE` | `false` (`true` solo si pones Lavalink detrás de HTTPS) |

Guarda y deja que Railway redespliegue.

---

## Paso 4 — Verificar

En los logs de Railway, al arrancar debe aparecer:

```
[LAVALINK] Inicializado → 123.45.67.89:2333 (secure: false)
[LAVALINK] Nodo "main" conectado ✅
```

Luego en Discord, entra a un canal de voz y usa:

```
/musica play never gonna give you up
```

Si suena, ¡listo! 🎉

---

## Alternativa rápida: nodo público (para probar YA)

Si solo quieres **probar** antes de montar tu propio Lavalink, existen nodos
públicos comunitarios (poco fiables, pueden caerse). Busca "Lavalink public
nodes" y pon sus datos en las variables. **No los uses en producción** — monta
el tuyo con el Paso 2.

---

## Problemas comunes

- **`Nodo "main" cerrado` / no conecta** → revisa IP/puerto/contraseña, y que el
  firewall del VPS permita el 2333.
- **Conecta pero YouTube da error** → el plugin `youtube-source` tarda en bajar
  la primera vez; espera y reinicia (`docker compose restart`). Si persisten los
  429, activa el bloque `oauth` en `application.yml` con un refresh token.
- **La música se corta** → sube la RAM de la JVM (`_JAVA_OPTIONS=-Xmx2G`) en
  `docker-compose.yml`.
