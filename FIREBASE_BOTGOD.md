# Firebase Godbot — **SIN Cloud Functions**

Proyecto: **Godbot** (`godbot-d5aa2`) · Plan **Blaze**  
Soporte: plago1806@gmail.com

## Productos que SÍ usamos (los 4 que configuraste)

| Producto | Para qué (barato / controlable) |
|----------|----------------------------------|
| **Hosting** | Landing `botgod.pro` (HTML/JS estático). SSL gratis. |
| **Firestore** | Stats públicas + backup de config. El **bot en tu PC/VPS** escribe con Admin SDK. |
| **Storage** | Transcripts / archivos (opcional). Solo el bot sube. |
| **Authentication** | Opcional más adelante. Hoy el login del dashboard es **Discord OAuth en Express** (tu VPS), no Functions. |

## Productos que NO usamos (a propósito)

| ❌ No | Por qué |
|-------|---------|
| **Cloud Functions** | Cobra por invocación, cold starts, y se va de presupuesto fácil. |
| **Cloud Run** | Mismo rol de “servidor en la nube de Google”; no lo necesitamos. |
| **Extensions** que instalen Functions | Evitar. |

El “cerebro” del bot y el dashboard pesado corren en **Node en tu máquina/VPS**. Firebase solo hostea la web y guarda datos. **$0 de Functions.**

---

## Arquitectura (cero Functions)

```
                    ┌─────────────────────┐
   botgod.pro  ──►  │  Firebase Hosting   │  solo archivos estáticos
                    │  web/public/        │
                    └─────────┬───────────┘
                              │ lee stats (cliente)
                              ▼
                    ┌─────────────────────┐
                    │     Firestore       │  public/stats (lectura web)
                    │     Storage         │  transcripts (solo bot)
                    └─────────▲───────────┘
                              │ escribe Admin SDK
                    ┌─────────┴───────────┐
  Discord API  ◄──► │  Tu VPS / PC        │  Discord bot + Express dashboard
  api.botgod.pro    │  node src/index.js  │  SQLite local + Firebase Admin
                    └─────────────────────┘
```

No hay `functions/` en el repo. `firebase.json` **no** declara Functions.

---

## Costes Blaze reales (sin Functions)

Con uso normal de un bot:

- **Hosting**: free tier generoso (GB storage + transfer)
- **Firestore**: free tier 50k lecturas/día, 20k escrituras/día (el bot escribe stats cada 5 min = barato)
- **Storage**: free tier + pocos céntimos si subes transcripts
- **Auth**: free hasta escala grande

El gasto grande de Blaze suele ser **Functions / Run / mucho egress**. Nosotros no usamos los dos primeros.

---

## Deploy Hosting (solo estático)

```powershell
cd C:\Users\LENOVO\Projects\GOD-Bot
npm install -g firebase-tools
firebase login

# CLIENT_ID de Discord en web/public/config.js
npm run web:config
firebase deploy --only hosting
firebase deploy --only firestore:rules,storage
```

**Nunca** ejecutes `firebase deploy` a ciegas con carpeta `functions` (no existe).  
Comando seguro:

```bash
firebase deploy --only hosting,firestore:rules,storage
```

---

## Dominio botgod.pro

1. Firebase → **Hosting** → Add custom domain → `botgod.pro`
2. DNS A/TXT que te diga Firebase
3. SSL automático

Dashboard del bot (login Discord):

- Misma máquina: Express en VPS y subdominio `api.botgod.pro`, **o**
- Todo Express en VPS con Caddy en `botgod.pro` y Hosting solo como backup/CDN de marketing

En `web/public/config.js`:

```js
window.GOD_SITE = {
  clientId: 'TU_DISCORD_CLIENT_ID',
  apiBase: 'https://api.botgod.pro',      // VPS del bot
  dashboardUrl: 'https://api.botgod.pro',
};
```

---

## Service account (bot → Firestore/Storage)

1. Firebase → ⚙️ → **Cuentas de servicio** → Generate new private key  
2. `secrets/godbot-sa.json`  
3. `.env`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./secrets/godbot-sa.json
   FIREBASE_PROJECT_ID=godbot-d5aa2
   ```

Sin esto el bot sigue con **SQLite** y la web igual se ve; solo no actualiza stats en Firestore.

---

## Auth en Firebase

Configurado pero **no obligatorio**.  
Login del panel = Discord OAuth en Express (gratis, en tu servidor).  
Firebase Auth se puede usar después para otra cosa; no requiere Functions.

---

## Checklist “no me van a cobrar Functions”

- [x] No hay carpeta `functions/`
- [x] `firebase.json` sin bloque `"functions"`
- [x] Deploy solo `hosting` + `rules`
- [x] Escrituras con **Admin SDK desde el bot**, no desde Cloud Functions
- [ ] No instalar Extensions de Firebase que activen Functions

---

**Resumen:** Hosting + Firestore + Storage + (Auth opcional) + bot en tu PC/VPS.  
**Functions: zero.** Así se usa Blaze sin que se te coma la billetera.
