/**
 * Landing botgod.pro — stats + links
 * Configura CLIENT_ID y API_BASE en window.GOD_SITE (inyectado o defaults)
 */
(function () {
  const cfg = window.GOD_SITE || {};
  const CLIENT_ID = cfg.clientId || localStorage.getItem('GOD_CLIENT_ID') || '';
  // API del bot en VPS (cuando el dashboard Express está en otro host)
  const API_BASE = (cfg.apiBase || localStorage.getItem('GOD_API_BASE') || '').replace(/\/$/, '');
  // Si el dashboard vive en el mismo dominio vía proxy, usar origen actual
  const DASH_BASE = (cfg.dashboardUrl || API_BASE || window.location.origin).replace(/\/$/, '');

  function inviteUrl() {
    if (!CLIENT_ID) {
      return 'https://discord.com/developers/applications';
    }
    return (
      'https://discord.com/api/oauth2/authorize?client_id=' +
      encodeURIComponent(CLIENT_ID) +
      '&permissions=8&scope=bot%20applications.commands'
    );
  }

  const inv = inviteUrl();
  ['btn-invite', 'cta-invite', 'cta-invite-2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = inv;
  });
  ['btn-dash', 'cta-dash'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = DASH_BASE + (DASH_BASE.includes('login') ? '' : '/login');
  });

  const features = [
    { e: '🛡️', t: 'Moderación', d: 'Ban, warn, purge, automod con escalation, anti-raid y anti-nuke.' },
    { e: '🎫', t: 'Tickets', d: 'Panel, claim, transcript HTML y valoración CSAT.' },
    { e: '📈', t: 'Niveles', d: 'XP texto y voz, recompensas, rank cards.' },
    { e: '🎵', t: 'Música', d: 'Audio real en voice con cola y skip.' },
    { e: '😀', t: 'NQN Emotes', d: 'Emojis de otros servers sin Nitro.' },
    { e: '🌐', t: 'Dashboard', d: 'Gestiona todo desde botgod.pro con Discord login.' },
  ];
  const grid = document.getElementById('feature-grid');
  if (grid) {
    grid.innerHTML = features
      .map(
        (c) =>
          `<div class="bg-slate-900 border border-slate-800 hover:border-amber-500/30 rounded-2xl p-6 transition">
            <div class="text-3xl mb-3">${c.e}</div>
            <h3 class="font-semibold text-lg mb-2">${c.t}</h3>
            <p class="text-slate-400 text-sm leading-relaxed">${c.d}</p>
          </div>`
      )
      .join('');
  }

  async function loadStats() {
    // 1) API del bot
    const urls = [];
    if (API_BASE) urls.push(API_BASE + '/api/stats');
    urls.push(window.location.origin + '/api/stats');

    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        setStats(data);
        return;
      } catch {
        /* try next */
      }
    }

    // 2) Firestore public/stats (si firebase-init lo expone)
    if (window.GOD_FIRESTORE_STATS) {
      try {
        const data = await window.GOD_FIRESTORE_STATS();
        if (data) setStats(data);
      } catch {
        /* ignore */
      }
    }
  }

  function setStats(data) {
    const g = document.getElementById('stat-guilds');
    const u = document.getElementById('stat-users');
    const p = document.getElementById('stat-ping');
    if (g && data.guilds != null) g.textContent = data.guilds;
    if (u && data.users != null) u.textContent = Number(data.users).toLocaleString('es-ES');
    if (p && data.ping != null) p.textContent = data.ping + 'ms';
  }

  loadStats();
})();
