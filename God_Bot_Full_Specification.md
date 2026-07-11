# 🤖 God Bot - Especificación Completa
## El Bot Discord Todo-en-Uno Definitivo (G.O.D.)

**Versión de Spec:** 1.0  
**Fecha:** Julio 2026  
**Creado para:** David (desarrollo iterativo en terminal)  
**Objetivo:** Unificar las mejores características de **Carl-bot, Mee6, Dyno, ProBot, Ticket Tool, NQN, Zira, Giveaway Bot, Invite Tracker, Emote Manager** y más en **un solo bot modular, potente, self-hosted y en español**.

---

## 🎯 Visión General

**God** es el bot que lo hace **todo**. Un "Dios" omnipotente para Discord que reemplaza 5-10 bots especializados con uno solo.

- **Filosofía**: Modular (activa/desactiva features por servidor), configurable vía comandos y wizard, con slash commands modernos + botones/modals/selects.
- **Público objetivo**: Servidores grandes, comunidades de soporte, gaming, activismo, educación, servidores hispanohablantes.
- **Diferenciadores**:
  - Todo gratis/self-hosted (sin paywalls como Mee6).
  - Excelente soporte en **español**.
  - Logging y moderación de nivel Carl-bot + ProBot.
  - Tickets profesionales como Ticket Tool.
  - Leveling visual como ProBot/Mee6.
  - Reaction roles avanzados (Zira + Carl-bot).
  - Emojis globales estilo NQN (sin Nitro).
  - Giveaways, invites, stats, utilidades completas.
  - Diseño "divino": Respuestas épicas, embeds bonitos, branding coherente (logo con halo o poder celestial).

**Nombre del bot en Discord**: `God` o `God Bot`  
**Comandos principales**: Organizados por categorías (`/moderacion`, `/ticket`, `/nivel`, `/sorteo`, `/rol`, `/bienvenida`, etc.).

---

## 🛠️ Stack Tecnológico Recomendado

- **Node.js** ≥ 20.x (LTS)
- **discord.js** ^14.15+ (slash commands, componentes v2, threads, modals, selects, buttons)
- **better-sqlite3** (DB local rápida y simple, sin servidor)
- **Opcionales (Fase 2+)**:
  - `@discordjs/voice` + `ffmpeg-static` + `ytdl-core` o `distube` → **Música** (nota: complejo y con caveats ToS)
  - `@napi-rs/canvas` o `canvas` → Welcome images / level cards bonitos
  - `node-cron` → Tareas programadas (cerrar tickets inactivos, terminar giveaways)
- **Estructura de carpetas**:
  ```
  god-bot/
  ├── src/
  │   ├── commands/          # Slash commands organizados por módulo
  │   ├── events/            # ready, interactionCreate, guildMemberAdd, messageCreate (XP), etc.
  │   ├── modules/           # Lógica de cada feature (tickets.js, leveling.js, mod.js, etc.)
  │   ├── database/          # schema.sql, db.js (mejor-sqlite3 wrapper)
  │   ├── utils/             # helpers (permissions.js, embeds.js, logger.js, i18n.js)
  │   ├── handlers/          # commandHandler.js, buttonHandler.js, modalHandler.js
  │   └── index.js
  ├── config/                # guild configs o .env
  ├── package.json
  └── README.md
  ```

**Permisos del bot en Discord**: Administrator (recomendado para full features) o granular (Manage Roles, Manage Channels, Manage Messages, Manage Webhooks, etc.).

---

## 🗄️ Esquema de Base de Datos (SQLite)

Tablas clave (normalizadas + JSON para flexibilidad):

