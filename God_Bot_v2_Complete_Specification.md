# 🤖 God Bot v2.0 - Especificación Completa y Definitiva
## El Bot Discord Más Completo y Moderno de 2026 (G.O.D.)

**Versión:** 2.0 (Actualizada con nuevas features)  
**Fecha:** Julio 2026  
**Estado:** Lista para desarrollo iterativo  
**Creado con:** Investigación profunda de Carl-bot, Mee6, ProBot, Ticket Tool, NQN, Zira, Dyno + ideas modernas 2026

---

## 🎯 Visión Actualizada

**God v2** es el **bot Discord definitivo**. Unifica **todo** lo mejor de los bots más usados + features modernas que pocos tienen bien integradas:

- Moderación y logging de nivel Carl-bot
- Tickets profesionales de Ticket Tool
- Leveling + welcome cards de ProBot/Mee6
- Reaction roles de Zira + Carl-bot
- Emojis globales de NQN
- Giveaways, invites, stats, utilidades
- **Nuevas features potentes**: Starboard, Cumpleaños, Temporary Voice Channels, Embed Builder, Aplicaciones/Forms, Confesiones, Role Menus avanzados, **AI Assistant**, Anti-Nuke avanzado y más.

**Filosofía**: Modular (activa/desactiva por servidor), todo en **español**, slash commands + botones/modals, self-hosted, sin paywalls, y con IA opcional para hacerlo más inteligente.

**Nombre del bot**: `God`  
**Branding**: Poder divino, respuestas épicas, embeds bonitos, logo con halo o poder celestial.

---

## 🛠️ Stack Tecnológico (v2)

- **Node.js** ≥ 20
- **discord.js** ^14.15+ (slash, buttons, modals, selects, threads, voice)
- **better-sqlite3** (DB principal)
- **Opcionales**:
  - `@napi-rs/canvas` → Welcome cards + level cards + embed previews
  - `node-cron` → Tareas programadas (cumpleaños, temp channels cleanup, giveaways)
  - AI: Gemini API / OpenAI / Ollama (local) para AI Chat y auto-categorización
  - `@discordjs/voice` + ffmpeg → Música y Soundboard (Fase 4)

**Estructura de proyecto** (recomendada):
```
god-bot/
├── src/
│   ├── commands/          # /moderacion, /ticket, /nivel, /sorteo, /starboard, /cumpleanos, etc.
│   ├── events/            # guildMemberAdd, messageCreate (XP + AI), interactionCreate, voiceStateUpdate
│   ├── modules/           # tickets.js, leveling.js, starboard.js, ai.js, tempVoice.js, etc.
│   ├── database/          # schema.sql + db.js
│   ├── utils/             # permissions.js, embeds.js, logger.js, i18n.js, canvas.js
│   ├── handlers/          # commandHandler, buttonHandler, modalHandler, aiHandler
│   └── index.js
├── config/
├── transcripts/           # Carpeta para transcripts HTML
├── package.json
└── .env
```

---

## 🗄️ Esquema de Base de Datos (v2)

Tablas principales (además de las v1):

- `guilds`, `users`, `warns`, `tickets`, `giveaways`, `reaction_roles`, `invites`, `configs` (igual que v1)
- **Nuevas**:
  - `starboard` (message_id, guild_id, star_count, starboard_message_id)
  - `birthdays` (user_id, guild_id, birth_date, last_wished)
  - `temp_channels` (channel_id, guild_id, creator_id, created_at, delete_at)
  - `applications` (id, guild_id, user_id, type, status, answers_json, reviewed_by)
  - `confessions` (id, guild_id, anonymous_id, content, status, approved_by)
  - `ai_logs` (id, guild_id, user_id, query, response, timestamp)  // opcional para moderar IA

---

## 📦 Módulos Principales (v1 + Mejorados)

### 1. Moderación Avanzada + Automod (Nivel Carl-bot + Dyno)

