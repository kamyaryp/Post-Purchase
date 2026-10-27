(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * States (Figma "Order Tracking Screens", 13 frames)
   *
   * Main flow — one 45-minute countdown drives it, split into five equal
   * phases; when a phase ends the flow moves on by itself:
   *   awaiting → preparing → finding → toStore → out → confirmDelivery
   * When the countdown reaches 00:00 the ring fills ("expired") and the
   * customer is asked to confirm delivery; "تحویل گرفتم" → delivered,
   * "تحویل نگرفتم" → support follow-up.
   *
   * Exceptions (replace, replaceConfirm, payment, support, cancelled,
   * returned) hold the clock and show a static status dial. They are
   * reached from the State picker or from the actions on the cards.
   * Add ?speed=60 to the URL to run the countdown 60× faster.
   * ------------------------------------------------------------------ */
  const TOTAL = 45 * 60;
  const FLOW = ["awaiting", "preparing", "finding", "toStore", "out"];
  const PHASE = TOTAL / FLOW.length;
  const START = Object.fromEntries(FLOW.map((s, i) => [s, i * PHASE]));
  START.confirmDelivery = TOTAL;
  const ORDER = [...FLOW, "confirmDelivery", "delivered"];      // ← / → keys
  const SPEED = Math.max(0.1, Number(new URLSearchParams(location.search).get("speed")) || 1);

  // content top (px at 390 wide) — leaves the pins / route visible above the cards
  const ROUTE_GAP = 300, PIN_GAP = 220;

  const A = (icon, label, opts = {}) => ({ icon, label, ...opts });
  const STATES = {
    awaiting: { title: "در انتظار تأیید فروشگاه", gap: PIN_GAP, actions: [
      A("37455.svg", "لغو سفارش", { brand: true, brandLabel: true, go: "cancelled" }),
      A("b9c45.svg", "تغییر آدرس", { go: "confirm" }),
      A("2cf21.svg", "ویرایش سبد", { go: "replace" }),
    ] },
    preparing: { title: "در حال آماده‌سازی", gap: ROUTE_GAP, actions: "detailsSupport" },
    finding: { title: "در جستجوی پیک", gap: ROUTE_GAP, actions: "detailsSupport" },
    toStore: { title: "پیک‌ به سمت فروشگاه", gap: ROUTE_GAP, actions: "detailsSupport" },
    out: { title: "پیک‌ به سمت شما", gap: ROUTE_GAP, actions: [
      A("5b683.svg", "جزئیات سفارش", { scroll: "items" }),
      A("28322.svg", "پشتیبانی", { scroll: "supportCard" }),
      A("db0fe.svg", "تماس‌ با پیک", { brand: true, brandLabel: true }),
    ] },
    confirmDelivery: { title: "سفارش‌تان را تحویل گرفتید؟", gap: ROUTE_GAP, actions: [
      A("60197.svg", "تماس‌ با پیک"),
      A("25e9e.svg", "تحویل نگرفتم", { go: "support" }),
      A("2cf3f.svg", "تحویل گرفتم", { brand: true, go: "delivered" }),
    ] },
    delivered: { title: "سفارش تحویل داده شد", gap: PIN_GAP, dial: "44f93.svg", actions: [
      A("72362.svg", "سفارش مجدد", { go: "confirm" }),
      A("522d1.svg", "ثبت بازخورد", { brand: true }),
    ] },
    cancelled: { title: "سفارش شما لغو شد", gap: PIN_GAP, dial: "48c49.svg", actions: "detailsReorder" },
    returned: { title: "سفارش شما مرجوع شد", gap: PIN_GAP, dial: "48c49.svg", actions: "detailsReorder" },
    replace: { title: "نیاز به ویرایش", gap: PIN_GAP, dial: "cc003.svg", extra: "replace" },
    replaceConfirm: { title: "نیاز به ویرایش", gap: PIN_GAP, dial: "cc003.svg", extra: "replaceConfirm" },
    payment: { title: "در انتظار پرداخت", gap: PIN_GAP, dial: "37591.svg", extra: "payment" },
    support: { title: "در حال پیگیری وضعیت سفارش", gap: PIN_GAP, dial: "04e2e.svg", extra: "support" },
  };
  const SHARED_ACTIONS = {
    detailsSupport: [A("5b683.svg", "جزئیات سفارش", { scroll: "items" }), A("28322.svg", "پشتیبانی", { scroll: "supportCard" })],
    detailsReorder: [A("5b683.svg", "جزئیات سفارش", { scroll: "items" }), A("77afa.svg", "سفارش مجدد", { brand: true, go: "confirm" })],
  };

  /* ------------------------------------------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const device = $("#device");
  const stateSelect = $("#stateSelect");
  const body = $("#statusBody");
  const title = $("#statusTitle");
  const extra = $("#statusExtra");
  const recoEl = $("#reco");
  const dialTime = $("#dialTime");
  const dialStatic = $("#dialStatic");
  const arcEl = $("#dialArc"), arcBlur = $("#dialArcBlur");

  const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const OUT_MS = 160, IN_MS = 480;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const fmt = (sec) => faDigits(`${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const isFlow = (s) => FLOW.includes(s);

  /* ---------- clock ---------- */
  let clock = { e: 0, t: performance.now() };
  let clockPaused = false;
  const elapsed = () => (clockPaused || !isFlow(current) ? clock.e : Math.min(TOTAL, clock.e + ((performance.now() - clock.t) / 1000) * SPEED));
  const setClock = (e) => { clock = { e, t: performance.now() }; };
  const flowStateAt = (e) => (e >= TOTAL ? "confirmDelivery" : FLOW[Math.min(FLOW.length - 1, Math.floor(e / PHASE))]);

  /* ---------- status card templates ---------- */
  const actionHTML = (a) => `
    <button class="action${a.brand ? " action--brand" : ""}${a.brandLabel ? " action--brand-label" : ""}"${a.go ? ` data-go="${a.go}"` : ""}${a.scroll ? ` data-scroll="${a.scroll}"` : ""}>
      <span class="action__btn"><img src="assets/${a.icon}" alt="" /></span>
      <span class="action__label" dir="rtl">${a.label}</span>
    </button>`;
  const replItem = (img, confirm) => `
    <div class="repl__item">
      <div class="repl__content">
        <p class="repl__name" dir="rtl">پنیر دانمارکی آلیما - 300 گرم اصل دانمارکی</p>
        <div class="repl__actions">
          <button class="btn btn--icon" data-remove aria-label="حذف کالا"><img src="assets/b24c6.svg" alt="" /></button>
          ${confirm
            ? `<button class="btn btn--block" data-go="replace"><span class="btn__label" dir="rtl">جایگزینی مجدد</span><img src="assets/02656.svg" alt="" /></button>`
            : `<button class="btn btn--brand btn--block" data-go="replaceConfirm"><span class="btn__label" dir="rtl">جایگزینی</span><img src="assets/e2e73.svg" alt="" /></button>`}
        </div>
      </div>
      <div class="thumb80${confirm ? "" : " is-dim"}"><img src="assets/${img}" alt="" /><span class="qty-badge">×۲</span></div>
    </div>`;
  const notice = (text) => `<div class="notice"><p dir="rtl">${text}</p><img src="assets/3e4ab.svg" alt="" /></div>`;
  const EXTRA = {
    replace: () => `
      <div class="repl">${replItem("cd983.png")}<div class="divider"><span></span></div>${replItem("cd983.png")}</div>
      <button class="btn btn--lg btn--block-full" data-go="cancelled"><span class="btn__label" dir="rtl">لغو سفارش</span><img src="assets/4a4cc.svg" alt="" /></button>`,
    replaceConfirm: () => `
      <div class="repl">${replItem("2e09b.png", true)}<div class="divider"><span></span></div>${replItem("2e09b.png", true)}</div>
      <div class="edit-actions">
        <button class="btn btn--lg btn--block" data-go="cancelled"><span class="btn__label" dir="rtl">لغو سفارش</span><img src="assets/4a4cc.svg" alt="" /></button>
        <button class="btn btn--lg btn--brand btn--block" data-go="preparing"><span class="btn__label" dir="rtl">تایید</span><img src="assets/f4bf0.svg" alt="" /></button>
      </div>`,
    payment: () => `
      ${notice("در صورت عدم پرداخت، این سفارش تا ۱۴ دقیقه دیگر لغو خواهد شد.")}
      <button class="btn btn--lg btn--brand btn--block-full" data-go="preparing"><span class="btn__label" dir="rtl">پرداخت ۴۵۰,۰۰۰ تومان</span></button>`,
    support: () => notice("همکاران ما در حال پیگیری وضعیت سفارش هستند و به زودی با شما تماس خواهند گرفت."),
  };
  function renderExtra(name) {
    const st = STATES[name];
    if (st.extra) { extra.innerHTML = EXTRA[st.extra](); return; }
    const list = typeof st.actions === "string" ? SHARED_ACTIONS[st.actions] : st.actions;
    extra.innerHTML = `<div class="actions">${list.map(actionHTML).join("")}</div>`;
  }

  /* ---------- apply a state ---------- */
  let current = null;
  let running = false, pending = null;

  function applyState(name) {
    const st = STATES[name];
    setClock(elapsed());                         // rebase: the clock runs only in the timed flow states
    const prevStatic = device.classList.contains("is-static") ? dialStatic.getAttribute("src") : null;
    current = name;
    device.dataset.state = name;
    if (!confirmFlow.active) stateSelect.value = name;
    title.textContent = st.title;
    renderExtra(name);
    device.classList.toggle("is-static", !!st.dial);
    if (st.dial) {
      const src = `assets/${st.dial}`;
      if (dialStatic.getAttribute("src") !== src) dialStatic.setAttribute("src", src);
      if (prevStatic && prevStatic !== src) { dialStatic.classList.remove("is-swap"); void dialStatic.offsetWidth; dialStatic.classList.add("is-swap"); }
    }
    if (history.replaceState && !confirmFlow.active) history.replaceState(null, "", location.search + `#${name}`);
    radarBlips(name === "finding");
  }

  function animateHeight(el, from, to) {
    if (Math.abs(from - to) < 1) return;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: IN_MS, easing: EASE })
      .finished.then(() => { el.style.overflow = prev; });
  }

  async function transition(name, { instant = false } = {}) {
    if (name === current) return;
    if (running) { pending = name; return; }
    if (instant || current === null) { applyState(name); return; }

    running = true;
    sheet.follow(true);
    const recoWas = current === "awaiting", recoWill = name === "awaiting";

    // 1 — fade out what changes
    const outFx = { opacity: [1, 0], transform: ["none", "translateY(-6px)"] };
    const outs = [
      extra.animate(outFx, { duration: OUT_MS, easing: "ease-in", fill: "forwards" }),
      title.animate({ opacity: [1, 0], filter: ["blur(0)", "blur(4px)"] }, { duration: OUT_MS, easing: "ease-in", fill: "forwards" }),
      ...(recoWas && !recoWill ? [recoEl.animate({ opacity: [1, 0] }, { duration: OUT_MS, fill: "forwards" })] : []),
    ];
    await wait(OUT_MS);

    // 2 — swap, then morph sizes and bring in the new content
    const h0 = { body: body.offsetHeight, reco: recoEl.offsetHeight };
    if (recoWas && !recoWill) recoEl.classList.add("is-leaving");
    applyState(name);
    outs.forEach((a) => a.cancel());
    const h1 = { body: body.offsetHeight, reco: recoEl.offsetHeight };
    animateHeight(body, h0.body, h1.body);

    const collapsed = { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "-8px", opacity: 0 };
    if (recoWas && !recoWill) {
      recoEl.animate([{ height: `${h0.reco}px`, paddingTop: "8px", paddingBottom: "16px", marginTop: "0px", opacity: 0 }, collapsed], { duration: IN_MS, easing: EASE })
        .finished.then(() => recoEl.classList.remove("is-leaving"));
    } else if (recoWill && !recoWas) {
      recoEl.animate([collapsed, { height: `${h1.reco}px`, paddingTop: "8px", paddingBottom: "16px", marginTop: "0px", opacity: 1 }], { duration: IN_MS, easing: EASE });
    }
    [...extra.children].forEach((el, i) =>
      el.animate({ opacity: [0, 1], transform: ["translateY(10px) scale(.98)", "none"] }, { duration: IN_MS, delay: 60 + i * 50, easing: EASE, fill: "backwards" }));
    $$(".action", extra).forEach((el, i) =>
      el.animate({ opacity: [0, 1], transform: ["translateY(8px) scale(.9)", "none"] }, { duration: IN_MS, delay: 80 + i * 45, easing: "cubic-bezier(.34,1.4,.64,1)", fill: "backwards" }));
    title.animate({ opacity: [0, 1], filter: ["blur(4px)", "blur(0)"], transform: ["translateY(6px)", "none"] }, { duration: IN_MS, easing: EASE });

    await wait(IN_MS + 40);
    running = false;
    sheet.follow(false);
    if (pending && pending !== current) { const p = pending; pending = null; transition(p); }
    else pending = null;
  }

  /* ---------- jump to a state ---------- */
  function jump(name) {
    if (name === "confirm") { confirmFlow.start(); return; }
    confirmFlow.cancel();
    if (START[name] !== undefined) setClock(START[name]);
    else setClock(elapsed());                      // exceptions hold the clock where it is
    transition(name);
  }
  stateSelect.addEventListener("change", () => jump(stateSelect.value));
  $("#iterationSelect").addEventListener("change", (ev) => { location.href = ev.target.value; });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("select")) return;
    const i = ORDER.indexOf(current);
    if (e.key === "ArrowLeft" && i < ORDER.length - 1) jump(ORDER[i + 1]);   // RTL: left = forward
    if (e.key === "ArrowRight" && i > 0) jump(ORDER[i - 1]);
  });

  // card actions (delegated: the card is re-rendered per state)
  extra.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      const item = rm.closest(".repl__item");
      const items = $$(".repl__item", extra);
      if (items.length <= 1) { jump("cancelled"); return; }
      const h0 = body.offsetHeight;
      item.classList.add("is-removing");
      setTimeout(() => {
        const div = item.previousElementSibling?.classList.contains("divider") ? item.previousElementSibling : item.nextElementSibling;
        item.remove(); div?.remove();
        animateHeight(body, h0, body.offsetHeight);
      }, 360);
      return;
    }
    const b = e.target.closest("[data-go], [data-scroll]");
    if (!b) return;
    if (b.dataset.go) jump(b.dataset.go);
    else if (b.dataset.scroll) sheet.reveal($(`#${b.dataset.scroll}`));
  });

  /* ---------- courier on the route ---------- */
  const routeEl = $("#routeLeft"), routeDone = $("#routeDone"), courier = $("#courier");
  const ROUTE_X = 87.889, ROUTE_Y = 187.879, ROUTE_LEN = routeEl.getTotalLength();
  const COURIER_SECS = 40;                       // store → door at a steady, visible pace (× ?speed)
  const T_START = 0.1, T_PARK = 0.97;
  const PARKED = { x: 312.2, y: 207.1, a: 16.73 };   // Figma: courier waiting at the door
  let outSince = null, lastKey = "", heading = null, pos = null;
  const pt = (t) => routeEl.getPointAtLength(clamp01(t) * ROUTE_LEN);
  function moveCourier() {
    const s = current;
    if (s === "out") { if (outSince === null) outSince = performance.now(); } else outSince = null;
    let x, y, a, t = T_START;
    if (s === "confirmDelivery") ({ x, y, a } = PARKED);
    else {
      const ride = outSince === null ? 0 : ((performance.now() - outSince) / 1000) * SPEED / COURIER_SECS;
      t = s === "out" ? T_START + (T_PARK - T_START) * Math.min(1, ride) : T_START;
      const p = pt(t), d = 4 / ROUTE_LEN, p0 = pt(t - d), p1 = pt(t + d);
      x = p.x + ROUTE_X; y = p.y + ROUTE_Y;
      a = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI + 90;     // artwork faces up
    }
    // ease position and heading so jumps between states glide
    if (!pos) pos = { x, y };
    pos.x += (x - pos.x) * 0.2; pos.y += (y - pos.y) * 0.2;
    if (heading === null) heading = a;
    heading += ((((a - heading) % 360) + 540) % 360 - 180) * 0.2;
    const key = `${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${heading.toFixed(1)} ${t.toFixed(4)}`;
    if (key === lastKey) return;
    lastKey = key;
    routeDone.setAttribute("stroke-dasharray", `${t} 2`);
    routeEl.setAttribute("stroke-dasharray", `${Math.max(0, 1 - t)} 2`);
    routeEl.setAttribute("stroke-dashoffset", `${-t}`);
    courier.setAttribute("transform", `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)}) rotate(${heading.toFixed(1)})`);
  }

  /* ---------- nearby couriers blinking on the radar (finding a courier) ----------
   * Street / alley centre-lines inside the radar (x, y in map px, street angle). */
  const BLIP_SPOTS = [[172,162,15],[212,158,102],[160,182,21],[54,324,90],[66,308,111],[114,152,111],[144,280,18],[152,136,18],[44,194,18],[76,242,24],[10,222,24],[130,344,21],[152,264,24],[184,232,111],[30,140,21],[172,288,111],[98,334,15],[180,254,111],[122,124,111],[8,174,108],[178,124,18],[196,154,102],[74,324,33],[42,170,18],[60,200,18],[134,174,21],[182,276,27],[28,246,18],[150,334,108],[164,326,111],[102,316,18],[12,240,18],[44,124,18],[12,156,108],[94,264,18],[126,256,24],[78,270,111],[132,150,18],[192,204,111],[118,296,18],[10,134,21],[72,290,111],[60,150,18],[160,118,18],[28,190,18],[128,324,18],[98,290,18],[208,178,105],[60,176,18],[114,270,18],[198,280,27],[148,154,18],[144,304,18],[190,174,105],[58,236,27],[86,310,18],[84,156,12],[50,276,15],[210,198,21],[174,142,18],[102,250,24],[32,228,27],[56,340,108],[22,118,18],[168,270,27],[196,252,15],[168,304,114],[178,188,21],[40,318,24],[46,252,18],[196,188,111],[26,164,18]];
  const SVGNS = "http://www.w3.org/2000/svg";
  const blipLayer = $("#blips");
  const COURIER_PX = 24.5;                       // Figma candidate couriers ≈ 24–25 px
  let blipTimer = 0, blipOn = false;
  const used = new Set();
  const rnd = (a, b) => a + Math.random() * (b - a);
  function spawnBlip() {
    let i, tries = 0;
    do { i = Math.floor(Math.random() * BLIP_SPOTS.length); } while (used.has(i) && ++tries < 20);
    if (used.has(i)) return;
    used.add(i);
    const [x, y, a] = BLIP_SPOTS[i];
    const r = (a * Math.PI) / 180, slide = rnd(-3, 3);
    const px = x + Math.cos(r) * slide, py = y + Math.sin(r) * slide;
    const hd = a + 90 + (Math.random() < 0.5 ? 180 : 0) + rnd(-2, 2);
    const size = COURIER_PX * rnd(0.96, 1.04);
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "blip");
    g.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${hd.toFixed(1)})`);
    g.innerHTML = `<circle class="blip__ping" r="${(size / 2).toFixed(2)}"/><image href="assets/d0201.png" x="${(-size / 2).toFixed(2)}" y="${(-size / 2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"/>`;
    blipLayer.appendChild(g);
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("on")));
    setTimeout(() => { g.classList.remove("on"); setTimeout(() => { g.remove(); used.delete(i); }, 450); }, rnd(950, 1400));
  }
  function wave() {
    if (!blipOn) return;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) setTimeout(spawnBlip, rnd(0, 220));
    blipTimer = setTimeout(wave, rnd(550, 900));
  }
  function radarBlips(on) {
    clearTimeout(blipTimer);
    if (on === blipOn) { if (on) wave(); return; }
    blipOn = on;
    if (on) wave();
    else { $$(".blip", blipLayer).forEach((b) => b.classList.remove("on")); setTimeout(() => { if (!blipOn) { blipLayer.innerHTML = ""; used.clear(); } }, 450); }
  }

  /* ---------- frame loop: countdown, ring, auto-advance ---------- */
  let lastSec = -1, arcShown = 1, arcSet = -1;
  function frame() {
    const e = elapsed();
    // ring: what is left of the whole order; full again once the countdown has expired
    const arcTarget = current === "confirmDelivery" ? 1 : (TOTAL - e) / TOTAL;
    arcShown += (arcTarget - arcShown) * (Math.abs(arcTarget - arcShown) > 0.02 ? 0.1 : 0.5);
    if (Math.abs(arcShown - arcSet) > 0.0004) {
      arcSet = arcShown;
      const d = `${Math.max(0.0001, arcShown).toFixed(4)} 2`;
      arcEl.setAttribute("stroke-dasharray", d);
      arcBlur.setAttribute("stroke-dasharray", d);
      arcEl.style.opacity = arcBlur.style.opacity = arcShown < 0.002 ? "0" : "";
    }
    const sec = current === "confirmDelivery" ? 0 : Math.max(0, Math.floor(TOTAL - 1 - e));
    if (sec !== lastSec) { dialTime.textContent = fmt(sec); lastSec = sec; }
    if (isFlow(current) && !running && !confirmFlow.active) {
      const s = flowStateAt(e);
      if (s !== current) transition(s);
    }
    if (running) sheet.layout();
    moveCourier();
    requestAnimationFrame(frame);
  }

  /* ---------- product recommendations & order items ---------- */
  const PRODUCTS = [   // rightmost first (RTL)
    { img: "d74da.png", now: "۴۸۰٬۰۰۰", was: "۵۸۰٬۰۰۰", hl: "8e5eb.svg" },
    { img: "31f36.png", now: "۷۵٬۰۰۰", was: "۱۰۰٬۰۰۰", hl: "ad32b.svg" },
    { img: "2badf.png", now: "۸۵٬۰۰۰", was: "۱۲۰٬۰۰۰", hl: "ad32b.svg" },
  ];
  $("#recoTrack").innerHTML = PRODUCTS.map((p) => `
    <div class="product">
      <div class="product__thumb">
        <div class="product__frame"><img src="assets/${p.img}" alt="" /></div>
        <div class="counter"><button aria-label="افزودن"><img src="assets/4a6ee.svg" alt="" /></button></div>
        <span class="discount">-۱۷ ٪</span>
      </div>
      <div class="price">
        <div class="price__final">
          <div class="price__now"><span>${p.now}</span><img src="assets/bb513.svg" alt="تومان" /></div>
          <div class="price__hl" style="--hl: url('assets/${p.hl}')"></div>
        </div>
        <div class="price__was"><span>${p.was}</span></div>
      </div>
    </div>`).join("");
  $("#recoTrack").addEventListener("click", (e) => {
    const b = e.target.closest(".counter button");
    if (!b) return;
    b.classList.remove("is-added"); void b.offsetWidth; b.classList.add("is-added");
  });
  const ITEMS = [   // rightmost first (RTL)
    { img: "f22ba.png", qty: "×۲" }, { img: "b8f6d.png", qty: "×۳" }, { img: "fa4f6.png" },
    { img: "82960.png", qty: "×۲" }, { img: "cf04e.png" }, { img: "fe1bf.png" },
  ];
  $("#itemsTrack").innerHTML = ITEMS.map((it) => `
    <span class="thumb64"><img src="assets/${it.img}" alt="" />${it.qty ? `<span class="qty-badge">${it.qty}</span>` : ""}</span>`).join("");

  /* ------------------------------------------------------------------
   * Bottom sheet (from iteration 3)
   *   scrollTop 0 → collapsed: map full-screen, the dial and title peek in
   *   scrollTop E → expanded:  cards start just below the pins / route
   * ------------------------------------------------------------------ */
  const sheet = (() => {
    const scroller = $("#scroller");
    const content = $("#content");
    const spacer = $("#sheetSpacer");
    const snap = $("#sheetSnap");
    const map = $("#map");

    let E = 0, maxScroll = 0;
    let mode = "expanded";
    let follow = false;
    let gap = null, gapTween = null;

    const H = () => scroller.clientHeight;
    const peek = () => $("#statusDetails").getBoundingClientRect().bottom - content.getBoundingClientRect().top + 24;
    const gapFor = (s) => ((STATES[s] && STATES[s].gap) || PIN_GAP) * (map.offsetWidth / 390);

    function currentGap() {
      const target = gapFor(current);
      if (gap === null) gap = target;
      if (!gapTween && Math.abs(target - gap) > 0.5) gapTween = { from: gap, to: target, start: performance.now() };
      if (gapTween) {
        if (gapTween.to !== target) gapTween = { from: gap, to: target, start: performance.now() };
        const p = clamp01((performance.now() - gapTween.start) / 520);
        gap = gapTween.from + (gapTween.to - gapTween.from) * (1 - Math.pow(1 - p, 3));
        if (p >= 1) gapTween = null;
      }
      return gap;
    }

    function layout() {
      const h = H();
      const prevTop = spacer.offsetHeight, prevE = E;
      spacer.style.height = `${Math.max(0, h - peek())}px`;
      const top = spacer.offsetHeight;
      if (top !== prevTop && !anim && scroller.scrollTop > prevE + 1) scroller.scrollTop += top - prevTop;
      const ch = content.offsetHeight;
      E = Math.max(0, top + Math.min(-currentGap(), ch - h));
      maxScroll = Math.max(E, top + ch - h);
      snap.style.top = `${E}px`;
      snap.style.height = `${maxScroll - E + h}px`;
      if ((follow || gapTween) && mode === "expanded" && !anim && scroller.scrollTop <= E + 1) scroller.scrollTop = E;
      paint();
      if (gapTween) requestAnimationFrame(layout);
    }

    function paint() {
      const p = E ? clamp01(1 - scroller.scrollTop / E) : 0;
      const full = Math.max(1, H() / map.offsetHeight);
      map.style.transform = p > 0.001 ? `scale(${(1 + (full - 1) * p).toFixed(4)})` : "";
      const collapsed = p > 0.5;
      if (collapsed !== (mode === "collapsed")) {
        mode = collapsed ? "collapsed" : "expanded";
        device.classList.toggle("is-collapsed", collapsed);
      }
    }

    let anim = 0;
    function stop() { if (anim) { cancelAnimationFrame(anim); anim = 0; } }
    function springTo(target, v0 = 0) {
      stop();
      let x = scroller.scrollTop, v = v0, last = performance.now();
      const w = 15, z = 0.9;
      const step = (now) => {
        const dt = Math.min(0.032, (now - last) / 1000); last = now;
        const a = -w * w * (x - target) - 2 * z * w * v;
        v += a * dt; x += v * dt;
        scroller.scrollTop = x;
        if (Math.abs(x - target) < 0.5 && Math.abs(v) < 12) { scroller.scrollTop = target; anim = 0; return; }
        anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    const expand = () => springTo(E);

    let gate = null, touching = false, lastWheel = 0, idle = 0;
    function beginGesture() {
      const st = scroller.scrollTop;
      gate = st > E + 4 ? { min: E, max: Infinity } : st < E / 2 ? { min: 0, max: E } : null;
    }
    function endGestureSoon() { clearTimeout(idle); idle = setTimeout(() => { if (!touching) gate = null; }, 180); }
    let samples = [];
    scroller.addEventListener("touchstart", (e) => {
      stop(); touching = true; samples = [];
      // horizontal lists scroll on their own
      gate = e.target.closest(".reco__track, .items__viewport") ? null : (beginGesture(), gate);
    }, { passive: true });
    const onTouchEnd = () => {
      touching = false; endGestureSoon();
      scroller.style.overflowY = "";
      const st = scroller.scrollTop;
      if (gate && gate.min >= E) return;
      if (st >= E - 1) return;
      const now = performance.now();
      const recent = samples.filter((s) => now - s.t < 100);
      const v = recent.length > 1 ? ((recent[recent.length - 1].y - recent[0].y) / Math.max(16, recent[recent.length - 1].t - recent[0].t)) * 1000 : 0;
      const projected = st + v * 0.2;
      springTo(Math.abs(v) > 500 ? (v < 0 ? 0 : E) : (projected < E / 2 ? 0 : E), v);
    };
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    let acc = 0, hold = 0, wheelLock = false, lockTimer = 0;
    const lockFor = (ms) => { wheelLock = true; clearTimeout(lockTimer); lockTimer = setTimeout(() => (wheelLock = false), ms); };
    scroller.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;           // sideways: the product / item lists
      const now = performance.now();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      if (wheelLock) { e.preventDefault(); lockFor(260); return; }
      if (now - lastWheel > 220) { beginGesture(); acc = 0; }
      lastWheel = now;
      endGestureSoon();
      const st = scroller.scrollTop;
      if (gate && gate.min >= E) {
        if (dy < 0 && st + dy < E) {
          e.preventDefault();
          if (st > E + 0.5) springTo(E, -300);
          hold = now + 450;
          lockFor(260);
        }
        return;
      }
      if (dy < 0 && now < hold && st >= E - 0.5) { e.preventDefault(); hold = now + 450; return; }
      const inSheetZone = st < E - 0.5 || (st <= E + 0.5 && dy < 0);
      if (!inSheetZone) return;
      e.preventDefault();
      acc += dy;
      if (Math.abs(acc) < 8) return;
      const target = acc < 0 ? 0 : E;
      acc = 0;
      if (Math.abs(st - target) > 0.5) springTo(target, Math.sign(target - st) * 500);
      lockFor(260);
    }, { passive: false });

    scroller.addEventListener("scroll", () => {
      if (touching) { samples.push({ t: performance.now(), y: scroller.scrollTop }); if (samples.length > 12) samples.shift(); }
      if (gate && !anim) {
        const st = scroller.scrollTop;
        const stopAt = st < gate.min - 0.5 ? gate.min : st > gate.max + 0.5 ? gate.max : null;
        if (stopAt !== null) {
          scroller.style.overflowY = "hidden";
          scroller.scrollTop = stopAt;
          if (!touching) requestAnimationFrame(() => { scroller.style.overflowY = ""; });
        }
      }
      if (gate) endGestureSoon();
      requestAnimationFrame(paint);
    }, { passive: true });

    scroller.addEventListener("click", (e) => {
      if (mode === "collapsed" && content.contains(e.target) && !e.target.closest("button")) expand();
    });

    new ResizeObserver(() => layout()).observe(content);
    window.addEventListener("resize", () => layout());
    return {
      layout,
      init() { layout(); scroller.scrollTop = E; paint(); },
      follow(on) { follow = on; if (on) layout(); },
      // bring a card into view (e.g. "جزئیات سفارش" → the items card)
      reveal(el) {
        const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect();
        const target = Math.min(maxScroll, Math.max(E, scroller.scrollTop + r.top - s.top - 108));
        springTo(target);
        el.animate({ transform: ["none", "scale(1.015)", "none"] }, { duration: 700, delay: 280, easing: EASE });
      },
    };
  })();

  /* ------------------------------------------------------------------
   * Address confirmation (Figma 144:6665): 10 s to check the address
   * before the order is submitted; "تغییر آدرس" restarts the window.
   * Then: a soft fade sweeps through the circle while the map is revealed
   * behind the page, the countdown grows inside the circle, and the circle
   * glides into the countdown dial as the cards rise in.
   * ------------------------------------------------------------------ */
  const confirmFlow = (() => {
    const layer = $("#confirm");
    const circle = $("#confirmCircle");
    const arc = $("#confirmArc");
    const ctitle = $(".confirm__title");
    const card = $(".confirm__card");
    const contentEl = $("#content");
    const appbar = $(".appbar");
    const pin = $(".confirm__pin");
    const dial = $("#dial");
    const nextTimer = $(".confirm__next-timer");
    const WINDOW_MS = 10000;
    let t0 = 0, raf = 0, phase = "off";
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const POP = "cubic-bezier(.25,1.5,.45,1)";
    const GLIDE = "cubic-bezier(.22,1,.36,1)";

    function setWipe(p) {
      const H = layer.clientHeight || 840;
      layer.style.setProperty("--band", `${H}px`);
      layer.style.setProperty("--page", `${(-H + 2 * H * p).toFixed(1)}px`);
      layer.style.setProperty("--circ", `${(H - 2 * H * p).toFixed(1)}px`);
    }
    function reset() {
      cancelAnimationFrame(raf);
      [circle, ctitle, card, contentEl, appbar, pin, arc, layer, nextTimer, dial, $(".status-card__content"), recoEl, $("#items"), $("#supportCard")]
        .forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
      setWipe(0);
      arc.style.opacity = "";
      arc.setAttribute("stroke-dasharray", "1 2");
    }
    function start() {
      reset();
      phase = "waiting";
      api.active = true;
      layer.hidden = false;
      device.classList.add("is-intro", "is-intro-dial");
      setClock(0);
      clockPaused = true;
      current = null;                               // re-enter "awaiting" from scratch
      transition("awaiting", { instant: true });
      requestAnimationFrame(() => sheet.init());
      stateSelect.value = "confirm";
      if (history.replaceState) history.replaceState(null, "", location.search + "#confirm");
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function tick(now) {
      if (phase !== "waiting") return;
      const p = clamp01((now - t0) / WINDOW_MS);
      arc.setAttribute("stroke-dasharray", `${Math.max(0.0001, 1 - p).toFixed(4)} 2`);
      if (p >= 1) { arc.style.opacity = "0"; reveal(); return; }
      raf = requestAnimationFrame(tick);
    }
    $("#confirmChange").addEventListener("click", () => { if (phase === "waiting") t0 = performance.now(); });

    function reveal() {
      phase = "reveal";
      const dur = 1200, s = performance.now();
      const cTop = circle.getBoundingClientRect().top - layer.getBoundingClientRect().top;
      layer.style.setProperty("--circle-top", `${cTop}px`);
      nextTimer.textContent = dialTime.textContent;
      pin.animate({ transform: ["scale(1)", "scale(0)"], opacity: [1, 0.7, 0], offset: [0, 0.75, 1] },
        { duration: 480, delay: 150, easing: "cubic-bezier(.5,0,.5,1)", fill: "forwards" });
      nextTimer.animate({ transform: ["scale(0)", "scale(1)"], opacity: [0, 1] }, { duration: 420, delay: 440, easing: POP, fill: "forwards" });
      ctitle.animate({ opacity: [1, 0], transform: ["none", "translateY(10px)"] }, { duration: 320, delay: 480, easing: "ease-in", fill: "forwards" });
      card.animate({ opacity: [1, 0], transform: ["none", "translateY(26px) scale(.98)"] }, { duration: 360, delay: 520, easing: "ease-in", fill: "forwards" });
      let settled = false;
      const step = (now) => {
        if (phase !== "reveal" && phase !== "settle") return;
        const p = clamp01((now - s) / dur);
        setWipe(ease(p));
        if (!settled && p >= 0.69) { settled = true; settle(); }
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    function settle() {
      phase = "settle";
      const b = dial.getBoundingClientRect();
      const c = circle.getBoundingClientRect();
      const dx = (b.left + b.width / 2) - (c.left + c.width / 2);
      const dy = (b.top + b.height / 2) - (c.top + c.height / 2);
      const k = b.width / c.width;
      const D = 620;

      device.classList.remove("is-intro");
      circle.animate({ transform: ["none", `translate(${dx}px, ${dy}px) scale(${k})`] }, { duration: D, easing: GLIDE, fill: "forwards" });
      arc.style.opacity = "";
      arc.animate({ strokeDasharray: ["0.0001 2", "1 2"], opacity: [0, 1, 1], offset: [0, 0.1, 1] }, { duration: D, easing: GLIDE, fill: "forwards" });
      [$(".status-card__content"), recoEl, $("#items"), $("#supportCard")].forEach((el, i) =>
        el.animate({ opacity: [0, 1], transform: ["translateY(70px)", "none"] }, { duration: D + 80, delay: i * 55, easing: GLIDE, fill: "backwards" }));
      appbar.animate({ opacity: [0, 1], transform: ["translateY(-6px)", "none"] }, { duration: 420, delay: 180, easing: GLIDE, fill: "backwards" });

      // the circle has become the dial: the real dial (glass ring + arc) takes over
      setTimeout(() => {
        device.classList.remove("is-intro-dial");
        dial.animate({ opacity: [0, 1] }, { duration: 240, easing: "ease-out", fill: "backwards" });
        layer.animate({ opacity: [1, 0] }, { duration: 240, easing: "ease-out", fill: "forwards" }).finished.then(finish);
      }, D - 160);
    }
    function finish() {
      phase = "off";
      api.active = false;
      layer.hidden = true;
      reset();
      setClock(0);
      clockPaused = false;
      stateSelect.value = "awaiting";
      if (history.replaceState) history.replaceState(null, "", location.search + "#awaiting");
    }
    function cancel() {
      if (!api.active) return;
      phase = "off";
      api.active = false;
      reset();
      layer.hidden = true;
      device.classList.remove("is-intro", "is-intro-dial");
      clockPaused = false;
    }
    const api = { active: false, start, cancel };
    return api;
  })();

  /* ---------- boot ---------- */
  const hash = location.hash.slice(1);
  const initial = STATES[hash] ? hash : "awaiting";
  setClock(START[initial] !== undefined ? START[initial] : 0);
  transition(initial, { instant: true });
  sheet.init();
  requestAnimationFrame(frame);
  if (!STATES[hash]) confirmFlow.start();   // no state in the URL (or #confirm) → start at address confirmation
})();
