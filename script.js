/* =========================================================
   MAXED OUT. · Interaktionen
   Ohne externe Bibliotheken. Alles, was sich "mit Gewicht"
   bewegt, läuft über kleine Feder-Simulationen (Springs).
   ========================================================= */

(() => {
  document.documentElement.classList.add('js');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const P = window.GAUGE_PATHS;
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------------------------------------------------
     Feder: value läuft mit Masse und Dämpfung auf target zu
  --------------------------------------------------------- */
  class Spring {
    constructor(value, { stiffness = 170, damping = 20 } = {}) {
      this.value = value; this.target = value; this.v = 0;
      this.k = stiffness; this.c = damping;
    }
    step(dt) {
      if (reduced) { this.value = this.target; this.v = 0; return this.value; }
      const n = Math.ceil(dt / 0.008); const h = dt / n; // in kleinen Schritten = stabil
      for (let i = 0; i < n; i++) {
        this.v += (-this.k * (this.value - this.target) - this.c * this.v) * h;
        this.value += this.v * h;
      }
      return this.value;
    }
    get resting() { return Math.abs(this.v) < 0.01 && Math.abs(this.value - this.target) < 0.01; }
  }

  // Merkt sich, ob ein Element gerade (fast) im Bild ist. So rechnen wir nur, was man sieht.
  const visible = new WeakMap();
  const visIO = new IntersectionObserver((entries) => entries.forEach((en) => visible.set(en.target, en.isIntersecting)), { rootMargin: '25% 0px' });
  const watch = (el) => { visible.set(el, true); visIO.observe(el); };
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch (_) {} };

  // Eine zentrale Animationsschleife für alles
  const tickers = new Set();
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    tickers.forEach((fn) => fn(dt, now));
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ---------------------------------------------------------
     Tacho bauen (aus den echten Logo-Formen)
     Winkel θ in Grad: 180 = ganz links, 0 = ganz rechts.
  --------------------------------------------------------- */
  const PIV = { x: 275.75, y: 781.75 };
  const NEEDLE_REST = 39; // So steht die Nadel im Logo
  let gaugeId = 0;

  function buildGauge(host, { ticks = [], track = false, dim = true, follow = false } = {}) {
    const id = `g${gaugeId++}`;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '62 560 428 252');
    svg.innerHTML = `
      <defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="400" width="600" height="600">
        <path d="M128.75 781.75 A147 147 0 0 1 422.75 781.75" fill="none" stroke="#fff" stroke-width="84" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0"/>
      </mask></defs>
      ${follow ? `<g class="g-track" opacity="0"><path d="${P.arcSand}" fill="#EDE6D6"/><path d="${P.arcTaupe}" fill="#8A7A5C"/><path d="${P.arcRust}" fill="#B5502D"/></g>` : ''}
      ${track ? `<g opacity=".16"><path d="${P.arcSand}" fill="#EDE6D6"/><path d="${P.arcTaupe}" fill="#EDE6D6"/><path d="${P.arcRust}" fill="#EDE6D6"/></g>` : ''}
      <g mask="url(#${id})">
        <path class="g-seg" d="${P.arcSand}" fill="#EDE6D6"/>
        <path class="g-seg" d="${P.arcTaupe}" fill="#8A7A5C"/>
        <path class="g-seg g-redline" d="${P.arcRust}" fill="#B5502D"/>
      </g>
      ${ticks.map((t) => {
        const a = (t * Math.PI) / 180, r1 = 192, r2 = 208;
        return `<line class="g-tick" x1="${PIV.x + r1 * Math.cos(a)}" y1="${PIV.y - r1 * Math.sin(a)}" x2="${PIV.x + r2 * Math.cos(a)}" y2="${PIV.y - r2 * Math.sin(a)}"/>`;
      }).join('')}
      <g class="g-needle"><path d="${P.needle}" fill="#B5502D"/></g>
      <path d="${P.pivot}" fill="#B5502D"/>`;
    host.prepend(svg);

    const needle = svg.querySelector('.g-needle');
    const drawPath = svg.querySelector('mask path');
    const segs = [...svg.querySelectorAll('.g-seg')];
    const tickEls = [...svg.querySelectorAll('.g-tick')];
    const trackEl = svg.querySelector('.g-track');

    return {
      svg,
      setAngle(theta) {
        needle.setAttribute('transform', `rotate(${NEEDLE_REST - theta} ${PIV.x} ${PIV.y})`);
        // follow: Der Bogen füllt sich genau bis zur Nadel, der Rest bleibt durchsichtig
        if (follow) drawPath.setAttribute('stroke-dashoffset', (1 - clamp((180 - theta) / 180, 0, 1)).toFixed(4));
        if (dim) {
          // Segmente leuchten erst, wenn die Nadel sie erreicht hat
          segs[1].style.opacity = lerp(0.22, 1, clamp((128 - theta) / 14, 0, 1));
          segs[2].style.opacity = lerp(0.22, 1, clamp((68 - theta) / 14, 0, 1));
        }
        svg.classList.toggle('is-hot', theta < 30);
      },
      setDraw(p) {
        if (follow) trackEl.setAttribute('opacity', (0.17 * clamp(p, 0, 1)).toFixed(3)); // nur die durchsichtige Spur blendet ein
        else drawPath.setAttribute('stroke-dashoffset', 1 - clamp(p, 0, 1));
      },
      setTickActive(i) { tickEls.forEach((t, j) => (t.style.stroke = j === i ? '#EDE6D6' : '')); },
      // Bildschirmposition des Drehpunkts
      pivotOnScreen() {
        const m = svg.getScreenCTM(); const pt = svg.createSVGPoint();
        pt.x = PIV.x; pt.y = PIV.y; return pt.matrixTransform(m);
      },
    };
  }

  // Winkel vom Drehpunkt zu einem Bildschirmpunkt (0..180, unten wird geklemmt)
  function angleTo(g, x, y) {
    const p = g.pivotOnScreen();
    const dx = x - p.x, dy = p.y - y;
    if (dy < 0) return dx >= 0 ? 0 : 180;
    return clamp((Math.atan2(dy, dx) * 180) / Math.PI, 0, 180);
  }

  // Am Handy liegt der Finger meist unter dem Tacho. Darum ein Drehpunkt, der
  // nach unten "nachgibt": links wischen = Nadel links, rechts = rechts.
  function touchAngleTo(g, x, y) {
    const p = g.pivotOnScreen();
    const dx = x - p.x, dy = Math.max(p.y - y, 0) + innerWidth * 0.25;
    return clamp((Math.atan2(dy, dx) * 180) / Math.PI, 0, 180);
  }

  /* ---------------------------------------------------------
     1) Hero: Intro wie im Logo-Reel, danach folgt die Nadel
        dem Zeiger (am Handy: dem Scrollen)
  --------------------------------------------------------- */
  const heroHost = document.querySelector('[data-hero-gauge]');
  const hero = document.querySelector('.hero');
  const readout = document.querySelector('[data-readout]');
  const heroGlow = document.querySelector('.hero__glow');
  let heroGauge, heroNeedle, heroFollow = false;

  if (heroHost && P) {
    heroGauge = buildGauge(heroHost, { dim: false, follow: true });
    heroNeedle = new Spring(192, { stiffness: 90, damping: 11 });
    let draw = reduced ? 1 : 0;
    heroGauge.setDraw(draw);
    let shownValue = -1;

    watch(hero);
    tickers.add((dt) => {
      if (!visible.get(hero) && heroNeedle.resting) return;
      const th = heroNeedle.step(dt);
      heroGauge.setAngle(th);
      const pct = Math.round(clamp((180 - th) / 180, 0, 1) * 100);
      if (pct !== shownValue && readout) {
        shownValue = pct;
        readout.textContent = pct >= 99 ? 'MAX' : pct;
        readout.nextElementSibling.style.display = pct >= 99 ? 'none' : '';
      }
      if (heroGlow) heroGlow.style.setProperty('--heat', (0.1 + 0.6 * Math.pow(1 - clamp(th, 0, 180) / 180, 1.6)).toFixed(3));
    });

    // Intro: Bogen zeichnen, Nadel schwingt in den roten Bereich und federt ein
    const t0 = performance.now();
    if (!reduced) {
      tickers.add(function intro(dt, now) {
        const t = (now - t0) / 1000;
        const p = clamp((t - 0.15) / 1.1, 0, 1);
        draw = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        heroGauge.setDraw(draw);
        if (t > 0.55 && heroNeedle.target === 192) heroNeedle.target = NEEDLE_REST;
        if (p >= 1) tickers.delete(intro);
      });
    } else heroNeedle.target = heroNeedle.value = NEEDLE_REST;

    setTimeout(() => { heroFollow = true; }, reduced ? 0 : 1900);

    // Zeiger folgt
    if (finePointer) {
      window.addEventListener('pointermove', (e) => {
        if (!heroFollow) return;
        const r = hero.getBoundingClientRect();
        if (r.bottom < 0) return;
        heroNeedle.target = angleTo(heroGauge, e.clientX, e.clientY);
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', () => { heroNeedle.target = NEEDLE_REST; });
    } else {
      // Touch: Scrollen dreht den Motor hoch, der Finger zieht die Nadel mit,
      // und ein Tipp auf den Tacho gibt Gas.
      let scrollTarget = NEEDLE_REST, fingerOn = false, revUntil = 0, revTimer;
      const settle = () => { if (heroFollow && !fingerOn && performance.now() >= revUntil) heroNeedle.target = scrollTarget; };
      window.addEventListener('scroll', () => {
        const p = clamp(window.scrollY / (hero.offsetHeight * 0.6), 0, 1);
        scrollTarget = lerp(NEEDLE_REST, 0, p);
        settle();
      }, { passive: true });

      const follow = (e) => {
        if (!heroFollow || performance.now() < revUntil) return;
        const t = e.touches[0]; if (!t) return;
        heroNeedle.target = touchAngleTo(heroGauge, t.clientX, t.clientY);
      };
      hero.addEventListener('touchstart', (e) => { fingerOn = true; follow(e); }, { passive: true });
      hero.addEventListener('touchmove', follow, { passive: true });
      const release = () => { fingerOn = false; clearTimeout(revTimer); revTimer = setTimeout(settle, 450); };
      hero.addEventListener('touchend', release, { passive: true });
      hero.addEventListener('touchcancel', release, { passive: true });

      // Gas geben
      const rev = (strength = 1) => {
        heroNeedle.target = lerp(NEEDLE_REST, -6, strength);
        heroNeedle.v -= 260 * strength; // kleiner Kick, damit es ruckt wie ein Motor
        revUntil = performance.now() + 650 * strength;
        heroHost.classList.add('is-revving');
        buzz(strength === 1 ? [18, 40, 12] : 10);
        clearTimeout(revTimer);
        revTimer = setTimeout(() => { heroHost.classList.remove('is-revving'); settle(); }, 650 * strength);
      };
      heroHost.classList.add('is-tappable');
      heroHost.addEventListener('click', () => { if (heroFollow) rev(1); });

      // Einmal kurz anblasen, damit man merkt: der lebt
      if (!reduced) setTimeout(() => { if (!fingerOn && window.scrollY < 40) rev(0.45); }, 2600);
    }
  }

  // Intro-Text: Überschrift Wort für Wort
  const splitEl = document.querySelector('[data-split]');
  if (splitEl) {
    const nodes = [...splitEl.childNodes]; splitEl.textContent = '';
    let lastInner = null, i = 0;
    const word = () => {
      const w = document.createElement('span'); w.className = 'split-word';
      const inner = document.createElement('span'); inner.style.transitionDelay = `${0.9 + i++ * 0.08}s`;
      w.append(inner); splitEl.append(w, ' '); return inner;
    };
    nodes.forEach((n) => {
      if (n.nodeType === 3) n.textContent.split(/\s+/).filter(Boolean).forEach((t) => { lastInner = word(); lastInner.textContent = t; });
      else if (lastInner) lastInner.append(n); else { lastInner = word(); lastInner.append(n); }
    });
  }
  const introEls = [...document.querySelectorAll('[data-intro]')];
  requestAnimationFrame(() => setTimeout(() => {
    introEls.forEach((el, i) => {
      if (!el.hasAttribute('data-split')) el.style.transitionDelay = `${reduced ? 0 : 1.05 + i * 0.12}s`;
      el.classList.add('is-in');
    });
  }, 30));

  /* ---------------------------------------------------------
     2) Angebot: Tacho als Regler
  --------------------------------------------------------- */
  const dialHost = document.querySelector('[data-dial-gauge]');
  if (dialHost && P) {
    const STOPS = [157.5, 112.5, 67.5, 22.5];
    const g = buildGauge(dialHost, { ticks: STOPS });
    const needle = new Spring(180, { stiffness: 140, damping: 15 });
    const buttons = [...document.querySelectorAll('.dial__stop')];
    const items = [...document.querySelectorAll('.offer__item')];
    let active = 0, dragging = false, demoDone = false;

    const nearest = (th) => STOPS.reduce((b, s, i) => (Math.abs(s - th) < Math.abs(STOPS[b] - th) ? i : b), 0);
    function select(i, { move = true } = {}) {
      active = i;
      if (move) needle.target = STOPS[i];
      buttons.forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; });
      items.forEach((it, j) => it.classList.toggle('is-active', j === i));
      g.setTickActive(i);
    }
    select(0, { move: false });

    watch(dialHost);
    tickers.add((dt) => { if (visible.get(dialHost) || !needle.resting) g.setAngle(needle.step(dt)); });

    buttons.forEach((b, i) => b.addEventListener('click', () => { if (i !== active) buzz(8); select(i); }));
    document.querySelector('.dial__stops').addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault(); const n = clamp(active + d, 0, 3); select(n); buttons[n].focus();
    });

    // Ziehen
    const onMove = (e) => {
      const th = angleTo(g, e.clientX, e.clientY);
      needle.target = th;
      const n = nearest(th); if (n !== active) { select(n, { move: false }); buzz(8); }
    };
    // Maus: sofort ziehen. Finger: erst schauen, wohin er will. Senkrecht = Seite
    // scrollt ganz normal, waagrecht = Nadel ziehen, kurz tippen = Stufe wählen.
    let pending = false, sx = 0, sy = 0;
    const startDrag = (e) => {
      dragging = true; dialHost.classList.add('is-dragging');
      try { dialHost.setPointerCapture(e.pointerId); } catch (_) {}
      onMove(e);
    };
    const onGauge = (x, y) => {
      const p = g.pivotOnScreen(), k = g.svg.getScreenCTM().a;
      const r = Math.hypot(x - p.x, y - p.y) / k;
      return r > 40 && r < 240 && y < p.y + 30 * k;
    };
    dialHost.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return startDrag(e);
      pending = true; sx = e.clientX; sy = e.clientY;
    });
    dialHost.addEventListener('pointermove', (e) => {
      if (dragging) return onMove(e);
      if (!pending) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 8) return;
      pending = false;
      if (Math.abs(dx) > Math.abs(dy)) startDrag(e);
    });
    const end = () => { if (!dragging) return; dragging = false; dialHost.classList.remove('is-dragging'); select(active); };
    dialHost.addEventListener('pointerup', (e) => {
      if (pending) {
        pending = false;
        if (onGauge(e.clientX, e.clientY)) { const n = nearest(angleTo(g, e.clientX, e.clientY)); select(n); buzz(10); }
        return;
      }
      end();
    });
    dialHost.addEventListener('pointercancel', () => { pending = false; end(); });

    // Beim ersten Sichtkontakt einmal "hochdrehen" und zurück
    new IntersectionObserver((entries, io) => {
      if (!entries[0].isIntersecting || demoDone) return;
      demoDone = true; io.disconnect();
      if (reduced) { needle.target = STOPS[0]; return; }
      setTimeout(() => { if (!dragging) needle.target = 8; }, 350);
      setTimeout(() => { if (!dragging) needle.target = STOPS[active]; }, 1150);
    }, { threshold: 0.6 }).observe(dialHost);
  }

  /* ---------------------------------------------------------
     3) Mini-Tacho: Scroll-Fortschritt, Klick = nach oben
  --------------------------------------------------------- */
  const sgBtn = document.querySelector('[data-scroll-gauge]');
  if (sgBtn && P) {
    const g = buildGauge(sgBtn, { track: true, dim: false });
    const s = new Spring(0, { stiffness: 120, damping: 18 });
    let sgShown = false;
    const progress = () => clamp(window.scrollY / (document.documentElement.scrollHeight - innerHeight || 1), 0, 1);
    tickers.add((dt) => {
      s.target = progress();
      const p = s.step(dt);
      g.setDraw(p); g.setAngle(180 - 180 * p);
      const show = window.scrollY > innerHeight * 0.6;
      if (show !== sgShown) { sgShown = show; sgBtn.classList.toggle('is-visible', show); }
    });
    sgBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
  }

  /* ---------------------------------------------------------
     4) Eigener Cursor (nur Maus): Punkt + nachziehender Ring
  --------------------------------------------------------- */
  const cursor = document.querySelector('.cursor');
  if (cursor && finePointer && !reduced) {
    document.documentElement.classList.add('has-cursor');
    const dot = cursor.querySelector('.cursor__dot'), ring = cursor.querySelector('.cursor__ring');
    let mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      cursor.classList.remove('is-hidden');
      const t = e.target.closest?.('a, button, [data-dial-gauge]');
      cursor.classList.toggle('is-link', !!t && !t.matches('[data-dial-gauge]'));
      cursor.classList.toggle('is-drag', !!t && t.matches('[data-dial-gauge]'));
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
    tickers.add((dt) => {
      const k = 1 - Math.pow(0.0001, dt * 1.2);
      rx = lerp(rx, mx, k); ry = lerp(ry, my, k);
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
    });
  }

  /* ---------------------------------------------------------
     5) Magnetische Buttons + Licht, das dem Zeiger folgt
  --------------------------------------------------------- */
  if (finePointer && !reduced) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const sx = new Spring(0, { stiffness: 200, damping: 16 }), sy = new Spring(0, { stiffness: 200, damping: 16 });
      let active = false;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        sx.target = (e.clientX - (r.left + r.width / 2)) * 0.3;
        sy.target = (e.clientY - (r.top + r.height / 2)) * 0.4;
        el.style.setProperty('--glow-x', `${e.clientX - r.left}px`);
        el.style.setProperty('--glow-y', `${e.clientY - r.top}px`);
        active = true;
      });
      el.addEventListener('pointerleave', () => { sx.target = 0; sy.target = 0; });
      tickers.add((dt) => {
        if (!active) return;
        el.style.translate = `${sx.step(dt).toFixed(2)}px ${sy.step(dt).toFixed(2)}px`;
        if (sx.resting && sy.resting && sx.target === 0) active = false;
      });
    });
  }

  // Am Handy: das Licht im Button sitzt da, wo der Finger tippt
  if (!finePointer) {
    document.querySelectorAll('.btn').forEach((el) => {
      let t;
      el.addEventListener('pointerdown', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--glow-x', `${e.clientX - r.left}px`);
        el.style.setProperty('--glow-y', `${e.clientY - r.top}px`);
        clearTimeout(t); el.classList.add('is-pressed');
      });
      const off = () => { clearTimeout(t); t = setTimeout(() => el.classList.remove('is-pressed'), 220); };
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, off));
    });
  }

  /* ---------------------------------------------------------
     6) Porträt: leichte 3D-Neigung mit Lichtreflex
  --------------------------------------------------------- */
  if (finePointer && !reduced) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      const rx = new Spring(0, { stiffness: 120, damping: 14 }), ry = new Spring(0, { stiffness: 120, damping: 14 });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        ry.target = (px - 0.5) * 10; rx.target = (0.5 - py) * 8;
        el.style.setProperty('--lx', `${px * 100}%`); el.style.setProperty('--ly', `${py * 100}%`); el.style.setProperty('--lo', 1);
      });
      el.addEventListener('pointerleave', () => { rx.target = 0; ry.target = 0; el.style.setProperty('--lo', 0); });
      tickers.add((dt) => {
        const a = rx.step(dt), b = ry.step(dt);
        if (el.classList.contains('is-in')) el.style.transform = `perspective(1000px) rotateX(${a.toFixed(2)}deg) rotateY(${b.toFixed(2)}deg)`;
      });
    });
  } else if (!reduced) {
    // Handy: Das Bild kippt beim Scrollen leicht mit, der Lichtreflex wandert drüber.
    // Mit dem Finger drauf: es folgt dem Finger wie am Laptop der Maus.
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      const rx = new Spring(0, { stiffness: 90, damping: 14 }), ry = new Spring(0, { stiffness: 90, damping: 14 });
      let finger = null;
      const fingerAt = (e) => {
        const t = e.touches[0]; if (!t) return;
        const r = el.getBoundingClientRect();
        finger = { x: clamp((t.clientX - r.left) / r.width, 0, 1), y: clamp((t.clientY - r.top) / r.height, 0, 1) };
      };
      el.addEventListener('touchstart', fingerAt, { passive: true });
      el.addEventListener('touchmove', fingerAt, { passive: true });
      el.addEventListener('touchend', () => { finger = null; }, { passive: true });
      el.addEventListener('touchcancel', () => { finger = null; }, { passive: true });
      watch(el);
      el.style.setProperty('--lo', 1);
      let readyAt = 0; // erst kippen, wenn das Einblenden fertig ist
      tickers.add((dt, now) => {
        if (!el.classList.contains('is-in')) return;
        if (!readyAt) readyAt = now + 1150;
        if (now < readyAt) return;
        if (el.style.transition !== 'opacity .9s') el.style.transition = 'opacity .9s';
        if (!visible.get(el) && rx.resting && ry.resting) return;
        let lx, ly;
        if (finger) {
          ry.target = (finger.x - 0.5) * 12; rx.target = (0.5 - finger.y) * 10;
          lx = finger.x; ly = finger.y;
        } else {
          const r = el.getBoundingClientRect();
          const c = clamp((r.top + r.height / 2) / innerHeight, -0.5, 1.5); // 0 = oben, 1 = unten
          const k = clamp((c - 0.5) * 2, -1, 1);
          rx.target = k * 6; ry.target = k * -2.5;
          lx = 0.35 + k * 0.25; ly = clamp(1 - c, 0, 1);
        }
        const a = rx.step(dt), b = ry.step(dt);
        el.style.setProperty('--lx', `${(lx * 100).toFixed(1)}%`);
        el.style.setProperty('--ly', `${(ly * 100).toFixed(1)}%`);
        el.style.transform = `perspective(900px) rotateX(${a.toFixed(2)}deg) rotateY(${b.toFixed(2)}deg)`;
      });
    });
  }

  /* ---------------------------------------------------------
     7) Laufband: läuft ruhig, Scrollen gibt Gas (und Richtung)
  --------------------------------------------------------- */
  const track = document.querySelector('[data-marquee]');
  if (track) {
    track.innerHTML += track.innerHTML; // doppelt für nahtlose Schleife
    let x = 0, dir = -1, boost = 0, lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const d = window.scrollY - lastY; lastY = window.scrollY;
      if (d) dir = d > 0 ? -1 : 1;
      boost = clamp(boost + Math.abs(d) * 0.6, 0, 900);
    }, { passive: true });
    tickers.add((dt) => {
      if (reduced) return;
      boost *= Math.pow(0.04, dt);
      x += dir * (45 + boost) * dt;
      const w = track.scrollWidth / 2;
      if (x <= -w) x += w; if (x > 0) x -= w;
      track.style.transform = `translate3d(${x}px,0,0)`;
    });
  }

  /* ---------------------------------------------------------
     8) Ablauf: der Punkt wandert beim Scrollen die Linie
        entlang, jeder Schritt leuchtet auf, wenn er ankommt
  --------------------------------------------------------- */
  const steps = document.querySelector('[data-steps]');
  if (steps) {
    const dot = document.createElement('span'); dot.className = 'steps__dot'; dot.setAttribute('aria-hidden', 'true');
    steps.prepend(dot);
    const items = [...steps.querySelectorAll('.step')];
    const pos = new Spring(0, { stiffness: 140, damping: 22 });
    let tops = [];
    const measure = () => { tops = items.map((it) => it.offsetTop); };
    measure(); window.addEventListener('resize', measure); window.addEventListener('load', measure);
    document.fonts?.ready.then(measure);
    watch(steps);
    tickers.add((dt) => {
      if (!visible.get(steps) && pos.resting) return;
      const r = steps.getBoundingClientRect();
      const len = r.height - 19; // Linie ohne Anfang/Ende
      // Die Linie füllt sich bis zur Bildschirmmitte
      pos.target = clamp(innerHeight * 0.55 - (r.top + 10), 0, len);
      const y = pos.step(dt);
      steps.style.setProperty('--fill', (y / len).toFixed(4));
      dot.style.setProperty('--dot-y', `${y.toFixed(1)}px`);
      items.forEach((it, i) => {
        const top = tops[i]; // Oberkante relativ zur Liste
        it.style.setProperty('--o', clamp(0.2 + ((y - top + 30) / 60) * 0.8, 0.2, 1).toFixed(3));
      });
    });
  }

  /* ---------------------------------------------------------
     9) Scroll-Reveal
  --------------------------------------------------------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in'); io.unobserve(en.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    // Geschwister nacheinander einblenden
    const sib = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
    el.style.transitionDelay = `${Math.min(sib.indexOf(el), 5) * 0.08}s`;
    io.observe(el);
  });

  /* ---------------------------------------------------------
     10) Navigation: Hintergrund beim Scrollen, versteckt sich
         beim Runterscrollen, aktiver Abschnitt markiert
  --------------------------------------------------------- */
  const nav = document.querySelector('[data-nav]');
  let lastScroll = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 20);
    const menuOpen = document.body.classList.contains('menu-open');
    nav.classList.toggle('is-hidden', !menuOpen && y > innerHeight * 0.8 && y > lastScroll);
    lastScroll = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const links = [...document.querySelectorAll('.nav__link')];
  const secIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((l) => l.classList.toggle('is-current', l.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach((s) => secIO.observe(s));

  /* ---------------------------------------------------------
     11) Mobiles Menü
  --------------------------------------------------------- */
  const burger = document.querySelector('.nav__burger');
  const drawer = document.querySelector('[data-drawer]');
  function setMenu(open) {
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    document.body.classList.toggle('menu-open', open);
    document.documentElement.classList.toggle('menu-open', open);
    if (open) { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('is-open')); }
    else { drawer.classList.remove('is-open'); setTimeout(() => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; }, 700); }
  }
  burger?.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  drawer?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && burger?.getAttribute('aria-expanded') === 'true') setMenu(false); });

  /* ---------------------------------------------------------
     12) E-Mail-Adresse kopieren
  --------------------------------------------------------- */
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.querySelector('[data-copy-label]');
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); }
      catch {
        const r = document.createRange(); r.selectNodeContents(btn.querySelector('.copy-mail__addr'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy');
      }
      btn.classList.add('is-copied'); label.textContent = 'Kopiert';
      setTimeout(() => { btn.classList.remove('is-copied'); label.textContent = 'Kopieren'; }, 2000);
    });
  });
})();
