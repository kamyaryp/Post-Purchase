(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * Timeline
   * One continuous countdown drives the whole flow. It is split into four
   * equal phases (countdown ÷ 4); in each phase the matching connector bar
   * fills, and when a phase ends the flow moves on by itself.
   *   awaiting  : bar 1 fills 50% → 100%   (store → processing)
   *   preparing : bar 2 fills 50% → 100%   (processing → dispatch)
   *   finding   : bars hold                (waiting for a courier)
   *   out       : bar 3 fills 50% → 100%   (dispatch → completion)
   *   delivered : done
   * The active bar starts half-full, exactly like the Figma frames.
   * Add ?speed=60 to the URL to run the flow 60× faster for demos.
   * ------------------------------------------------------------------ */
  const TOTAL = 45 * 60;               // seconds (design shows 44:59 at start)
  const PHASE = TOTAL / 4;
  const ORDER = ["awaiting", "preparing", "finding", "out", "delivered"];
  const stateSelect = document.getElementById("stateSelect");
  const START = { awaiting: 0, preparing: PHASE, finding: 2 * PHASE, out: 3 * PHASE, delivered: TOTAL };
  const SPEED = Math.max(0.1, Number(new URLSearchParams(location.search).get("speed")) || 1);

  const TITLES = {
    awaiting: "در انتظار تأیید فروشگاه",
    preparing: "در حال آماده‌سازی",
    finding: "در جستجوی پیک",
    out: "پیک به سمت شما",
    delivered: "سفارش تحویل داده شد.",
  };
  const ILL = { awaiting: "dc968.png", preparing: "b8cb4.png", finding: "7a24d.png", out: "ae99a.png", delivered: "delivered-check.png" };

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const stateAt = (e) => (e >= TOTAL ? "delivered" : ORDER[Math.floor(e / PHASE)]);
  const segment = (e, from) => (e < from ? 0 : e >= from + PHASE ? 1 : 0.5 + 0.5 * ((e - from) / PHASE));
  const barTargets = (e) => [segment(e, 0), segment(e, PHASE), segment(e, 3 * PHASE)];
  const stepsOn = (e) => ({ processing: e >= PHASE, dispatch: e >= 2 * PHASE, completion: e >= TOTAL });

  /* ------------------------------------------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const device = $("#device");
  const body = $("#statusBody");
  const detail = $("#detailCard");
  const recoEl = $("#reco");
  const title = $("#statusTitle");
  const ill = $("#badgeIll");
  const illImg = $("#badgeIllImg");
  const timerEl = $("#badgeTimer");
  const fills = $$(".bar__fill").sort((a, b) => a.dataset.bar - b.dataset.bar);

  const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";
  const OUT_MS = 160;
  const IN_MS = 480;

  const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const fmt = (sec) => faDigits(`${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- clock ---------- */
  let clock = { e: 0, t: performance.now() };
  let clockPaused = false;             // the countdown waits while the address is being confirmed
  const elapsed = () => clockPaused ? clock.e : Math.min(TOTAL, clock.e + ((performance.now() - clock.t) / 1000) * SPEED);

  /* ---------- bars (with smooth tween on jumps) ---------- */
  let shown = [0, 0, 0];
  let tween = null; // { from, start }
  function renderBars(e) {
    const target = barTargets(e);
    let vals = target;
    if (tween) {
      const p = clamp01((performance.now() - tween.start) / 650);
      const k = 1 - Math.pow(1 - p, 3);
      vals = target.map((t, i) => tween.from[i] + (t - tween.from[i]) * k);
      if (p >= 1) tween = null;
    }
    vals.forEach((v, i) => {
      const w = `${(v * 100).toFixed(3)}%`;
      if (fills[i].style.width !== w) fills[i].style.width = w;
    });
    shown = vals;
  }

  /* ---------- steps ---------- */
  function renderSteps(e, pop) {
    const on = stepsOn(e);
    for (const [k, v] of Object.entries(on)) {
      const el = $(`.step[data-step="${k}"]`);
      const was = el.classList.contains("is-on");
      el.classList.toggle("is-on", v);
      if (pop && v && !was) {
        el.classList.remove("is-pop"); void el.offsetWidth; el.classList.add("is-pop");
      }
    }
  }

  /* ---------- smart-animate state transition ---------- */
  let current = null;
  let running = false;
  let pending = null;

  const TOGGLES = ".sec, .eta, .badge__timer, .in-awaiting, .not-awaiting";
  const isShown = (el) => el.getClientRects().length > 0;
  function visibleFor(state) {
    const prev = device.dataset.state;
    device.dataset.state = state;
    const set = new Set($$(TOGGLES).filter(isShown));
    device.dataset.state = prev;
    return set;
  }

  function applyState(name) {
    if (!confirmFlow.active) stateSelect.value = name;
    current = name;
    device.dataset.state = name;
    title.textContent = TITLES[name];
    illImg.src = `assets/${ILL[name]}`;
    $$("[data-go]").forEach((b) => b.setAttribute("aria-current", b.dataset.go === name ? "step" : "false"));
    if (history.replaceState && !confirmFlow.active) history.replaceState(null, "", location.search + `#${name}`);
    reco.toggle(name === "awaiting");
    radarBlips(name === "finding");
  }

  function animateHeight(el, from, to) {
    if (Math.abs(from - to) < 1) return;
    const prevOverflow = el.style.overflow;
    el.style.overflow = "hidden";
    el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: IN_MS, easing: EASE })
      .finished.then(() => { el.style.overflow = prevOverflow; });
  }

  async function transition(name, { instant = false } = {}) {
    if (name === current) return;
    if (running) { pending = name; return; }

    if (instant || current === null) {
      applyState(name);
      renderSteps(elapsed(), false);
      return;
    }

    running = true;
    sheet.follow(true);
    tween = { from: shown.slice(), start: performance.now() };
    const before = new Set($$(TOGGLES).filter(isShown));
    const after = visibleFor(name);
    const leaving = [...before].filter((el) => !after.has(el));
    const entering = [...after].filter((el) => !before.has(el));

    // Phase 1 — fade out what is going away (and the parts that morph)
    const outFx = { opacity: [1, 0], transform: ["none", "translateY(-6px)"] };
    const outs = [
      ...leaving.map((el) => el.animate(outFx, { duration: OUT_MS, easing: "ease-in", fill: "forwards" })),
      title.animate({ opacity: [1, 0], filter: ["blur(0)", "blur(4px)"] }, { duration: OUT_MS, easing: "ease-in", fill: "forwards" }),
      ill.animate({ opacity: [1, 0], transform: ["scale(1)", "scale(.7)"] }, { duration: OUT_MS, easing: "ease-in", fill: "forwards" }),
    ];
    await wait(OUT_MS);

    // Measure, swap, measure again
    const h0 = { body: body.offsetHeight, detail: detail.offsetHeight, reco: recoEl.offsetHeight };
    const recoLeaving = leaving.includes(recoEl);
    if (recoLeaving) recoEl.classList.add("is-leaving");
    applyState(name);
    outs.forEach((a) => a.cancel());
    const h1 = { body: body.offsetHeight, detail: detail.offsetHeight, reco: recoEl.offsetHeight };

    // Phase 2 — morph sizes and bring in the new content
    animateHeight(body, h0.body, h1.body);
    animateHeight(detail, h0.detail, h1.detail);

    if (recoLeaving) {
      recoEl.animate(
        [
          { height: `${h0.reco}px`, paddingTop: "16px", paddingBottom: "16px", marginTop: "0px", opacity: 0 },
          { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "-12px", opacity: 0 },
        ],
        { duration: IN_MS, easing: EASE }
      ).finished.then(() => recoEl.classList.remove("is-leaving"));
    } else if (entering.includes(recoEl)) {
      recoEl.animate(
        [
          { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "-12px", opacity: 0 },
          { height: `${h1.reco}px`, paddingTop: "16px", paddingBottom: "16px", marginTop: "0px", opacity: 1 },
        ],
        { duration: IN_MS, easing: EASE }
      );
    }

    entering.filter((el) => el !== recoEl).forEach((el, i) =>
      el.animate(
        { opacity: [0, 1], transform: ["translateY(10px) scale(.98)", "none"] },
        { duration: IN_MS, delay: 60 + i * 40, easing: EASE, fill: "backwards" }
      )
    );
    title.animate({ opacity: [0, 1], filter: ["blur(4px)", "blur(0)"], transform: ["translateY(6px)", "none"] }, { duration: IN_MS, easing: EASE });
    ill.animate({ opacity: [0, 1], transform: ["scale(.6) rotate(-6deg)", "scale(1) rotate(0)"] }, { duration: IN_MS + 120, easing: SPRING });
    renderSteps(elapsed(), true);

    await wait(IN_MS + 40);
    running = false;
    sheet.follow(false);
    if (pending && pending !== current) { const p = pending; pending = null; transition(p); }
    else pending = null;
  }

  /* ---------- jump to a state (progress indicator) ---------- */
  function jump(name) {
    if (name === "confirm") { confirmFlow.start(); return; }
    confirmFlow.cancel();
    clock = { e: START[name], t: performance.now() };
    transition(name);
  }
  $$("[data-go]").forEach((btn) => btn.addEventListener("click", () => jump(btn.dataset.go)));
  stateSelect.addEventListener("change", () => jump(stateSelect.value));

  // Keyboard: ← / → step through the flow (RTL: left = forward)
  document.addEventListener("keydown", (e) => {
    const i = ORDER.indexOf(current);
    if (e.key === "ArrowLeft" && i < ORDER.length - 1) jump(ORDER[i + 1]);
    if (e.key === "ArrowRight" && i > 0) jump(ORDER[i - 1]);
  });

  /* ---------- courier on the route (out for delivery) ---------- */
  const routeEl = $("#routeLeft");
  const routeDone = $("#routeDone");
  const courier = $("#courier");
  const ROUTE_X = 88.49, ROUTE_Y = 188.79, ROUTE_LEN = routeEl.getTotalLength();
  // The courier rides the route at a steady, visible pace once it is out for
  // delivery (COURIER_SECS from store to home, scaled by ?speed=), then waits
  // just short of the door until the order is delivered. Its heading follows
  // the route's direction and eases through each turn.
  const COURIER_SECS = 40;
  const T_START = 0.06, T_PARK = 0.97;
  let outSince = null, lastT = -1, heading = null;
  const pt = (t) => routeEl.getPointAtLength(clamp01(t) * ROUTE_LEN);
  function moveCourier(e) {
    const s = stateAt(e);
    if (s === "out") { if (outSince === null) outSince = performance.now(); }
    else outSince = null;
    const ride = outSince === null ? 0 : ((performance.now() - outSince) / 1000) * SPEED / COURIER_SECS;
    const t = s === "delivered" ? 1 : s === "out" ? T_START + (T_PARK - T_START) * Math.min(1, ride) : T_START;
    if (Math.abs(t - lastT) < 0.00005) return;
    lastT = t;
    routeDone.setAttribute("stroke-dasharray", `${t} 2`);
    // remaining part starts at t; avoid zero-length dashes (round caps would draw a dot)
    routeEl.setAttribute("stroke-dasharray", `${Math.max(0, 1 - t)} 2`);
    routeEl.setAttribute("stroke-dashoffset", `${-t}`);
    routeEl.style.visibility = t >= 0.999 ? "hidden" : "";

    const p = pt(t);
    const d = 4 / ROUTE_LEN;                       // look 4px behind and ahead on the route
    const a = pt(t - d), b = pt(t + d);
    const target = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;   // artwork faces up
    if (heading === null) heading = target;
    heading += ((((target - heading) % 360) + 540) % 360 - 180) * 0.35;     // shortest turn, eased
    courier.setAttribute("transform", `translate(${(p.x + ROUTE_X).toFixed(2)} ${(p.y + ROUTE_Y).toFixed(2)}) rotate(${heading.toFixed(1)})`);
  }

  /* ---------- nearby couriers blinking on the radar (finding a courier) ----------
   * 77 spots sampled from the map image: street / alley centre-lines inside the
   * radar (x, y in map px, street angle in degrees). Each wave picks random
   * spots, nudges them along their street, faces them either way, and gives
   * them a random size and lifetime. */
  const BLIP_SPOTS = [[172,162,15],[212,158,102],[160,182,21],[54,324,90],[66,308,111],[114,152,111],[144,280,18],[152,136,18],[44,194,18],[76,242,24],[10,222,24],[130,344,21],[152,264,24],[184,232,111],[30,140,21],[172,288,111],[98,334,15],[180,254,111],[122,124,111],[8,174,108],[178,124,18],[196,154,102],[74,324,33],[42,170,18],[60,200,18],[134,174,21],[182,276,27],[28,246,18],[150,334,108],[164,326,111],[102,316,18],[230,204,18],[12,240,18],[44,124,18],[12,156,108],[94,264,18],[126,256,24],[78,270,111],[132,150,18],[192,204,111],[118,296,18],[10,134,21],[72,290,111],[60,150,18],[228,182,18],[160,118,18],[28,190,18],[128,324,18],[98,290,18],[208,178,105],[60,176,18],[114,270,18],[198,280,27],[148,154,18],[144,304,18],[190,174,105],[58,236,27],[86,310,18],[84,156,12],[222,258,15],[50,276,15],[216,142,105],[210,198,21],[174,142,18],[102,250,24],[32,228,27],[56,340,108],[22,118,18],[168,270,27],[196,252,15],[168,304,114],[178,188,21],[40,318,24],[46,252,18],[206,266,108],[196,188,111],[26,164,18]];
  const SVGNS = "http://www.w3.org/2000/svg";
  const blipLayer = $("#blips");
  const COURIER_PX = 20.7;                       // 18px × 1.15
  let blipTimer = 0, blipOn = false;
  const used = new Set();
  const rnd = (a, b) => a + Math.random() * (b - a);

  function spawnBlip() {
    let i, tries = 0;
    do { i = Math.floor(Math.random() * BLIP_SPOTS.length); } while (used.has(i) && ++tries < 20);
    if (used.has(i)) return;
    used.add(i);
    const [x, y, a] = BLIP_SPOTS[i];
    const r = (a * Math.PI) / 180, slide = rnd(-3, 3);           // stay on the street, anywhere along it
    const px = x + Math.cos(r) * slide, py = y + Math.sin(r) * slide;
    const heading = a + 90 + (Math.random() < 0.5 ? 180 : 0) + rnd(-2, 2);
    const size = COURIER_PX * rnd(0.96, 1.04);
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "blip");
    g.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${heading.toFixed(1)})`);
    g.innerHTML = `<circle class="blip__ping" r="${(size / 2).toFixed(2)}"/><image href="assets/courier-map.png" x="${(-size / 2).toFixed(2)}" y="${(-size / 2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"/>`;
    blipLayer.appendChild(g);
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("on")));
    setTimeout(() => {
      g.classList.remove("on");
      setTimeout(() => { g.remove(); used.delete(i); }, 450);
    }, rnd(950, 1400));
  }
  function wave() {
    if (!blipOn) return;
    const n = 1 + Math.floor(Math.random() * 3);                  // 1–3 at a time
    for (let k = 0; k < n; k++) setTimeout(spawnBlip, rnd(0, 220));
    blipTimer = setTimeout(wave, rnd(550, 900));
  }
  function radarBlips(on) {
    clearTimeout(blipTimer);
    blipOn = on;
    if (on) wave();
    else { blipLayer.querySelectorAll(".blip").forEach((b) => b.classList.remove("on")); setTimeout(() => { if (!blipOn) { blipLayer.innerHTML = ""; used.clear(); } }, 450); }
  }

  /* ---------- frame loop ---------- */
  let lastSec = -1;
  const arcEl = $("#badgeArc");
  let arcShown = 1, arcSet = -1;
  function frame() {
    const e = elapsed();
    renderBars(e);
    // countdown ring: drains over the whole countdown; jumping a step adds/removes a quarter
    const arcTarget = (TOTAL - e) / TOTAL;            // whole order: each step is a quarter of the ring
    arcShown += (arcTarget - arcShown) * (Math.abs(arcTarget - arcShown) > 0.02 ? 0.1 : 0.5); // jumps glide, draining tracks the clock
    if (Math.abs(arcShown - arcSet) > 0.0004) { arcSet = arcShown; arcEl.setAttribute("stroke-dasharray", `${Math.max(0.001, arcShown).toFixed(4)} 2`); }
    const sec = Math.max(0, Math.floor(TOTAL - 1 - e));
    if (sec !== lastSec) { timerEl.textContent = fmt(sec); lastSec = sec; }
    const s = stateAt(e);
    if (s !== current && !running) transition(s);
    if (running) sheet.layout();
    moveCourier(e);
    requestAnimationFrame(frame);
  }

  /* ---------- recommendation slider ---------- */
  const reco = (() => {
    const pages = [
      ["e0420.png", "b617c.png", "bd56c.png"],
      ["fe1bf.png", "439ee.png", "82c4a.png"],
      ["03140.png", "857be.png", "51532.png"],
    ];
    const track = $("#recoTrack");
    const dots = $("#recoDots");
    let index = 0;
    let timer = null;

    track.innerHTML = pages.map((p) => `
      <div class="reco__page">${p.map((img) => `
        <div class="product">
          <div class="product__media">
            <img class="product__img" src="assets/${img}" alt="" />
            <div class="qty"><button aria-label="افزودن"><img src="assets/07dd7.svg" alt="" /></button></div>
          </div>
        </div>`).join("")}
      </div>`).join("");

    dots.innerHTML = pages.map((_, i) => `<button role="tab" aria-label="صفحه ${i + 1}"></button>`).join("");
    const dotBtns = $$("button", dots);
    dotBtns.forEach((d, i) => d.addEventListener("click", () => { go(i); restart(); }));

    function go(i) {
      index = (i + pages.length) % pages.length;
      track.style.transform = `translateX(${index * 100}%)`; // RTL: next page sits to the left
      dotBtns.forEach((d, j) => d.setAttribute("aria-selected", j === index ? "true" : "false"));
    }
    function restart() { clearInterval(timer); timer = setInterval(() => go(index + 1), 3000); }
    function toggle(on) { clearInterval(timer); if (on) { go(0); restart(); } }
    go(0);
    return { toggle };
  })();

  /* ---------- bar width (gradient spans the whole track) ---------- */
  const stepper = $(".stepper");
  const sizeBars = () => stepper.style.setProperty("--tw", `${$(".bar__track", stepper).offsetWidth}px`);
  new ResizeObserver(sizeBars).observe($(".bar__track", stepper));

  /* ------------------------------------------------------------------
   * Bottom sheet
   *   scrollTop 0 → collapsed: map full-screen, badge/title/stepper peek in
   *   scrollTop E → expanded:  cards in place, starting just below the map's
   *                            points of interest (store, home, courier)
   * Scrolling only (no dragging). Touch keeps native momentum; settling
   * between the two positions runs on a smooth spring.
   * Intent rules:
   *   • a gesture that starts inside the card list stops at the expanded
   *     position — it never flings the sheet closed by accident; pulling
   *     again from there collapses it
   *   • a gesture that starts collapsed stops at the expanded position too
   *   • tap the peeking card to expand
   *   • touch: quick flicks win over position; slow swipes settle to the nearer stop
   * ------------------------------------------------------------------ */
  const sheet = (() => {
    const scroller = $("#scroller");
    const content = $("#content");
    const spacer = $("#sheetSpacer");
    const snap = $("#sheetSnap");
    const map = $("#map");

    // lowest point of the store / home / courier / route per state (map px @390w)
    const POI_BOTTOM = { awaiting: 193, preparing: 272, finding: 272, out: 296, delivered: 272 };
    const POI_MARGIN = 10;

    let E = 0, maxScroll = 0;
    let mode = "expanded";
    let follow = false;
    let gap = null;                       // tweened top gap (px)
    let gapTween = null;

    const H = () => scroller.clientHeight;
    const peek = () => stepper.getBoundingClientRect().bottom - content.getBoundingClientRect().top + 20;
    const gapFor = (s) => (POI_BOTTOM[s] || 200) * (map.offsetWidth / 390) + POI_MARGIN;

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
      spacer.style.height = `${Math.max(0, h - peek())}px`;
      const top = spacer.offsetHeight;
      const ch = content.offsetHeight;
      E = Math.max(0, top + Math.min(-currentGap(), ch - h));
      maxScroll = Math.max(E, top + ch - h);
      snap.style.top = `${E}px`;
      snap.style.height = `${maxScroll - E + h}px`;
      if ((follow || gapTween) && mode === "expanded" && !anim) scroller.scrollTop = E;
      paint();
      if (gapTween) requestAnimationFrame(layout);
    }

    // map grows to full screen as the cards go down
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

    /* ---------- spring (for mouse releases, taps, programmatic moves) ---------- */
    let anim = 0;
    function stop() { if (anim) { cancelAnimationFrame(anim); anim = 0; } }   // keeps snapping off until a native gesture needs it
    function springTo(target, v0 = 0) {
      stop();
            let x = scroller.scrollTop, v = v0, last = performance.now();
      const w = 15, z = 0.9;                       // natural freq (rad/s), damping
      const step = (now) => {
        const dt = Math.min(0.032, (now - last) / 1000); last = now;
        const a = -w * w * (x - target) - 2 * z * w * v;
        v += a * dt; x += v * dt;
        scroller.scrollTop = x;
        if (Math.abs(x - target) < 0.5 && Math.abs(v) < 12) {
          scroller.scrollTop = target; anim = 0;
          return;
        }
        anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    const expand = () => springTo(E);
    
    /* ---------- intent gate for native gestures ---------- */
    let gate = null;            // { min, max } bounds for the current gesture
    let touching = false, lastWheel = 0, idle = 0;
    function beginGesture() {
      const st = scroller.scrollTop;
      gate = st > E + 4 ? { min: E, max: Infinity }     // started in the list → stop at expanded
           : st < E / 2 ? { min: 0, max: E }            // started collapsed → stop at expanded
           : null;
    }
    function endGestureSoon() {
      clearTimeout(idle);
      idle = setTimeout(() => { if (!touching) gate = null; }, 180);
    }
    // Touch: native scrolling + momentum while the finger is down; on release
    // inside the sheet zone a velocity-matched spring takes over and settles
    // the sheet where the user was heading.
    let samples = [];
    scroller.addEventListener("touchstart", () => { stop(); touching = true; samples = []; beginGesture(); }, { passive: true });
    const onTouchEnd = () => {
      touching = false; endGestureSoon();
      const st = scroller.scrollTop;
      if (gate && gate.min >= E) return;               // list gesture: native momentum, gate stops it at E
      if (st >= E - 1) return;                          // already expanded (or in the list)
      const now = performance.now();
      const recent = samples.filter((s) => now - s.t < 100);
      const v = recent.length > 1 ? ((recent[recent.length - 1].y - recent[0].y) / Math.max(16, recent[recent.length - 1].t - recent[0].t)) * 1000 : 0;
      const projected = st + v * 0.2;
      springTo(Math.abs(v) > 500 ? (v < 0 ? 0 : E) : (projected < E / 2 ? 0 : E), v);
    };
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    // Wheel / trackpad. In the list: native scrolling. Between collapsed and
    // expanded the sheet never jitters with individual wheel ticks: the first
    // clear movement decides the direction and one smooth spring carries it
    // there; the rest of that gesture is absorbed.
    let acc = 0, hold = 0, wheelLock = false, lockTimer = 0;
    const lockFor = (ms) => { wheelLock = true; clearTimeout(lockTimer); lockTimer = setTimeout(() => (wheelLock = false), ms); };
    scroller.addEventListener("wheel", (e) => {
      const now = performance.now();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      if (wheelLock) { e.preventDefault(); lockFor(260); return; }   // swallow the tail of a committed gesture
      if (now - lastWheel > 220) { beginGesture(); acc = 0; }        // a pause in wheel events = a new gesture
      lastWheel = now;
      endGestureSoon();
      const st = scroller.scrollTop;

      // started in the list: glide to the expanded position and stop there
      if (gate && gate.min >= E) {
        if (dy < 0 && st + dy < E) {
          e.preventDefault();
          if (st > E + 0.5) springTo(E, -300);
          hold = now + 450;
          lockFor(260);
        }
        return;
      }
      // keep holding while the user is still scrolling up after arriving from the list
      if (dy < 0 && now < hold && st >= E - 0.5) { e.preventDefault(); hold = now + 450; return; }

      const inSheetZone = st < E - 0.5 || (st <= E + 0.5 && dy < 0);
      if (!inSheetZone) return;
      e.preventDefault();
      acc += dy;
      if (Math.abs(acc) < 8) return;                                   // ignore tiny trackpad noise
      const target = acc < 0 ? 0 : E;
      acc = 0;
      if (Math.abs(st - target) > 0.5) springTo(target, Math.sign(target - st) * 500);
      lockFor(260);
    }, { passive: false });

    scroller.addEventListener("scroll", () => {
      if (touching) { samples.push({ t: performance.now(), y: scroller.scrollTop }); if (samples.length > 12) samples.shift(); }
      if (gate && !anim) {
        const st = scroller.scrollTop;
        if (st < gate.min - 0.5) scroller.scrollTop = gate.min;
        else if (st > gate.max + 0.5) scroller.scrollTop = gate.max;
      }
      if (gate) endGestureSoon();
      requestAnimationFrame(paint);
    }, { passive: true });

    /* ---------- tap the peeking card to bring it back ---------- */
    scroller.addEventListener("click", (e) => {
      if (mode === "collapsed" && content.contains(e.target) && !e.target.closest("button")) expand();
    });

    new ResizeObserver(() => layout()).observe(content);
    window.addEventListener("resize", () => layout());
    return {
      layout,
      init() { layout(); scroller.scrollTop = E; paint(); },
      follow(on) { follow = on; if (on) layout(); },
    };
  })();

  /* ------------------------------------------------------------------
   * Address confirmation: 10 s to check the address before the order is
   * submitted. The ring drains over those 10 s; "تغییر آدرس" restarts it.
   * Then the transition into "awaiting":
   *   1. a soft white fade sweeps down inside the circle (the map there
   *      fades out) while, level with it, the page background fades away
   *      and the full map appears behind — one edge moving through both;
   *   2. the title and address card fade out, the circle shrinks into the
   *      countdown badge while the tracking cards rise into place.
   * ------------------------------------------------------------------ */
  const confirmFlow = (() => {
    const layer = $("#confirm");
    const circle = $("#confirmCircle");
    const arc = $("#confirmArc");
    const title = $(".confirm__title");
    const card = $(".confirm__card");
    const contentEl = $("#content");
    const appbar = $(".appbar");
    const WINDOW_MS = 10000;
    let t0 = 0, raf = 0, phase = "off";
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

    const pin = $(".confirm__pin");
    const badge = $("#badge");
    const badgeIll = $("#badgeIll"), badgeTimer = $("#badgeTimer");
    const badgeArcSvg = $(".badge__arc"), badgeTrack = $(".badge__track");
    // p = 0 … 1 drives both fades together. Page: a screen-tall fade band slides
    // down and reveals the map. Circle: the reverse, a circle-tall white band
    // rises and hides its map. At p = .5 both match the Figma mid frame.
    function setWipe(p) {
      layer.style.setProperty("--page", `${(-100 + 200 * p).toFixed(2)}%`);
      layer.style.setProperty("--circ", `${(160 - 320 * p).toFixed(1)}px`);
    }
    function reset(keepBadge = false) {
      cancelAnimationFrame(raf);
      [circle, title, card, contentEl, appbar, pin, arc, layer, ...(keepBadge ? [] : [badge, badgeIll, badgeTimer, badgeArcSvg, badgeTrack])]
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
      device.classList.add("is-intro", "is-intro-badge");
      // tracking screen waits behind, at the start of "awaiting"
      clock = { e: 0, t: performance.now() };
      clockPaused = true;
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
      if (p >= 1) { arc.style.opacity = "0"; reveal(); return; }   // empty ring: hide the round-cap dot
      raf = requestAnimationFrame(tick);
    }
    $("#confirmChange").addEventListener("click", () => { if (phase === "waiting") t0 = performance.now(); });

    const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    const SPRING = "cubic-bezier(0.34, 1.45, 0.64, 1)";

    /* 1 — the fades (map out of the circle, map onto the page); the home pin
       shrinks away while the white rises over it */
    function reveal() {
      phase = "reveal";
      const dur = 1400, s = performance.now();
      pin.animate({ transform: ["scale(1)", "scale(1.08)", "scale(0)"], opacity: [1, 1, 0], offset: [0, 0.25, 1] },
        { duration: 620, delay: 380, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
      title.animate({ opacity: [1, 0], transform: ["none", "translateY(8px)"] }, { duration: 420, delay: 700, easing: "ease-in", fill: "forwards" });
      card.animate({ opacity: [1, 0], transform: ["none", "translateY(24px) scale(.98)"] }, { duration: 460, delay: 760, easing: "ease-in", fill: "forwards" });
      const step = (now) => {
        if (phase !== "reveal") return;
        const p = clamp01((now - s) / dur);
        setWipe(ease(p));
        if (p < 1) raf = requestAnimationFrame(step); else settle();
      };
      raf = requestAnimationFrame(step);
    }

    /* 2 — the white circle travels into the badge's place while the cards
       rise; the ring refills to the order countdown; then the store
       illustration and the countdown grow out of the badge */
    function settle() {
      phase = "settle";
      const b = badge.getBoundingClientRect();
      const c = circle.getBoundingClientRect();
      const dx = (b.left + b.width / 2) - (c.left + c.width / 2);
      const dy = (b.top + b.height / 2) - (c.top + c.height / 2);
      const k = b.width / c.width;
      const D = 700;

      device.classList.remove("is-intro");
      circle.animate({ transform: ["none", `translate(${dx}px, ${dy}px) scale(${k})`] }, { duration: D, easing: EASE, fill: "forwards" });
      arc.style.opacity = "";
      arc.animate({ strokeDasharray: ["0.0001 2", "1 2"], opacity: [0, 1, 1], offset: [0, 0.15, 1] }, { duration: D, easing: EASE, fill: "forwards" });
      contentEl.animate({ opacity: [0, 1], transform: ["translateY(90px)", "none"] }, { duration: D, easing: EASE, fill: "backwards" });
      appbar.animate({ opacity: [0, 1], transform: ["translateY(-6px)", "none"] }, { duration: 450, delay: 250, easing: EASE, fill: "backwards" });

      setTimeout(() => {
        // hand over to the real badge: same size, same place, empty inside
        device.classList.remove("is-intro-badge");
        layer.animate({ opacity: [1, 0] }, { duration: 160, fill: "forwards" }).finished.then(finish);
        badgeTrack.animate({ opacity: [0, 1] }, { duration: 300, fill: "backwards" });
        badgeIll.animate({ transform: ["scale(0)", "scale(1)"], opacity: [0, 1] }, { duration: 560, easing: SPRING, fill: "backwards" });
        badgeTimer.animate({ transform: ["scale(0)", "scale(1)"], opacity: [0, 1] }, { duration: 560, delay: 90, easing: SPRING, fill: "backwards" });
      }, D);
    }
    function finish() {
      phase = "off";
      api.active = false;
      layer.hidden = true;
      reset(true);                         // let the badge finish growing its contents
      clock = { e: 0, t: performance.now() };
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
      layer.getAnimations().forEach((a) => a.cancel());
      device.classList.remove("is-intro", "is-intro-badge");
      clockPaused = false;
    }
    const api = { active: false, start, cancel };
    return api;
  })();

  /* ---------- boot ---------- */
  const hash = location.hash.slice(1);
  const initial = START[hash] !== undefined ? hash : "awaiting";
  clock = { e: START[initial], t: performance.now() };
  transition(initial, { instant: true });
  renderBars(elapsed());
  sheet.init();
  requestAnimationFrame(frame);
  if (START[hash] === undefined) confirmFlow.start();   // no state in the URL (or #confirm) → start at address confirmation
})();