- `guilds` (guild_id PK, language='es', prefix='!', settings_json, created_at)
- `users` (user_id, guild_id, xp_text, xp_voice, level_text, level_voice, last_xp, warns_count, joined_at, invites_count)
- `warns` (id, user_id, guild_id, mod_id, reason, timestamp, duration?, active)
- `tickets` (id, guild_id, creator_id, channel_id/thread_id, category, status='open'|'claimed'|'closed', claimed_by, created_at, closed_at, transcript_path)
- `giveaways` (id, guild_id, channel_id, message_id, prize, winners_count, end_timestamp, requirements_json, ended=0/1)
- `reaction_roles` (id, guild_id, message_id, emoji, role_id, mode='toggle'|'once'|'remove'|'unique')
- `invites` (code, guild_id, inviter_id, uses, fake_detected)
- `logs` (id, guild_id, type, user_id, target_id, details_json, timestamp)
- `configs` (guild_id, module, config_json)  // e.g. mod: {automod_enabled: true, ...}

**Migraciones simples** con SQL en database/schema.sql.

---

## 📦 Módulos y Especificaciones Detalladas de Funciones

### 1. Moderación Avanzada + Automod (Carl-bot + Dyno + Mee6)

**Inspirado en**: Carl-bot (mejor logging y granularidad), Dyno (bulk actions), Mee6 (automod simple).

**Funcionalidades clave**:
- Comandos de mod: ban, kick, timeout, warn, unwarn, purge (por usuario, bots, links, pings, humans, attachments, etc.).
- Bulk role: `/rol masivo agregar @rol @usuarios...` o selección.
- **Automod configurable**:
  - Spam (mensajes duplicados, rápido, caps).
  - Palabras/prohibidas (lista custom + defaults).
  - Links (blacklist dominios, invites Discord).
  - Menciones masivas, attachments spam.
  - Escalation: delete → warn → timeout → kick → ban.
- "Drama channel" o mod-overview: Resumen reciente de infracciones.
- Sticky roles (re-aplicar mute/warn roles al rejoin).
- Mod logs detallados (embeds bonitos con razón, mod responsable, evidencia).

**Comandos ejemplo**:
- `/moderacion ban @usuario [duración] [razón]`
- `/moderacion purge 50 bots`
- `/moderacion warn @usuario spam`
- `/automod regla agregar spam`
- `/modlogs ver @usuario`

**Cómo funciona**: Interaction + checks de permisos (Manage Members). Logs en canal dedicado configurable. DB para historial de warns.

**Permisos**: Manage Members, Manage Messages, View Audit Log.

---

### 2. Sistema de Tickets Profesional (Ticket Tool + PeakBot)

**Inspirado en**: Ticket Tool (más popular para soporte).

**Funcionalidades**:
- Panel interactivo: Botón "🎫 Crear Ticket" en canal público.
- **Categorías** vía Select Menu o botones múltiples (Soporte General, Reporte Bug, Sugerencia, Denuncia, etc.).
- Al crear: Modal con preguntas custom por categoría (¿Cuál es el problema? Prioridad?).
- Crea **Thread privado** o canal en categoría staff-only.
- **Claim**: Botón "Reclamar" → asigna al mod (evita duplicados).
- **Cerrar**: Botón + razón → genera **transcript HTML** (bonito con mensajes, autores, timestamps) → envía a log channel + DM al usuario.
- Auto-close tickets inactivos (24h-72h configurable).
- Formularios avanzados, ratings post-cierre (CSAT simple).
- Staff performance básico (cuántos tickets cerró X mod).

**Comandos ejemplo**:
- `/ticket panel crear #canal-tickets "Soporte God" "Haz clic para abrir ticket"`
- `/ticket categoria agregar "Reporte" "Descripción..."`
- `/ticket cerrar [razón]`
- `/ticket transcript [ticket_id]`

**Cómo funciona**:
1. Usuario clica botón → modal o thread creation.
2. Staff ve en canal staff o thread.
3. Claim/close → actualiza DB + genera HTML (usa discord.js message fetch + template).
4. Transcript subido o link.

**Permisos**: Manage Threads/Channels, Manage Messages.

**Notas impl**: Transcripts en carpeta `/transcripts/` o S3-like local.

---

### 3. Sistema de Niveles / XP (ProBot + Mee6 + Arcane)

**Inspirado en**: ProBot (mejor welcome + leveling visual), Mee6 (simple y popular).

