/**
 * Landing botgod.pro — stats + links + keep-alive del backend Render
 */
(function () {
  const cfg = window.GOD_SITE || {};
  const CLIENT_ID = cfg.clientId || localStorage.getItem('GOD_CLIENT_ID') || '';
  const API_BASE = (cfg.apiBase || localStorage.getItem('GOD_API_BASE') || '').replace(/\/$/, '');
  const DASH_BASE = (cfg.dashboardUrl || API_BASE || window.location.origin).replace(/\/$/, '');

  const KEEPALIVE_MS = 5 * 60 * 1000;
  const STATS_RETRIES = 6;
  const STATS_RETRY_MS = 4000;

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
  ['btn-dash', 'btn-dash-m', 'cta-dash'].forEach((id) => {
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

  function setStats(data) {
    const g = document.getElementById('stat-guilds');
    const u = document.getElementById('stat-users');
    const p = document.getElementById('stat-ping');
    if (g && data.guilds != null) g.textContent = data.guilds;
    if (u && data.users != null) u.textContent = Number(data.users).toLocaleString('es-ES');
    if (p && data.ping != null) p.textContent = data.ping >= 0 ? data.ping + 'ms' : '—';
  }

  function statsUrls() {
    const urls = [];
    if (API_BASE) urls.push(API_BASE + '/api/stats');
    if (DASH_BASE && DASH_BASE !== API_BASE) urls.push(DASH_BASE + '/api/stats');
    return urls;
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadStatsFromApi() {
    for (const url of statsUrls()) {
      const data = await fetchJson(url, 25000);
      if (data && data.guilds != null) {
        setStats(data);
        return true;
      }
    }
    return false;
  }

  async function loadStatsFromFirestore() {
    if (!window.GOD_FIRESTORE_STATS) return false;
    try {
      const data = await window.GOD_FIRESTORE_STATS();
      if (data && data.guilds != null) {
        setStats(data);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function loadStats() {
    for (let i = 0; i < STATS_RETRIES; i++) {
      if (await loadStatsFromApi()) return;
      if (await loadStatsFromFirestore()) return;
      if (i < STATS_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, STATS_RETRY_MS));
      }
    }
  }

  function pingKeepAlive() {
    const urls = [];
    if (API_BASE) urls.push(API_BASE + '/health');
    if (DASH_BASE && DASH_BASE !== API_BASE) urls.push(DASH_BASE + '/health');
    urls.forEach((url) => {
      fetch(url, { cache: 'no-store', mode: 'no-cors' }).catch(() => {});
    });
  }

  loadStats();
  pingKeepAlive();
  setInterval(pingKeepAlive, KEEPALIVE_MS);
})();