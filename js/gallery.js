/*
 * Builds the works grid from js/photos.js and runs the full-screen viewer.
 * You shouldn't need to edit this file to add or remove photographs.
 */

(function () {
  "use strict";

  const grid = document.querySelector("[data-works]");
  if (!grid) return;

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  // "2026-06-28T09:02:22" -> "June 28, 2026". Anything else is shown as written.
  function formatDate(date) {
    const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${MONTHS[match[2] - 1]} ${Number(match[3])}, ${match[1]}` : date || "";
  }

  // Each entry's web copies follow from its file name (see tools/prepare_photos.py).
  // Newest first, whatever order photos.js lists them in.
  const { artist, cover } = window.PORTFOLIO;
  const photos = window.PORTFOLIO.photos
    .map((photo) => ({
      ...photo,
      full: photo.file ? `images/web/${photo.file}.jpg` : null,
      thumb: photo.file ? `images/web/thumb/${photo.file}.jpg` : null,
      when: formatDate(photo.date),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  /* ------------------------------------------------------------------------
     Captions
     ------------------------------------------------------------------------ */

  // The lines printed under each tile in the grid. Each line is
  // { text, className }; .work__title is italic, .work__date is grey.
  // The viewer always shows the full wall label (see wallLabel below),
  // so the grid can be as quiet as you like.
  //
  // TODO(Ben): decide what the grid shows. Title + date is the default.
  // Options: title only (quietest, most gallery-like); title + year only;
  // or add a location line when a photo has one (e.g. photo.location).
  function tileCaption(photo) {
    return [
      { text: photo.title, className: "work__title" },
      { text: photo.when, className: "work__date" },
    ];
  }

  // Full MoMA-style wall label: bold name, italic title, date.
  function wallLabel(photo) {
    return [
      el("p", "label__artist", artist),
      el("p", "label__title", photo.title),
      el("p", "label__date", photo.when),
    ];
  }

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }

  // An <img> for real photos (the 1200px copy, or the 2400px one when
  // full is set), or a grey box of the same proportions for an entry with
  // no file. Both get the same sizing hooks.
  function createMedia(photo, className, { lazy, full = false }) {
    let media;
    const src = full ? photo.full : photo.thumb;

    if (src) {
      media = document.createElement("img");
      media.src = src;
      media.alt = `${photo.title}, ${photo.when}`;
      media.width = photo.width;
      media.height = photo.height;
      media.decoding = "async";
      if (lazy) media.loading = "lazy";
    } else {
      const d = gcd(photo.width, photo.height);
      media = el("span", "placeholder", `${photo.width / d}:${photo.height / d}`);
      media.setAttribute("role", "img");
      media.setAttribute("aria-label", `Placeholder for ${photo.title}`);
    }

    media.classList.add(className);
    media.style.setProperty("--ratio", `${photo.width} / ${photo.height}`);
    media.style.setProperty("--ratio-n", photo.width / photo.height);
    return media;
  }

  /* ------------------------------------------------------------------------
     Grid
     ------------------------------------------------------------------------ */

  function renderTile(photo, index) {
    const item = el("li");
    const button = el("button", "work");
    button.type = "button";
    button.dataset.index = index;
    button.setAttribute("aria-haspopup", "dialog");

    // sheet (4:5 white print) > plate (sized to the photo) > media + caption
    const sheet = el("span", "work__sheet");
    const plate = el("span", "work__plate");
    plate.style.setProperty("--ratio-n", photo.width / photo.height);

    const caption = el("span", "work__caption");
    for (const line of tileCaption(photo)) {
      if (line.text) caption.append(el("span", line.className, line.text));
    }

    plate.append(createMedia(photo, "work__media", { lazy: index > 3 }), caption);
    sheet.append(el("span", "work__no", String(index + 1).padStart(2, "0")), plate);
    button.append(sheet);
    item.append(button);
    return item;
  }

  /* ------------------------------------------------------------------------
     Opening screen
     ------------------------------------------------------------------------ */

  const opening = document.querySelector(".opening");
  const print = opening.querySelector(".opening__print");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ?opening=print or ?opening=name overrides the mode set in index.html.
  const requested = new URLSearchParams(location.search).get("opening");
  if (requested === "print" || requested === "name") opening.dataset.opening = requested;
  document.body.dataset.opening = opening.dataset.opening;   // lets the header style itself to match
  const printMode = opening.dataset.opening === "print" && photos.length > 0;

  // The cover (photos.js "cover", or the newest if that isn't set). While
  // it is on the opening screen it stays out of the grid, so it is shown
  // once; with the name opening it takes its place in the grid as usual.
  const coverPhoto = printMode ? photos.find((photo) => photo.file === cover) || photos[0] : null;
  const works = photos.filter((photo) => photo !== coverPhoto);

  grid.replaceChildren(...works.map(renderTile));

  // Mounted on the same sheet as the grid tiles, with the same caption
  // under the photograph; the caption fades in as the print grows.
  if (coverPhoto) {
    const sheet = el("span", "work__sheet");
    const plate = el("span", "work__plate");
    plate.style.setProperty("--ratio-n", coverPhoto.width / coverPhoto.height);

    const caption = el("span", "work__caption");
    for (const line of tileCaption(coverPhoto)) {
      if (line.text) caption.append(el("span", line.className, line.text));
    }

    plate.append(createMedia(coverPhoto, "work__media", { lazy: false }), caption);
    sheet.append(plate);
    print.append(sheet);
    print.setAttribute("aria-label", `View ${coverPhoto.title}, ${coverPhoto.when}`);
    print.addEventListener("click", () => openCover(print));
  }

  // Over the first 60% of a screen of scrolling, the print grows from a
  // small object in the white to a sheet that nearly fills the viewport.
  // The rest of the .runway (40%, see style.css) holds it there at full
  // size before the gallery slides up.
  const GROW = 0.6;

  function growPrint() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const small = vw < 600 ? 96 : 132;
    // 86% of the height left clear of the pinned header (top and bottom, so
    // the print stays centred), at 4:5.
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar")) || 0;
    const large = Math.min((vh - 2 * bar) * 0.86 * 0.8, vw * 0.9);
    const distance = vh * GROW;
    const p = reduceMotion.matches ? 0 : Math.min(Math.max(window.scrollY / distance, 0), 1);
    const eased = p * p * (3 - 2 * p);                    // smoothstep: slow, fast, slow
    print.style.width = `${small + (large - small) * eased}px`;
    // The caption appears over the last 40% of the growth: invisible while
    // the print is too small to hold it, fully there once it's full size.
    print.style.setProperty("--reveal", Math.min(Math.max((eased - 0.6) / 0.4, 0), 1));
  }

  /* ------------------------------------------------------------------------
     Viewing room

     The grid scrolls inside its own area (.gallery), where CSS scroll-snap
     locks each row in the centre as part of the scroll itself. That area
     only takes scrolling once the room fills the screen; until then the
     page scrolls, carrying the room up over the opening.
     ------------------------------------------------------------------------ */

  const room = document.querySelector("[data-gallery]");

  // Keep prints shorter than the room, then pad the grid so the first and
  // last rows can rest in its centre.
  function fitRoom() {
    const height = room.clientHeight;
    grid.style.setProperty("--sheet-max", `${Math.floor((height * 0.88) / 1.25)}px`);  // 88% of the height, at 4:5
    const row = grid.firstElementChild;
    const lead = row ? (height - row.offsetHeight) / 2 : 48;
    grid.style.setProperty("--lead", `${Math.max(24, Math.round(lead))}px`);
  }

  let live = false;
  let swallow = false;         // ignore the rest of the gesture that brought the room in

  function updateRoom() {
    const end = document.documentElement.scrollHeight - window.innerHeight;
    const now = window.scrollY >= end - 2;
    if (now && !live) swallow = true;
    live = now;
    room.classList.toggle("is-live", live);
  }

  new ResizeObserver(fitRoom).observe(room);
  fitRoom();

  /* ------------------------------------------------------------------------
     Row stepping

     Touch scrolling uses the browser's own snapping (scroll-snap on
     .gallery), which folds the snap into the swipe's momentum. Mouse wheels
     and trackpads don't get that: the browser scrolls by the wheel amount,
     then snaps back to the nearest row, so small scrolls go nowhere and the
     motion comes in two parts. So for wheel and keyboard input, each
     gesture becomes one eased glide straight to the next row. Input that
     arrives mid-glide extends it to the row after, without stopping.
     ------------------------------------------------------------------------ */

  const paper = document.querySelector(".paper");
  const header = document.querySelector(".site-header");   // pinned above the room; scrolling over it moves the grid too
  const GLIDE_MS = 600;

  // A glide is a cubic curve from p0 to p1 that starts at speed v0 and
  // comes to rest at p1. From a standstill (v0 = 0) it is a plain ease in
  // and out. Redirected mid-glide, it starts at the current speed, so the
  // motion carries straight on into the next row without a stall or a jolt.
  let glide = null;            // { p0, p1, v0, start } while gliding (v0 in px per glide)

  function progress(g, now) {
    return Math.min((now - g.start) / GLIDE_MS, 1);
  }

  function position(g, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return g.p0 * (2 * t3 - 3 * t2 + 1) + g.v0 * (t3 - 2 * t2 + t) + g.p1 * (3 * t2 - 2 * t3);
  }

  function velocity(g, t) {
    const t2 = t * t;
    return g.p0 * (6 * t2 - 6 * t) + g.v0 * (3 * t2 - 4 * t + 1) + g.p1 * (6 * t - 6 * t2);
  }

  function glideTo(target) {
    const now = performance.now();
    // Mid-glide, continue from the curve's exact position: scrollTop reads
    // back rounded, and restarting from it would nudge the page backwards.
    const p0 = glide ? position(glide, progress(glide, now)) : room.scrollTop;
    const distance = target - p0;
    let v0 = glide ? velocity(glide, progress(glide, now)) : 0;
    // Only carry speed that heads the same way, and never so much that the
    // curve would overshoot the row.
    if (Math.sign(v0) !== Math.sign(distance)) v0 = 0;
    else if (Math.abs(v0) > Math.abs(3 * distance)) v0 = 3 * distance;

    const already = glide !== null;
    glide = { p0, p1: target, v0, start: now };
    room.style.scrollSnapType = "none";   // native snapping would fight each frame
    if (!already) requestAnimationFrame(frame);
  }

  // Every scroll position where a row (or the footer) rests, top to bottom.
  function stops() {
    const roomTop = room.getBoundingClientRect().top;
    const half = room.clientHeight / 2;
    const max = room.scrollHeight - room.clientHeight;
    const list = new Set([max]);
    for (const item of grid.children) {
      const box = item.getBoundingClientRect();
      const centre = box.top - roomTop + room.scrollTop + box.height / 2;
      list.add(Math.round(Math.min(max, Math.max(0, centre - half))));
    }
    return [...list].sort((a, b) => a - b);
  }

  function nearest(list, y) {
    return list.reduce((best, p, i) => (Math.abs(p - y) < Math.abs(list[best] - y) ? i : best), 0);
  }

  function frame(now) {
    if (!glide) return;
    const t = progress(glide, now);
    room.scrollTop = position(glide, t);
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      glide = null;
      room.style.scrollSnapType = "";   // native snapping back on, exactly on a row
    }
  }

  // Move one row up (-1) or down (1). Returns false at either end.
  function step(dir) {
    const list = stops();
    const from = nearest(list, glide ? glide.p1 : room.scrollTop);
    const to = from + dir;
    if (to < 0 || to >= list.length) return false;

    if (reduceMotion.matches) room.scrollTop = list[to];
    else glideTo(list[to]);
    return true;
  }

  // At the first row, scrolling up belongs to the page again (back to the
  // opening), so leave that input alone.
  const atFirstRow = () => !glide && room.scrollTop <= 1;

  // Wheel and trackpad. Events less than 120ms apart are one gesture, and
  // a gesture moves one row. A mouse wheel that keeps spinning carries on
  // into the next row as each glide nears its end; a trackpad's fading
  // momentum (each movement smaller than the last) doesn't.
  let lastWheel = 0;
  let travel = 0;              // distance scrolled in this gesture so far
  let peak = 0;                // largest single movement in this gesture
  let stepped = false;

  window.addEventListener("wheel", (event) => {
    const now = performance.now();
    const fresh = now - lastWheel > 120;
    lastWheel = now;             // tracked everywhere, so arrival isn't mistaken for a new gesture
    if (fresh) {
      travel = 0;
      peak = 0;
      stepped = false;
      swallow = false;
    }

    if (!live || !(paper.contains(event.target) || header.contains(event.target))) return;
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    const dir = Math.sign(event.deltaY);
    if (fresh && dir < 0 && atFirstRow()) return;
    event.preventDefault();
    if (swallow) return;

    const scale = event.deltaMode === 1 ? 40 : 1;   // lines to pixels
    const size = Math.abs(event.deltaY) * scale;
    travel += event.deltaY * scale;

    if (!stepped && Math.abs(travel) >= 30) {
      stepped = true;
      step(Math.sign(travel));
    } else if (stepped && size >= 30 && size >= peak * 0.9 && (!glide || progress(glide, now) > 0.6)) {
      step(dir);
    }
    peak = Math.max(peak, size);
  }, { passive: false });

  // Keyboard: arrows, Page Up/Down and Space step a row at a time.
  window.addEventListener("keydown", (event) => {
    if (!live || viewer.open || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key === " " && event.target.closest("button, a")) return;

    const keys = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1, " ": event.shiftKey ? -1 : 1 };
    const dir = keys[event.key];
    if (!dir || (dir < 0 && atFirstRow())) return;
    event.preventDefault();
    step(dir);
  });

  // Work, About and the header's hairline fade in once the grid has slid
  // halfway up the screen.
  function updateHeader() {
    const arriving = paper.getBoundingClientRect().top < window.innerHeight * 0.5;
    document.body.classList.toggle("in-room", arriving);
  }

  let ticking = false;
  function onScroll() {
    ticking = false;
    if (printMode) growPrint();
    updateRoom();
    updateHeader();
  }

  function requestTick() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick);
  onScroll();

  /* ------------------------------------------------------------------------
     Viewer
     ------------------------------------------------------------------------ */

  const viewer = document.querySelector("[data-viewer]");
  const stage = viewer.querySelector("[data-viewer-stage]");
  const label = viewer.querySelector("[data-viewer-label]");
  const count = viewer.querySelector("[data-viewer-count]");

  let current = 0;
  let opener = null;
  let solo = false;            // true while showing the cover on its own

  function display(photo) {
    const media = createMedia(photo, "viewer__media", { lazy: false, full: true });
    if (media.tagName === "IMG") {
      const reveal = () => media.classList.add("is-loaded");
      if (media.complete) reveal();
      else media.addEventListener("load", reveal, { once: true });
    }
    stage.replaceChildren(media);
    label.replaceChildren(...wallLabel(photo));
  }

  // One of the grid's works, with Previous/Next through the rest.
  function show(index) {
    solo = false;
    viewer.classList.remove("is-solo");
    current = (index + works.length) % works.length;
    display(works[current]);
    count.textContent = `${current + 1} / ${works.length}`;

    // Warm the cache for the neighbours so Previous/Next feel instant.
    for (const step of [-1, 1]) {
      const next = works[(current + step + works.length) % works.length];
      if (next.full) new Image().src = next.full;
    }
  }

  function move(step) {
    if (!solo) show(current + step);
  }

  function open(index, trigger) {
    opener = trigger;
    show(index);
    viewer.showModal();
  }

  // The cover stands apart from the numbered works: no counter, no
  // Previous/Next.
  function openCover(trigger) {
    opener = trigger;
    solo = true;
    viewer.classList.add("is-solo");
    display(coverPhoto);
    count.textContent = "";
    viewer.showModal();
  }

  grid.addEventListener("click", (event) => {
    const tile = event.target.closest(".work");
    if (tile) open(Number(tile.dataset.index), tile);
  });

  viewer.querySelector("[data-viewer-close]").addEventListener("click", () => viewer.close());
  viewer.querySelector("[data-viewer-prev]").addEventListener("click", () => move(-1));
  viewer.querySelector("[data-viewer-next]").addEventListener("click", () => move(1));

  viewer.addEventListener("close", () => {
    stage.replaceChildren();
    if (opener) opener.focus();
  });

  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });

  // Clicking the white space around the photograph closes the viewer.
  stage.addEventListener("click", (event) => {
    if (event.target === stage) viewer.close();
  });

  // Horizontal swipe on touch screens.
  let touchStartX = null;
  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") touchStartX = event.clientX;
  });
  stage.addEventListener("pointerup", (event) => {
    if (touchStartX === null) return;
    const dx = event.clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) > 50) move(dx < 0 ? 1 : -1);
  });
})();