**Funcionalidades**:
- **XP por texto**: 15-25 random por mensaje (cooldown 60s por usuario).
- **XP por voz**: Tiempo en VC (cada X minutos).
- **Level-up**: Anuncio en canal configurable o DM. Asigna **role rewards** por nivel (stack o replace).
- No-XP: Lista de canales y roles excluidos.
- Leaderboard: `/nivel top` (global o por período: día/semana/mes).
- `/nivel rango [@usuario]` → embed bonito con progreso, XP needed, rank.
- Recompensas: Roles especiales, acceso a canales "vip".
- Multiplicadores XP por role (booster, active, etc.).

**Comandos ejemplo**:
- `/nivel rango`
- `/nivel top texto`
- `/nivel recompensas agregar 10 @RolNivel10`
- `/nivel config canal-anuncio #level-ups`

**Cómo funciona**: `messageCreate` event → calcula XP → actualiza DB → si level up → assign role + announce. Voice via `voiceStateUpdate` tracking time.

**DB**: users.xp_text, users.level_text, etc.

---

### 4. Giveaways / Sorteos (Giveaway Bot style)

**Funcionalidades**:
- Crear giveaway con duración (1h, 2d, etc.), número de ganadores, premio.
- **Requisitos**: Nivel mínimo, tener rol X, joined hace X días, mínimo mensajes (trackeable vía DB users).
- Entrada: **Botón grande "🎉 Participar"** en el mensaje del giveaway.
- Auto-end al tiempo o `/sorteo terminar`.
- Elegir ganadores aleatorios (justo, sin bias).
- Anunciar ganadores + DM automático.
- Reroll: `/sorteo reroll [message_id]`
- Blacklist usuarios, requisitos múltiples.

**Comandos ejemplo**:
- `/sorteo crear "1 Nitro" 24h 1 #giveaways "Requisito: Nivel 5+"`
- `/sorteo end`
- `/sorteo reroll 123456789`

**Cómo funciona**: Guarda en DB giveaways + message_id. Al crear → embed + botón. Listener button → añade user a lista participantes (DB o JSON en giveaway row). Timer o cron para end. Random pick winners.

---

### 5. Roles de Reacción + Button Roles + Auto Roles (Carl-bot + Zira)

**Inspirado en**: Carl-bot (250 roles, modos avanzados), Zira (especialista simple y confiable desde 2017).

**Funcionalidades**:
- **Modos**:
  - Toggle (añadir/quitar al reaccionar/clicar).
  - Once (una sola vez – perfecto para "Acepto reglas").
  - Remove (reacciona para quitar rol).
  - Unique (solo 1 rol por mensaje).
- **Button Roles** (más limpio que reacciones, soporta selects).
- Setup interactivo o comandos.
- Límites por usuario, blacklist/whitelist roles.
- Auto Roles al unirse (múltiples, con delay opcional).
- Self-destruct messages? (opcional).

**Comandos ejemplo**:
- `/rol reaccion crear` (wizard interactivo: canal → mensaje → emoji + rol + modo).
- `/rol reaccion agregar :emoji: @RolNormal toggle`
- `/rol auto agregar @RolMiembro`
- `/rol lista`

**Cómo funciona**: Al setup → guarda en DB reaction_roles. `interactionCreate` o `messageReactionAdd/Remove` → verifica modo → añade/quita rol. Para botones: componentes.

**Permisos**: Manage Roles (bot role arriba de los que asigna).

---

### 6. Bienvenidas, Despedidas y Autoroles (ProBot fuerte aquí)

**Inspirado en**: ProBot (mejores welcome images/cards).

**Funcionalidades**:
- Mensajes custom embed + variables (`{user}`, `{server}`, `{count}`, `{avatar}`).
- **Welcome Image/Card**: Generada con canvas (avatar circular, nombre, server name, fondo custom o default).
- DM de bienvenida.
- Goodbye message.
- Autorole al join (verificación implícita).
- Reglas gate: Canal de verificación con botón/reacción "Acepto" → da rol full access.

