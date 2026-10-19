(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * Iteration 4 — glassy countdown (single page: awaiting confirmation)
   * A 45-minute countdown; the arc fills up as time passes, over a clear glass ring.
   * ?speed=60 runs it 60× faster.
   * ------------------------------------------------------------------ */
  const TOTAL = 45 * 60;
  const SPEED = Math.max(0.1, Number(new URLSearchParams(location.search).get("speed")) || 1);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const device = $("#device");
  const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const fmt = (sec) => faDigits(`${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);

  /* ---------- clock ---------- */
  let clock = { e: 0, t: performance.now() };
  const elapsed = () => Math.min(TOTAL, clock.e + ((performance.now() - clock.t) / 1000) * SPEED);
  const setElapsed = (e) => { clock = { e: Math.min(TOTAL, Math.max(0, e)), t: performance.now() }; };

  /* ---------- glassy gauge ---------- */
  const gauge = $("#gauge");
  const dashes = $$(".arcdash", gauge);
  const timeEl = $("#gaugeTime");
  const C = 60;

  // Refraction maps for feDisplacementMap: R/G encode where each pixel samples
  // the map from (0.5 = no shift). Built once on a canvas.
  function dispMap(offset) {
    const N = 240, cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / 2 - C, dy = (y + 0.5) / 2 - C, r = Math.hypot(dx, dy) || 1;
      const o = offset(r);                                      // + = sample further out, − = further in
      const i = (y * N + x) * 4;
      img.data[i] = 128 + 127 * Math.max(-1, Math.min(1, o * dx / r));
      img.data[i + 1] = 128 + 127 * Math.max(-1, Math.min(1, o * dy / r));
      img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }
  const setHref = (el, url) => { el.setAttribute("href", url); el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url); };
  // clear glass: flat in the middle, bending the map gently inwards right at the rim
  setHref($("#gLensMap"), dispMap((r) => (r < 46 ? 0 : -Math.pow(Math.min(1, (r - 46) / 14), 2))));
  // red glass: a faint magnification across the band
  setHref($("#gLensMapRed"), dispMap((r) => -Math.max(-1, Math.min(1, (r - 52) / 8))));

  // keep the map drawn inside the gauge exactly over the real map behind it
  const maps = $$(".gmap", gauge);
  const mapImg = $("#map .map__img");
  let lastBox = "";
  function alignMap() {
    const m = mapImg.getBoundingClientRect(), g = gauge.getBoundingClientRect();
    const k = 120 / g.width;
    const box = [(m.left - g.left) * k, (m.top - g.top) * k, m.width * k, m.height * k].map((v) => v.toFixed(1));
    const key = box.join();
    if (key === lastBox) return;
    lastBox = key;
    maps.forEach((im) => { im.setAttribute("x", box[0]); im.setAttribute("y", box[1]); im.setAttribute("width", box[2]); im.setAttribute("height", box[3]); });
  }

  let shown = null, set = -1, lastSec = -1;
  function renderGauge(e) {
    const target = e / TOTAL;                            // progress: fills from empty to a full ring
    if (shown === null) shown = target;
    const d = target - shown;
    shown += Math.abs(d) > 0.01 ? d * 0.12 : d;          // jumps glide, the countdown tracks the clock
    if (Math.abs(shown - set) > 0.0002) {
      set = shown;
      const p = `${Math.max(0.001, shown).toFixed(4)} 2`;
      dashes.forEach((c) => c.setAttribute("stroke-dasharray", p));
      gauge.classList.toggle("is-empty", target <= 0);  // the red shows from the very first second
    }
    const sec = Math.max(0, Math.ceil(TOTAL - e) - 1);
    if (sec !== lastSec) { timeEl.textContent = fmt(sec); lastSec = sec; }
    alignMap();
  }

  /* ---------- prototype controls ---------- */
  const scrub = $("#scrub");
  let scrubbing = false;
  scrub.addEventListener("input", () => { scrubbing = true; setElapsed(Number(scrub.value)); });
  scrub.addEventListener("change", () => { scrubbing = false; });
  $("#iterationSelect").addEventListener("change", (ev) => { location.href = ev.target.value; });
  // icon style toggle — remembered (and shareable with ?icons=2d|3d-color|3d-neutral)
  const iconSelect = $("#iconSelect");
  const ICONS = ["2d", "3d-color", "3d-neutral"];
  const setIcons = (v) => {
    if (!ICONS.includes(v)) v = "2d";
    device.dataset.icons = v; iconSelect.value = v;
    try { localStorage.setItem("pp-icons", v); } catch (e) {}
    const u = new URL(location.href); u.searchParams.set("icons", v); history.replaceState(null, "", u);
  };
  let savedIcons = new URLSearchParams(location.search).get("icons");
  if (!savedIcons) { try { savedIcons = localStorage.getItem("pp-icons"); } catch (e) {} }
  setIcons(savedIcons || "2d");
  iconSelect.addEventListener("change", () => setIcons(iconSelect.value));

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
            <img class="product__img" src="../assets/${img}" alt="" />
            <div class="qty"><button aria-label="افزودن"><img src="../assets/07dd7.svg" alt="" /></button></div>
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

  const sheet = (() => {
    const scroller = $("#scroller");
    const content = $("#content");
    const spacer = $("#sheetSpacer");
    const snap = $("#sheetSnap");
    const map = $("#map");

    // lowest point of the store / home / courier / route per state (map px @390w)
    const POI_BOTTOM = { awaiting: 210, preparing: 272, finding: 272, out: 296, delivered: 272 };   // awaiting: cards start at y 220 (Figma 195:7071)
    const POI_MARGIN = 10;

    let E = 0, maxScroll = 0;
    let mode = "expanded";
    let follow = false;
    let gap = null;                       // tweened top gap (px)
    let gapTween = null;

    const H = () => scroller.clientHeight;
    const peek = () => $(".g-card__title").getBoundingClientRect().bottom - content.getBoundingClientRect().top + 20;
    const gapFor = (s) => (POI_BOTTOM[s] || 200) * (map.offsetWidth / 390) + POI_MARGIN;

    function currentGap() {
      const target = gapFor("awaiting");
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


  function frame() {
    const e = elapsed();
    renderGauge(e);
    if (!scrubbing) scrub.value = Math.round(e);
    requestAnimationFrame(frame);
  }
  reco.toggle(true);
  sheet.init();
  requestAnimationFrame(frame);
})();
