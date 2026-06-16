/* =========================================================
   ELIX — interactions, animations, like & cart system
   ========================================================= */
(() => {
  'use strict';

  /* -------------------------------------------------------
     1. PRODUCTS DATA  (real padel racket photos in assets/products)
  ------------------------------------------------------- */
  const PRODUCTS = [
    { id: 'vortex', name: 'Vortex Pro',  cat: 'Diamant · Puissance', shape: 'diamant', price: 349, old: null, rating: 5, reviews: 214, isNew: true,
      specs: ['Carbone 18K', '365 g', 'Équilibre haut'],   img: 'assets/products/vortex.jpg' },

    { id: 'shadow', name: 'Shadow X',    cat: 'Larme · Polyvalence', shape: 'larme',   price: 289, old: 329,  rating: 5, reviews: 178, isNew: false,
      specs: ['Carbone 12K', '360 g', 'Équilibre médian'], img: 'assets/products/shadow.jpg' },

    { id: 'frost',  name: 'Frost Edge',  cat: 'Ronde · Contrôle',    shape: 'ronde',   price: 229, old: null, rating: 4, reviews: 142, isNew: false,
      specs: ['Fibre verre', '355 g', 'Équilibre bas'],    img: 'assets/products/frost.jpg' },

    { id: 'storm',  name: 'Storm Elite', cat: 'Diamant · Puissance', shape: 'diamant', price: 399, old: null, rating: 5, reviews: 96,  isNew: true,
      specs: ['Carbone 24K', '370 g', 'Équilibre haut'],   img: 'assets/products/storm.jpg' },

    { id: 'pulse',  name: 'Pulse Air',   cat: 'Larme · Polyvalence', shape: 'larme',   price: 259, old: null, rating: 4, reviews: 203, isNew: false,
      specs: ['Hybride Aero', '358 g', 'Équilibre médian'], img: 'assets/products/pulse.jpg' },

    { id: 'titan',  name: 'Titan Force', cat: 'Diamant · Puissance', shape: 'diamant', price: 449, old: 499,  rating: 5, reviews: 67,  isNew: false,
      specs: ['Carbone Aero', '375 g', 'Équilibre haut'],  img: 'assets/products/titan.jpg' }
  ];

  const euro = n => n.toLocaleString('fr-FR') + ' €';
  const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

  /* -------------------------------------------------------
     2. STATE (likes + cart) with persistence
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
     3. RENDER PRODUCTS
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
        <img class="card__img" src="${p.img}" alt="Raquette de padel ELIX ${p.name}" loading="lazy" decoding="async" />
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
     4. LIKE SYSTEM
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
     5. CART SYSTEM
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
        <div class="cart-item__img"><img src="${p.img}" alt="${p.name}" loading="lazy"></div>
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
     6. TOAST
  ------------------------------------------------------- */
  const toastEl = $('#toast'); let toastTimer;
  function toast(msg, icon = '✓') {
    toastEl.innerHTML = `<span class="toast__icon">${icon}</span><span>${msg}</span>`;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* -------------------------------------------------------
     7. FILTERS
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
     8. SCROLL REVEAL
  ------------------------------------------------------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  // Hero content is above the fold and its title words live inside overflow:hidden
  // masks (which would read as 0% visible to the observer). Reveal it on load instead.
  $$('.reveal, .reveal-word').forEach(el => { if (!el.closest('.hero')) io.observe(el); });

  /* -------------------------------------------------------
     9. ANIMATED COUNTERS
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
     10. NAVBAR scroll + mobile menu
  ------------------------------------------------------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 30);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  const burger = $('#burger'); const navLinks = $('#navLinks');
  burger.addEventListener('click', () => { burger.classList.toggle('open'); navLinks.classList.toggle('open'); });
  $$('#navLinks a').forEach(a => a.addEventListener('click', () => { burger.classList.remove('open'); navLinks.classList.remove('open'); }));

  /* -------------------------------------------------------
     11. CARD glow follow
  ------------------------------------------------------- */
  grid.addEventListener('pointermove', e => {
    const card = e.target.closest('.card'); if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  /* -------------------------------------------------------
     12. CUSTOM CURSOR
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
     13. NEWSLETTER
  ------------------------------------------------------- */
  $('#newsletter').addEventListener('submit', e => {
    e.preventDefault();
    e.target.reset();
    $('#newsletterNote').hidden = false;
    toast('Inscription confirmée ✦', '✓');
  });

  /* -------------------------------------------------------
     14. LOADER + hero reveal
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