**Comandos**:
- `/bienvenida mensaje "¡Bienvenido {user}!"`
- `/bienvenida imagen activar` (config background vía attach o URL).
- `/autorol agregar @RolNuevo`

**Implementación**: `guildMemberAdd` event → send welcome (channel + DM) + assign autoroles. Canvas para imagen si activado.

---

### 7. Logging Completo y Auditoría

- Canales separados o unificado con categorías: #mod-logs, #message-logs, #member-logs, #server-logs, #ticket-logs.
- Eventos trackeados:
  - Mensajes (delete, edit, purge) – contenido si posible.
  - Joins/leaves (con invite usado si tracked).
  - Role changes, nickname, avatar.
  - Channel/role/emoji updates.
  - Mod actions (ban, warn, etc.).
- Ignore lists (canales, usuarios, bots).
- "Drama channel" resumen.

**DB + embeds bonitos** con colores por tipo (rojo para bans, etc.).

---

### 8. Invite Tracker + Recompensas

- Trackea códigos de invitación, quién invitó a quién, uses.
- Detección fake invites (join + leave rápido).
- Recompensas: Al alcanzar X invites → rol o XP bonus.
- `/invites [@usuario]` → stats personales.
- `/invites top`

**Eventos**: `guildMemberAdd` + fetch invites para source.

---

### 9. Emojis Globales (NQN) + Gestor de Emotes

**Inspirado en**: NQN (el estándar para free Nitro emojis).

**Funcionalidades**:
- Detecta `:emoji_name:` en mensajes → borra original + repost via **webhook** con el emoji (de servers compartidos o packs).
- **Emote Packs**: Unirse a packs públicos o crear los tuyos.
- Aliases personales o server.
- **Stickers**: Enviar imágenes grandes (import Telegram?).
- **Steal Emote**: `/emote robar [link o mensaje con emoji]` → añade al server si hay slot.
- `/emote agregar nombre url`
- Jumbo: Hace emoji grande.
- Moderation: Block emojis, lock behind role, curate.

**Cómo funciona (NQN core)**: `messageCreate` → parse `:name:` → si existe en cache o DB de emotes accesibles → webhook edit/repost con emoji URL. Requiere **Manage Webhooks** + External Emojis.

**Packs**: DB o lista de servers/packs.

---

### 10. Estadísticas del Servidor + Utilidades

- **Canales dinámicos**: Voice channels que se actualizan solos:
  - "👥 Miembros: 1,234"
  - "🟢 Online: 456"
  - "🚀 Boosts: 12"
- `/stats servidor`, `/stats usuario`
- **Polls avanzados**: `/encuesta crear "Pregunta?" Op1 Op2` → botones de voto + resultados live.
- Sugerencias: `/sugerir texto` → va a canal staff con botones approve/deny + feedback.
- Reminders: `/recordatorio en 2h hacer X` (DM o canal).
- AFK: `/afk [razón]` → auto-responde cuando lo mencionan.
- Otras: slowmode, lock/unlock canal, userinfo, avatar, roleinfo, serverinfo, color roles?, etc.

---

### 11. Diversión, Juegos y Comandos Sociales (Opcional pero nice)

- 8ball, coinflip, dice, trivia simple.
- Memes (integrar API o local si posible).
- **Música** (Fase 2 - opcional y con nota ToS):
  - `/musica play [query o URL]`
  - Queue, skip, nowplaying, loop, 24/7.
  - Requiere Lavalink self-hosted o distube + ffmpeg (internet estable necesario).

**Nota**: Música es la feature más problemática por ToS de Discord/YouTube. Muchos bots la dropearon. Incluir como módulo deshabilitable.

---

### 12. Comandos Personalizados / Tags (Carl-bot Tagscript inspiration)

- `/tag crear nombre "Respuesta con {variables}"`
- Soporta embeds, random responses, user variables.
- Poderoso para FAQs, reglas, etc.

---

### 13. Anti-Raid, Verificación y Seguridad