- Ban, kick, timeout, warn, purge (múltiples filtros), bulk roles
- Automod: spam, bad words, links, invites, mentions, caps, attachments
- Escalation automática + Drama channel
- Sticky roles + Mod logs detallados

**Comandos**: `/moderacion ban`, `/moderacion purge bots`, `/automod regla agregar`

---

### 2. Tickets Profesional (Nivel Ticket Tool)

- Panel con botón → Select de categorías → Modal con preguntas
- Threads o canales privados
- **Claim** + **Cerrar** con transcript HTML bonito
- Auto-close inactivos + ratings

**Comandos**: `/ticket panel crear`, `/ticket cerrar`

**Mejora v2**: Auto-categorización con IA (ver módulo AI)

---

### 3. Leveling / XP (Nivel ProBot + Mee6)

- XP texto + voz
- Level-up con role rewards + anuncio
- No-XP channels/roles
- Leaderboard + `/nivel rango`

**Comandos**: `/nivel rango`, `/nivel top`, `/nivel recompensas`

---

### 4. Giveaways / Sorteos

- Crear con duración, ganadores, premio
- Requisitos (nivel, rol, joined date)
- Botón "Participar" + selección aleatoria + reroll + DM a ganadores

**Comandos**: `/sorteo crear`, `/sorteo reroll`

---

### 5. Reaction Roles + Button Roles + Auto Roles (Nivel Zira + Carl-bot)

- Modos: Toggle, Once, Remove, Unique
- Button roles + Select menus
- Auto roles al join
- Límites y blacklists

**Comandos**: `/rol reaccion crear`, `/rol auto agregar`

---

### 6. Welcome, Goodbye & Autoroles (Nivel ProBot)

- Mensajes custom + variables
- **Welcome cards** con canvas (avatar + fondo + texto)
- DM welcome + Autoroles

**Comandos**: `/bienvenida mensaje`, `/bienvenida imagen`

---

### 7. Logging Completo + Invite Tracker

- Múltiples canales de logs (mod, message, member, server)
- Track de invites + recompensas por invites
- Fake invite detection

---

### 8. Emojis Globales NQN-Style + Emote Manager

- `:emoji:` → repost via webhook
- Emote packs, aliases, stickers
- `/emote robar`, `/emote agregar`

---

### 9. Utilidades Generales

- Polls con botones
- Sugerencias con approve/deny
- Reminders, AFK, slowmode, userinfo, serverinfo, etc.
- Server Stats (canales dinámicos que se actualizan)

---

## ✨ NUEVOS MÓDULOS v2 (Lo que le estamos agregando ahora)

### 10. Starboard / Highlights

**Descripción**: La gente reacciona con ⭐ (o emoji custom) a mensajes buenos y se publican automáticamente en un canal de "Mejores momentos".

**Funcionalidades**:
- Configurar emoji de star + canal de starboard
- Mínimo de stars para aparecer
- Ignorar canales o usuarios
- Mensaje original + cantidad de stars
- Posibilidad de borrar del starboard si se quitan reacciones

**Comandos**:
- `/starboard configurar #canal-estrella ⭐ 5`
- `/starboard ignorar #canal`

**Implementación**: `messageReactionAdd` → si llega al threshold → crea o actualiza mensaje en starboard channel.

---

### 11. Sistema de Cumpleaños

**Descripción**: Los miembros registran su cumpleaños y God felicita automáticamente + da rol temporal.

**Funcionalidades**:
- `/cumpleanos registrar DD/MM`
- Mensaje automático el día del cumpleaños (con embed bonito)
- Rol temporal "Cumpleañero del día" (se quita al día siguiente)
- Recordatorio 1 día antes (opcional)
- Leaderboard de "próximos cumpleaños"

**Comandos**:
- `/cumpleanos registrar 15/06`
- `/cumpleanos ver @usuario`
- `/cumpleanos proximos`

