(function () {
  const canvas = document.getElementById('dash-stars');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let w, h, stars = [];
    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * 3000,
        y: Math.random() * 3000,
        r: Math.random() * 1.1 + 0.2,
        a: Math.random(),
        d: (Math.random() - 0.5) * 0.006,
      });
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.a += s.d;
        if (s.a > 1 || s.a < 0.08) s.d *= -1;
        ctx.beginPath();
        ctx.arc(s.x % w, s.y % h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a.toFixed(2)})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    draw();
  }

  const sidebar = document.getElementById('dash-sidebar');
  const overlay = document.getElementById('dash-overlay');
  const toggle = document.getElementById('menuToggle');

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
  }

  toggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('open');
  });

  overlay?.addEventListener('click', closeSidebar);

  window.showToast = function (msg, type) {
    type = type || 'success';
    let t = document.getElementById('dash-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'dash-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'dash-toast ' + type;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, 3200);
  };
})();