- Monitoreo de joins masivos → alert + posible lock server temporal.
- **Verificación de nuevos miembros**:
  - Rol "No Verificado" al join.
  - Canal #verificacion con botón "Verificarme" o reacción + captcha simple (o delay + quiz básico).
  - Al completar → da rol full + quita no-verificado.
- Age account check (cuentas muy nuevas alert).
- (Avanzado) Integración con servicios externos si user quiere (pero self-host friendly).

---

### 14. Economía (Stretch Goal - Fase 3)

- Moneda del server.
- `/economia daily`, work, balance, shop (comprar roles/items), gamble, leaderboard.
- Integra con leveling (recompensas).

---

## 🚀 Comandos Globales Útiles

- `/god setup` → Wizard interactivo que guía configuración inicial (canales logs, mod role, ticket panel, etc.).
- `/god config [módulo]` → Menú para activar/desactivar y configurar features.
- `/god help` o `/ayuda` → Menú bonito con todos los comandos por categoría.
- `/god stats` → Stats del bot (servers, uptime, etc.).

---

## 📋 Roadmap de Desarrollo (Iterativo)

**Fase 1 (Core - Empezar YA)**:
- Setup proyecto Node + discord.js + better-sqlite3.
- Command handler + slash registration.
- DB schema + basic guild/user tables.
- Moderación básica + logging.
- Permission checks + error handling.
- `/god setup` wizard básico.

**Fase 2**:
- Tickets completo (panel, claim, transcript HTML).
- Reaction Roles + Button Roles + Auto Roles.
- Welcome/Goodbye + Autoroles + canvas images.

**Fase 3**:
- Leveling + XP text/voice + rewards + leaderboard.
- Giveaways completo.
- Invite Tracker.

**Fase 4**:
- NQN-style emojis + emote manager.
- Server stats channels dinámicos.
- Polls, reminders, AFK, utilidades.
- Custom tags.

**Fase 5 (Polish)**:
- i18n full (ES principal).
- Anti-raid + verificación.
- Economía opcional.
- Música (si se decide).
- Dashboard web simple (Express + EJS) o rich config commands.
- Tests, docs, Docker support.

---

## ⚠️ Notas Importantes y Consideraciones

- **Self-hosted**: Tú creas la app en Discord Developer Portal, invitas el bot, pones token en `.env`, corres `node src/index.js`. Siempre encendido (VPS recomendado para features como giveaways/tickets).
- **Escalabilidad**: SQLite es genial para la mayoría de servers (<10k miembros). Para mega-servers, considerar migrar a PostgreSQL o sharding.
- **ToS & Legal**: No abuses de DMs, respeta rate limits de Discord. Para música: considera Lavalink propio. No hagas scraping masivo.
- **Privacidad**: Logs y transcripts almacenan datos de usuarios. Implementa comandos para "olvidar mis datos" si es necesario (GDPR spirit).
- **Branding**: Logo "God" con estilo divino. Respuestas con embeds épicos ("¡Por el poder de God...").
- **Mantenimiento**: Actualiza discord.js regularmente. Monitorea errores con logger.

---

## ✅ Próximos Pasos Inmediatos

1. **Revisa esta spec** y dime qué agregar, quitar, cambiar o priorizar (¿Música sí/no? ¿Economía? ¿Dashboard web?).
2. **Empezamos el desarrollo en terminal**:
   - Creo la estructura de carpetas y archivos base.
   - `npm init`, instalo dependencias.
   - Creo `index.js` básico + command handler.
   - Implementamos Fase 1 paso a paso (tú pruebas en tu servidor de test).
3. Iteramos: Cada módulo nuevo lo agregamos, testeamos, refinamos.

**¡God va a ser el bot más completo de Discord en español!** 🔥

¿Listo para empezar a codear en la terminal? Dime "sí, setup proyecto" o haz sugerencias primero.

---

*Spec generada con investigación profunda de bots populares 2026 (Carl-bot, Mee6, ProBot, Ticket Tool, NQN, Zira, Dyno, etc.). Lista para desarrollo iterativo contigo.*