**Implementación**: `node-cron` diario a las 00:00 → revisa DB y envía mensajes + asigna/quita rol.

---

### 12. Temporary Voice Channels (Temp VC)

**Descripción**: Botones para crear canales de voz privados/temporales al instante.

**Funcionalidades**:
- Botón "Crear VC Temporal"
- Modal: Nombre del canal + límite de usuarios (2-99)
- El canal se borra automáticamente cuando queda vacío
- Opcional: Solo el creador puede invitar o kickear
- Límite de canales por usuario

**Comandos**:
- `/tempvc configurar #canal-boton "Crea tu VC temporal"`
- `/tempvc limite 5` (máximo por usuario)

**Implementación**: `interactionCreate` (button) → crea canal de voz + DB entry con `delete_at`. `voiceStateUpdate` detecta cuando está vacío y lo borra.

---

### 13. Embed Builder Interactivo

**Descripción**: Crear embeds bonitos fácilmente sin tener que escribir JSON.

**Funcionalidades**:
- `/embed crear` → abre modal con:
  - Título
  - Descripción
  - Color (selector o hex)
  - Imagen / Thumbnail
  - Footer + timestamp
  - Campos (field) múltiples
- Vista previa antes de enviar
- Guardar plantillas para reutilizar

**Comandos**:
- `/embed crear`
- `/embed plantilla guardar "Anuncio Oficial"`
- `/embed enviar #canal plantilla`

**Implementación**: Modal → construye embed object → envía. Opcional: canvas preview.

---

### 14. Sistema de Aplicaciones / Forms

**Descripción**: Formularios profesionales para staff, eventos, roles especiales, etc.

**Funcionalidades**:
- Crear tipo de aplicación (Staff, Evento, Moderador, etc.)
- Preguntas custom (texto, número, selección)
- Usuario llena el form → va a canal privado de revisión
- Botones: **Aprobar** / **Rechazar** / **Pedir más info**
- Notificación al usuario + asignación de rol si aprueba

**Comandos**:
- `/aplicacion crear tipo "Staff" "Quieres ser staff?"`
- `/aplicacion lista`
- `/aplicacion revisar [id]`

**Implementación**: Modal forms → guarda en DB `applications` → embed en canal staff con botones de acción.

---

### 15. Confesiones Anónimas (Seguro)

**Descripción**: Canal donde la gente puede mandar confesiones de forma anónima (con controles de seguridad).

**Funcionalidades**:
- `/confesar "Mi confesión..."` (solo visible para mods inicialmente)
- O versión fully anon (con precauciones)
- Aprobación de mod antes de publicar (o auto-publish con filtro)
- Logs internos para abuso
- Blacklist de palabras

**Comandos**:
- `/confesar`
- `/confesion aprobar [id]`
- `/confesion rechazar [id]`

**Implementación**: DB `confessions` + sistema de aprobación similar a aplicaciones.

---

### 16. Role Menus Avanzados (con Categorías)

**Descripción**: Menús organizados y bonitos para elegir roles (mejor que solo reacciones).

**Funcionalidades**:
- Crear menús por categorías: "Colores", "Notificaciones", "Juegos", "Regiones", "Pronombres", etc.
- Select menus o botones grandes
- Requisitos (debes tener X rol para ver ciertas opciones)
- Límite de roles por categoría

**Comandos**:
- `/rol menu crear "Colores" #canal`
- `/rol menu agregar "Colores" Rojo #FF0000`

---

### 17. AI Assistant (El diferenciador grande)

**Descripción**: God puede responder preguntas, ayudar con el servidor y hacer tareas inteligentes.

**Funcionalidades**:
- `/god preguntar "Cómo configuro los reaction roles?"` → responde con conocimiento del server + reglas
- **Auto-categorización de tickets**: Cuando abres ticket, sugiere categoría automáticamente
- **Moderación inteligente**: Detecta toxicidad, scams o contextos que los filtros normales no pillan
- **Resumen de hilos**: `/resumir` en un thread largo
- **Sugerencias inteligentes** de respuestas para mods

