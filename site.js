/* Swoop landing page: theme switch, the download for your system, and the live editor demo. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);

  /* ---------- theme: automatic, light, dark ---------- */
  const themes = ['auto', 'light', 'dark'];
  const themeBtn = $('#theme');
  let theme = document.documentElement.getAttribute('data-theme') || 'auto';
  function applyTheme() {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    themeBtn.setAttribute('aria-label', 'Colour theme: ' + (theme === 'auto' ? 'automatic' : theme) + '. Click to change.');
    themeBtn.querySelector('use').setAttribute('href', theme === 'auto' ? '#i-auto' : theme === 'light' ? '#i-sun' : '#i-moon');
    try { if (theme === 'auto') localStorage.removeItem('swoop-theme'); else localStorage.setItem('swoop-theme', theme); } catch (e) {}
  }
  themeBtn.addEventListener('click', () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    applyTheme();
  });
  applyTheme();

  /* ---------- point the desktop button at your system ---------- */
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? 'windows' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : '';
  if (os) {
    const card = document.querySelector('.dl[data-os="' + os + '"]');
    card.classList.add('is-yours');
    const hero = $('#hero-desktop');
    hero.href = '#' + card.id;
    hero.querySelector('span').textContent = os === 'windows' ? 'Get it for Windows' : 'Get it for Linux';
  }

  /* ---------- the demo: a made-up web page, drawn on a canvas ---------- */
  function samplePage(pr) {
    const w = 1200, h = 760;
    const c = document.createElement('canvas');
    c.width = w * pr; c.height = h * pr;
    const x = c.getContext('2d');
    x.scale(pr, pr);
    const font = (wt, size) => wt + ' ' + size + 'px Geist, ui-sans-serif, system-ui, sans-serif';
    const round = (rx, ry, rw, rh, r, fill) => { x.beginPath(); x.roundRect(rx, ry, rw, rh, r); x.fillStyle = fill; x.fill(); };

    x.fillStyle = '#f5f4f0'; x.fillRect(0, 0, w, h);
    // top bar
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, 64);
    x.fillStyle = '#e7e5df'; x.fillRect(0, 64, w, 1);
    round(32, 18, 28, 28, 8, '#2f6bff');
    x.fillStyle = '#16161a'; x.font = font(650, 18); x.fillText('Parcelly', 72, 39);
    x.fillStyle = '#5c5a55'; x.font = font(500, 14);
    ['Orders', 'Returns', 'Help'].forEach((t, i) => x.fillText(t, 820 + i * 96, 38));
    round(1100, 16, 68, 32, 16, '#16161a');
    x.fillStyle = '#fff'; x.font = font(550, 13); x.fillText('Sign out', 1109, 37);

    // heading
    x.fillStyle = '#16161a'; x.font = font(650, 34); x.fillText('Your order is on its way', 64, 136);
    x.fillStyle = '#5c5a55'; x.font = font(400, 16); x.fillText('Order 48213-QX · placed on 14 October', 64, 168);

    // tracking card
    round(64, 200, 700, 250, 16, '#ffffff');
    x.fillStyle = '#16161a'; x.font = font(600, 18); x.fillText('Tracking', 96, 240);
    const stops = ['Ordered', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'];
    x.fillStyle = '#e7e5df'; x.fillRect(112, 300, 600, 4);
    x.fillStyle = '#2f6bff'; x.fillRect(112, 300, 300, 4);
    stops.forEach((s, i) => {
      const cx = 112 + i * 150;
      x.beginPath(); x.arc(cx, 302, 10, 0, Math.PI * 2); x.fillStyle = i <= 2 ? '#2f6bff' : '#e7e5df'; x.fill();
      x.fillStyle = i <= 2 ? '#16161a' : '#8a8780'; x.font = font(i === 2 ? 600 : 450, 13);
      x.textAlign = 'center'; x.fillText(s, cx, 340); x.textAlign = 'left';
    });
    x.fillStyle = '#5c5a55'; x.font = font(400, 15);
    x.fillText('Expected on Thursday, 23 October, between 10:00 and 14:00.', 96, 396);
    x.fillText('Something wrong? You can change the delivery day until 8 pm.', 96, 422);

    // address card, with details worth blurring
    round(796, 200, 340, 250, 16, '#ffffff');
    x.fillStyle = '#16161a'; x.font = font(600, 18); x.fillText('Delivering to', 828, 240);
    x.font = font(450, 15); x.fillStyle = '#16161a';
    ['Anna Kowalski', '27 Willow Lane, Flat 4', 'Bristol BS1 6QT', 'anna.kowalski@example.com', '+44 7700 900461']
      .forEach((t, i) => x.fillText(t, 828, 280 + i * 28));
    round(828, 408, 120, 28, 14, '#eef3ff');
    x.fillStyle = '#2f6bff'; x.font = font(550, 13); x.fillText('Change address', 840, 427);

    // items
    round(64, 482, 1072, 230, 16, '#ffffff');
    x.fillStyle = '#16161a'; x.font = font(600, 18); x.fillText('In this parcel', 96, 522);
    [['#ffd6a5', 'Ceramic pour-over set', '£34.00'], ['#caffbf', 'Paper filters, 100 pack', '£6.50'], ['#a0c4ff', 'Linen tea towel', '£12.00']]
      .forEach(([col, name, price], i) => {
        const y = 548 + i * 52;
        round(96, y, 40, 40, 8, col);
        x.fillStyle = '#16161a'; x.font = font(500, 15); x.fillText(name, 152, y + 25);
        x.fillStyle = '#5c5a55'; x.textAlign = 'right'; x.fillText(price, 1104, y + 25); x.textAlign = 'left';
      });
    return c;
  }

  const demo = $('#demo');
  if (demo && window.SwoopEditor) {
    const start = async () => {
      try { await document.fonts.load('600 16px Geist'); } catch (e) {}
      await SwoopEditor.create(demo, {
        layout: 'full',
        image: samplePage(2),
        pixelRatio: 2,
        name: 'swoop-demo',
        keys: 'focus',
        wheelPan: false,
      });
    };
    start();
  }
})();
