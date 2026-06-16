/* =========================================================
   ELIX — interactions, animations, like & cart system
   ========================================================= */
(() => {
  'use strict';

  /* -------------------------------------------------------
     1. SVG RACKET GENERATOR
     Generates a unique padel racket illustration per product
  ------------------------------------------------------- */
  const HEADS = {
    ronde:   'M120 46 C 64 46,22 96,22 156 C 22 224,70 270,120 270 C 170 270,218 224,218 156 C 218 96,176 46,120 46 Z',
    larme:   'M120 46 C 70 46,26 92,26 150 C 26 212,86 252,120 292 C 154 252,214 212,214 150 C 214 92,170 46,120 46 Z',
    diamant: 'M120 40 Q 150 70,196 120 Q 218 150,196 196 Q 156 256,120 292 Q 84 256,44 196 Q 22 150,44 120 Q 90 70,120 40 Z'
  };

  function racketSVG(opt) {
    const {
      shape = 'diamant',
      frame = ['#4d8bff', '#2f6bff'],
      face  = ['#1c1c28', '#0a0a12'],
      grip  = '#101018',
      accent = '#2f6bff',
      id = 'r'
    } = opt;
    const head = HEADS[shape] || HEADS.diamant;

    // Perforated holes
    let holes = '';
    for (let y = 80; y <= 248; y += 21) {
      const off = ((y - 80) / 21) % 2 === 0 ? 0 : 10.5;
      for (let x = 50 + off; x <= 190; x += 21) {
        holes += `<circle cx="${x.toFixed(0)}" cy="${y}" r="5.4"/>`;
      }
    }

    // Grip wrap diagonal lines
    let grips = '';
    for (let i = -2; i < 12; i++) {
      const x = 90 + i * 14;
      grips += `<line x1="${x}" y1="356" x2="${x - 30}" y2="528" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>`;
    }

    return `
<svg viewBox="0 0 240 545" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <linearGradient id="face-${id}" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${face[0]}"/>
      <stop offset="1" stop-color="${face[1]}"/>
    </linearGradient>
    <linearGradient id="frame-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${frame[0]}"/>
      <stop offset="1" stop-color="${frame[1]}"/>
    </linearGradient>
    <linearGradient id="grip-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${grip}"/>
      <stop offset="1" stop-color="#05050a"/>
    </linearGradient>
    <radialGradient id="sheen-${id}" cx="0.35" cy="0.25" r="0.7">
      <stop offset="0" stop-color="rgba(255,255,255,0.22)"/>
      <stop offset="0.5" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <clipPath id="clip-${id}"><path d="${head}"/></clipPath>
  </defs>

  <!-- Throat / bridge -->
  <path d="M86 262 L74 366 L166 366 L154 262 Z M108 280 L99 356 L141 356 L132 280 Z"
        fill="url(#frame-${id})" fill-rule="evenodd"/>

  <!-- Handle -->
  <rect x="97" y="356" width="46" height="170" rx="15" fill="url(#grip-${id})" stroke="${frame[1]}" stroke-width="1.5"/>
  <g clip-path="url(#cliphandle-${id})">${grips}</g>
  <clipPath id="cliphandle-${id}"><rect x="97" y="356" width="46" height="170" rx="15"/></clipPath>
  <rect x="91" y="506" width="58" height="24" rx="9" fill="url(#frame-${id})"/>
  <rect x="91" y="506" width="58" height="9" rx="4" fill="rgba(255,255,255,0.12)"/>

  <!-- Face -->
  <path d="${head}" fill="url(#face-${id})"/>
  <!-- Holes -->
  <g clip-path="url(#clip-${id})" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.07)" stroke-width="1">${holes}</g>
  <!-- Sheen -->
  <path d="${head}" fill="url(#sheen-${id})"/>
  <!-- Frame outline -->
  <path d="${head}" fill="none" stroke="url(#frame-${id})" stroke-width="9"/>
  <path d="${head}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.4"/>

  <!-- Brand emblem -->
  <circle cx="120" cy="120" r="20" fill="none" stroke="${accent}" stroke-width="2"/>
  <text x="120" y="128" text-anchor="middle" font-family="Syne, sans-serif" font-weight="800"
        font-size="22" fill="${accent}">E</text>
  <text x="120" y="220" text-anchor="middle" font-family="Syne, sans-serif" font-weight="700"
        letter-spacing="3" font-size="13" fill="rgba(255,255,255,0.45)">ELIX</text>
</svg>`;
  }

  /* -------------------------------------------------------
     2. PRODUCTS DATA
  ------------------------------------------------------- */
  const PRODUCTS = [
    { id: 'vortex',  name: 'Vortex Pro',  cat: 'Diamant · Puissance', shape: 'diamant', price: 349, old: null, rating: 5, reviews: 214, isNew: true,
      specs: ['Carbone 18K', '365 g', 'Équilibre haut'],
      svg: { shape: 'diamant', frame: ['#4d8bff', '#2f6bff'], face: ['#161622', '#08080f'], accent: '#4d8bff', id: 'vortex' } },

    { id: 'shadow',  name: 'Shadow X',    cat: 'Larme · Polyvalence', shape: 'larme', price: 289, old: 329, rating: 5, reviews: 178, isNew: false,
      specs: ['Carbone 12K', '360 g', 'Équilibre médian'],
      svg: { shape: 'larme', frame: ['#f4f5fa', '#b9bcc9'], face: ['#15151e', '#070710'], accent: '#ffffff', id: 'shadow' } },

    { id: 'frost',   name: 'Frost Edge',  cat: 'Ronde · Contrôle', shape: 'ronde', price: 229, old: null, rating: 4, reviews: 142, isNew: false,
      specs: ['Fibre verre', '355 g', 'Équilibre bas'],
      svg: { shape: 'ronde', frame: ['#dfe4ee', '#9aa3b8'], face: ['#1a1f2e', '#0a0c14'], accent: '#9fb4ff', id: 'frost' } },

    { id: 'storm',   name: 'Storm Elite', cat: 'Diamant · Puissance', shape: 'diamant', price: 399, old: null, rating: 5, reviews: 96, isNew: true,
      specs: ['Carbone 24K', '370 g', 'Équilibre haut'],
      svg: { shape: 'diamant', frame: ['#2f6bff', '#143a9e'], face: ['#0f1830', '#05060f'], accent: '#4d8bff', id: 'storm' } },

    { id: 'pulse',   name: 'Pulse Air',   cat: 'Larme · Polyvalence', shape: 'larme', price: 259, old: null, rating: 4, reviews: 203, isNew: false,
      specs: ['Hybride Aero', '358 g', 'Équilibre médian'],
      svg: { shape: 'larme', frame: ['#5e9bff', '#2f6bff'], face: ['#101a30', '#070b16'], accent: '#6ea3ff', id: 'pulse' } },

    { id: 'titan',   name: 'Titan Force', cat: 'Diamant · Puissance', shape: 'diamant', price: 449, old: 499, rating: 5, reviews: 67, isNew: false,
      specs: ['Carbone Aero', '375 g', 'Équilibre haut'],
      svg: { shape: 'diamant', frame: ['#ffffff', '#c7ccd9'], face: ['#13131d', '#06060d'], accent: '#2f6bff', id: 'titan' } }
  ];

  const euro = n => n.toLocaleString('fr-FR') + ' €';
  const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

  /* -------------------------------------------------------
     3. STATE (likes + cart) with persistence
  ------------------------------------------------------- */
  const store = {
    likes: new Set(JSON.parse(localStorage.getItem('elix_likes') || '[]')),
    cart: JSON.parse(localStorage.getItem('elix_cart') || '{}'),
    save() {
      localStorage.setItem('elix_likes', JSON.stringify([...this.likes]));
      localStorage.setItem('elix_cart', JSON.stringify(this.cart));
    }
  };

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* -------------------------------------------------------
     4. RENDER PRODUCTS
  ------------------------------------------------------- */
  const grid = $('#productGrid');

  function productCard(p, i) {
    const liked = store.likes.has(p.id);
    return `
    <article class="card reveal" data-shape="${p.shape}" data-id="${p.id}" style="--d:${i * 0.07}s">
      <div class="card__media">
        ${p.isNew ? '<span class="card__badge-new">Nouveau</span>' : ''}
        <span class="card__shape-tag">${p.shape}</span>
        <button class="like ${liked ? 'is-liked' : ''}" data-like="${p.id}" data-cursor="hover" aria-label="Ajouter aux favoris">
          <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.2C.3 8.4 1.7 4.7 5.2 4.1 7.4 3.7 9.3 4.9 12 7.6c2.7-2.7 4.6-3.9 6.8-3.5 3.5.6 4.9 4.3 3.2 7.7C19.5 16.4 12 21 12 21Z"/></svg>
        </button>
        ${racketSVG(p.svg)}
      </div>
      <div class="card__body">
        <div class="card__top">
          <div>
            <h3 class="card__name">${p.name}</h3>
            <p class="card__cat">${p.cat}</p>
          </div>
          <div class="card__price">${euro(p.price)}${p.old ? `<span class="old">${euro(p.old)}</span>` : ''}</div>
        </div>
        <div class="card__rating"><span class="stars">${stars(p.rating)}</span><span>${p.rating}.0 · ${p.reviews} avis</span></div>
        <div class="card__specs">${p.specs.map(s => `<span class="spec">${s}</span>`).join('')}</div>
        <button class="card__add" data-add="${p.id}" data-cursor="hover">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span>Ajouter au panier</span>
        </button>
      </div>
    </article>`;
  }

  grid.innerHTML = PRODUCTS.map(productCard).join('');

  /* -------------------------------------------------------
     5. LIKE SYSTEM
  ------------------------------------------------------- */
  const likeCountEl = $('#likeCount');
  const likeNav = $('#likeNav');

  function refreshLikes(animate = false) {
    const n = store.likes.size;
    likeCountEl.textContent = n;
    likeCountEl.classList.toggle('show', n > 0);
    if (animate) { likeNav.classList.remove('pulse'); void likeNav.offsetWidth; likeNav.classList.add('pulse'); }
  }

  grid.addEventListener('click', e => {
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) {
      const id = likeBtn.dataset.like;
      if (store.likes.has(id)) { store.likes.delete(id); likeBtn.classList.remove('is-liked'); }
      else { store.likes.add(id); likeBtn.classList.add('is-liked'); toast('Ajouté aux favoris', '♥'); }
      store.save(); refreshLikes(true);
    }
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      addToCart(addBtn.dataset.add);
      addBtn.classList.add('added');
      const span = addBtn.querySelector('span'); const old = span.textContent;
      span.textContent = '✓ Ajouté';
      setTimeout(() => { addBtn.classList.remove('added'); span.textContent = old; }, 1300);
    }
  });

  /* -------------------------------------------------------
     6. CART SYSTEM
  ------------------------------------------------------- */
  const cartDrawer  = $('#cartDrawer');
  const overlay     = $('#drawerOverlay');
  const cartItemsEl = $('#cartItems');
  const cartCountEl = $('#cartCount');
  const drawerCount = $('#drawerCount');
  const cartTotalEl = $('#cartTotal');
  const cartEmpty   = $('#cartEmpty');
  const cartFoot    = $('#cartFoot');
  const cartNav     = $('#cartNav');

  const getProduct = id => PRODUCTS.find(p => p.id === id);
  const cartQtyTotal = () => Object.values(store.cart).reduce((a, b) => a + b, 0);

  function addToCart(id) {
    store.cart[id] = (store.cart[id] || 0) + 1;
    store.save(); renderCart(); refreshCartBadge(true);
    toast(`${getProduct(id).name} ajoutée au panier`, '✓');
  }

  function changeQty(id, delta) {
    store.cart[id] = (store.cart[id] || 0) + delta;
    if (store.cart[id] <= 0) removeFromCart(id);
    else { store.save(); renderCart(); refreshCartBadge(); }
  }

  function removeFromCart(id) {
    const row = cartItemsEl.querySelector(`[data-row="${id}"]`);
    if (row) {
      row.classList.add('removing');
      setTimeout(() => { delete store.cart[id]; store.save(); renderCart(); refreshCartBadge(); }, 320);
    } else { delete store.cart[id]; store.save(); renderCart(); refreshCartBadge(); }
  }

  function refreshCartBadge(animate = false) {
    const n = cartQtyTotal();
    cartCountEl.textContent = n;
    cartCountEl.classList.toggle('show', n > 0);
    if (animate) { cartNav.classList.remove('pulse'); void cartNav.offsetWidth; cartNav.classList.add('pulse'); }
  }

  function renderCart() {
    const ids = Object.keys(store.cart);
    const total = ids.reduce((sum, id) => sum + getProduct(id).price * store.cart[id], 0);
    drawerCount.textContent = `(${cartQtyTotal()})`;
    cartTotalEl.textContent = euro(total);

    if (!ids.length) {
      cartItemsEl.innerHTML = '';
      cartEmpty.classList.add('show');
      cartFoot.classList.add('hide');
      return;
    }
    cartEmpty.classList.remove('show');
    cartFoot.classList.remove('hide');

    cartItemsEl.innerHTML = ids.map(id => {
      const p = getProduct(id); const qty = store.cart[id];
      return `
      <div class="cart-item" data-row="${id}">
        <div class="cart-item__img">${racketSVG({ ...p.svg, id: 'cart-' + p.id })}</div>
        <div>
          <p class="cart-item__name">${p.name}</p>
          <p class="cart-item__cat">${p.cat}</p>
          <div class="qty">
            <button data-dec="${id}" aria-label="Moins">−</button>
            <span>${qty}</span>
            <button data-inc="${id}" aria-label="Plus">+</button>
          </div>
        </div>
        <div class="cart-item__right">
          <span class="cart-item__price">${euro(p.price * qty)}</span>
          <button class="cart-item__remove" data-rm="${id}">Retirer</button>
        </div>
      </div>`;
    }).join('');
  }

  cartItemsEl.addEventListener('click', e => {
    const inc = e.target.closest('[data-inc]'); const dec = e.target.closest('[data-dec]'); const rm = e.target.closest('[data-rm]');
    if (inc) changeQty(inc.dataset.inc, +1);
    if (dec) changeQty(dec.dataset.dec, -1);
    if (rm)  removeFromCart(rm.dataset.rm);
  });

  function openCart() { cartDrawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeCart() { cartDrawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }

  cartNav.addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);
  $('#emptyShop').addEventListener('click', () => { closeCart(); $('#collection').scrollIntoView({ behavior: 'smooth' }); });
  $('#checkout').addEventListener('click', () => {
    toast('Commande confirmée — merci ! 🎾', '✓');
    store.cart = {}; store.save(); renderCart(); refreshCartBadge();
    setTimeout(closeCart, 900);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

  // Likes nav -> scroll to collection
  likeNav.addEventListener('click', () => $('#collection').scrollIntoView({ behavior: 'smooth' }));

  /* -------------------------------------------------------
     7. TOAST
  ------------------------------------------------------- */
  const toastEl = $('#toast'); let toastTimer;
  function toast(msg, icon = '✓') {
    toastEl.innerHTML = `<span class="toast__icon">${icon}</span><span>${msg}</span>`;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* -------------------------------------------------------
     8. FILTERS
  ------------------------------------------------------- */
  $('#filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter'); if (!btn) return;
    $$('.filter').forEach(f => f.classList.remove('is-active'));
    btn.classList.add('is-active');
    const f = btn.dataset.filter;
    $$('.card', grid).forEach((card, i) => {
      const match = f === 'all' || card.dataset.shape === f;
      card.classList.toggle('hide', !match);
      if (match) { card.style.setProperty('--d', (i * 0.05) + 's'); card.classList.remove('in'); requestAnimationFrame(() => card.classList.add('in')); }
    });
  });

  /* -------------------------------------------------------
     9. INJECT HERO / ABOUT RACKETS
  ------------------------------------------------------- */
  $('#heroRacket').innerHTML  = racketSVG({ shape: 'diamant', frame: ['#4d8bff', '#2f6bff'], face: ['#14141f', '#070710'], accent: '#4d8bff', id: 'hero' });
  $('#aboutRacket').innerHTML = racketSVG({ shape: 'larme',   frame: ['#f4f5fa', '#aeb3c2'], face: ['#13131d', '#06060d'], accent: '#2f6bff', id: 'about' });

  /* -------------------------------------------------------
     10. SCROLL REVEAL
  ------------------------------------------------------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  // Hero content is above the fold and its title words live inside overflow:hidden
  // masks (which would read as 0% visible to the observer). Reveal it on load instead.
  $$('.reveal, .reveal-word').forEach(el => { if (!el.closest('.hero')) io.observe(el); });

  /* -------------------------------------------------------
     11. ANIMATED COUNTERS
  ------------------------------------------------------- */
  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target; const target = +el.dataset.count; const dur = 1400; const t0 = performance.now();
      const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      counterIO.unobserve(el);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach(el => counterIO.observe(el));

  /* -------------------------------------------------------
     12. NAVBAR scroll + mobile menu
  ------------------------------------------------------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 30);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  const burger = $('#burger'); const navLinks = $('#navLinks');
  burger.addEventListener('click', () => { burger.classList.toggle('open'); navLinks.classList.toggle('open'); });
  $$('#navLinks a').forEach(a => a.addEventListener('click', () => { burger.classList.remove('open'); navLinks.classList.remove('open'); }));

  /* -------------------------------------------------------
     13. CARD glow follow
  ------------------------------------------------------- */
  grid.addEventListener('pointermove', e => {
    const card = e.target.closest('.card'); if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  /* -------------------------------------------------------
     14. CUSTOM CURSOR
  ------------------------------------------------------- */
  const cursor = $('.cursor'); const dot = $('.cursor-dot');
  if (cursor && matchMedia('(hover: hover)').matches) {
    let cx = 0, cy = 0, tx = 0, ty = 0;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; dot.style.transform = `translate(${tx}px,${ty}px) translate(-50%,-50%)`; });
    const loop = () => { cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18; cursor.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`; requestAnimationFrame(loop); };
    loop();
    document.addEventListener('pointerover', e => { if (e.target.closest('[data-cursor="hover"]')) cursor.classList.add('is-hover'); });
    document.addEventListener('pointerout', e => { if (e.target.closest('[data-cursor="hover"]')) cursor.classList.remove('is-hover'); });
  }

  /* -------------------------------------------------------
     15. NEWSLETTER
  ------------------------------------------------------- */
  $('#newsletter').addEventListener('submit', e => {
    e.preventDefault();
    e.target.reset();
    $('#newsletterNote').hidden = false;
    toast('Inscription confirmée ✦', '✓');
  });

  /* -------------------------------------------------------
     16. LOADER + initial hero racket reveal
  ------------------------------------------------------- */
  function revealHero() {
    $('#heroRacket').classList.add('in');
    $$('.hero .reveal, .hero__title .reveal-word').forEach((el, i) => {
      setTimeout(() => el.classList.add('in'), 120 + i * 85);
    });
  }
  window.addEventListener('load', () => {
    setTimeout(() => $('#loader').classList.add('is-done'), 1400);
    setTimeout(revealHero, 1450); // animate hero in as the loader fades
  });
  // Fallback if 'load' already fired or is slow
  if (document.readyState === 'complete') { setTimeout(() => { $('#loader').classList.add('is-done'); revealHero(); }, 1400); }

  // init
  refreshLikes(); refreshCartBadge(); renderCart();
})();