**Implementación**:
- Conectar con Gemini (fácil y gratis para empezar) o Ollama local
- Prompt engineering con contexto del server (reglas, canales importantes, etc.)
- Logs de uso para evitar abuso
- Toggle por servidor (puede ser costoso si usas API paga)

**Comandos**:
- `/god preguntar`
- `/god resumir`
- `/god config ia activar`

---

### 18. Seguridad Avanzada (Anti-Nuke + Verificación)

**Funcionalidades**:
- **Anti-Nuke**: Monitorea si alguien hace muchas acciones peligrosas (ban masivo, delete channels, etc.) → lockdown automático + alerta a owners
- **Verificación mejorada**: Nuevo miembro → rol "No Verificado" → debe completar botón + quiz simple o "Acepto las reglas"
- Detección básica de cuentas alternativas
- Scam link protection mejorada

**Comandos**:
- `/seguridad antinuke activar`
- `/verificacion configurar`

---

## 📋 Comandos Principales Actualizados (v2)

**Organizados por categoría** (slash commands):

- **Moderación**: `/moderacion ...`
- **Tickets**: `/ticket ...`
- **Niveles**: `/nivel ...`
- **Sorteos**: `/sorteo ...`
- **Roles**: `/rol ...` (reaccion, auto, menu)
- **Bienvenida**: `/bienvenida ...`
- **Starboard**: `/starboard ...`
- **Cumpleaños**: `/cumpleanos ...`
- **Temp VC**: `/tempvc ...`
- **Embed**: `/embed ...`
- **Aplicaciones**: `/aplicacion ...`
- **Confesiones**: `/confesar`, `/confesion ...`
- **AI**: `/god preguntar`, `/god resumir`
- **Utilidades**: `/encuesta`, `/sugerir`, `/recordatorio`, `/afk`, `/stats`
- **General**: `/god setup`, `/god config`, `/god help`

---

## 🚀 Roadmap de Desarrollo v2 (Actualizado)

**Fase 1 – Core (Empezar ahora)**
- Estructura del proyecto + command handler
- DB schema completa (incluyendo nuevas tablas)
- Moderación + Logging básico
- Permission system + `/god setup` wizard
- Welcome + Autoroles básico

**Fase 2 – Engagement & Soporte**
- Tickets completo + transcripts
- Reaction Roles + Button Roles + Role Menus
- Starboard
- Temporary Voice Channels
- Embed Builder
- Cumpleaños

**Fase 3 – Nivel + Diversión**
- Leveling completo (texto + voz + rewards)
- Giveaways
- Invite Tracker + recompensas
- Aplicaciones / Forms
- Confesiones (versión segura)

**Fase 4 – Inteligencia & Seguridad**
- AI Assistant (Gemini primero)
- Auto-categorización de tickets
- Anti-Nuke avanzado + Verificación mejorada
- NQN Emojis + Emote Manager

**Fase 5 – Polish & Avanzado**
- i18n completo (ES + EN)
- Economía (opcional)
- Soundboard + Música (opcional)
- Dashboard web simple (Express)
- Optimización y tests

---

## ✅ Próximos Pasos

Este documento (`God_Bot_v2_Complete_Specification.md`) es la **especificación definitiva** con **todo** lo que vamos a implementar.

**Dime ahora:**

1. **"Empecemos el proyecto"** → Creo la estructura completa de carpetas, `package.json`, `index.js` básico, DB schema, y empezamos con **Fase 1** (core + moderación).
2. **"Primero agrega X feature a la spec"** (si quieres ajustar algo más).
3. **"Quiero empezar por este módulo"** (ej: Tickets, Reaction Roles, AI, Starboard, etc.).

**¿Qué quieres hacer ahora?**

Estoy listo para crear los archivos del proyecto y empezar a codear contigo en la terminal. 🔥

Dime la orden y vamos.