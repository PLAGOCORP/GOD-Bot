# ⚡ G.O.D. Bot v3 Ultimate

Implementación **real** de las specs del proyecto (v1 + v2 + v3).

## Arranque

```powershell
cd C:\Users\LENOVO\Projects\GOD-Bot
# Edita .env: DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET, GUILD_ID, OWNER_IDS
npm install
npm run deploy
npm start
```

- Bot Discord + **Web Dashboard** en `http://localhost:3847`
- Redirect OAuth2: `http://localhost:3847/auth/callback`

## 31 comandos (implementación real)

| Área | Comandos |
|------|----------|
| Core | `/god` setup, config, logs, preguntar, resumir, stats |
| Mod | `/moderacion` `/automod` `/modlogs` `/seguridad` |
| Tickets | `/ticket` panel, modal, claim, transcript HTML |
| Niveles | `/nivel` + XP voz en background |
| Música | `/musica play` → voice real (play-dl + ffmpeg) |
| NQN | `/emote` + auto `:emoji:` con webhook |
| Roles | `/rol` reacción, botón, select menu, auto |
| Starboard | `/starboard` |
| Cumpleaños | `/cumpleanos` + cron 09:00 |
| Temp VC | `/tempvc` crea/borra canales reales |
| Embed | `/embed` modal + plantillas DB |
| Apps | `/aplicacion` forms + approve |
| Confesiones | `/confesar` revisión staff |
| Plantillas | `/plantilla aplicar` crea roles/canales |
| Stats | `/stats` canales dinámicos |
| Economía | `/economia` |
| Invites | `/invites` |
| Dashboard | `/dashboard` + web OAuth2 |
| Utils | `/util` `/afk` `/tag` `/sugerir` `/recordatorio` |

DB: `data/god.db` (SQLite). Transcripts: `data/transcripts/`.
