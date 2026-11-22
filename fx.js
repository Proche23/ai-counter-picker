"use strict";
/* Small touches shared by every page:
   - a spark where you click a button, a suggestion, a champion or a switch
   - sliders filled with gold up to their thumb (from the middle when the range runs through 0) */
(() => {
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const CLICKABLE = "button, .rec, .cell:not(.used), .chip[data-c], .ban.filled, .pick .role, label.chk, label.check, .suggest li, .sugg div";
  const TEAL = ".gold, .team-btn.blue, label.chk, label.check";
  const RED = ".del, .ban-it, .team-btn.red, .ban.filled";

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || calm.matches) return;
    const t = e.target.closest?.(CLICKABLE);
    if (!t || t.disabled) return;
    const s = document.createElement("span");
    s.className = `spark${t.matches(RED) ? " red" : t.matches(TEAL) ? " teal" : ""}`;
    s.style.left = `${e.clientX}px`;
    s.style.top = `${e.clientY}px`;
    s.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }, { passive: true });

  // sliders: --from/--to are where the gold fill starts and ends
  const fill = (r) => {
    const min = Number(r.min || 0), max = Number(r.max || 100), v = Number(r.value);
    if (!(max > min)) return;
    const at = (x) => `${(((x - min) / (max - min)) * 100).toFixed(2)}%`;
    const zero = min < 0 && max > 0 ? 0 : min;   // a range through 0 (gold difference) fills from the middle
    r.style.setProperty("--from", at(Math.min(zero, v)));
    r.style.setProperty("--to", at(Math.max(zero, v)));
  };
  const fillAll = (root) => root.querySelectorAll?.('input[type="range"]').forEach(fill);
  document.addEventListener("input", (e) => { if (e.target.matches?.('input[type="range"]')) fill(e.target); }, true);
  const watch = () => {
    fillAll(document);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches('input[type="range"]')) fill(n); else fillAll(n); }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
  window.fxFill = fill;   // for pages that set a slider's value from code
})();

/* Tooltips: every title="" on the site shows in a styled bubble (above the element, or below when
   there's no room), after a short pause, for the mouse and for keyboard focus. The browser's own
   plain tooltip is suppressed by moving the text to data-tip on first hover. */
(() => {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.id = "acp-tip";
  tip.setAttribute("role", "tooltip");
  let cur = null, timer = 0, shownAt = 0;
  const textOf = (el) => {
    if (el.hasAttribute("title")) {
      const t = el.getAttribute("title");
      if (t) el.dataset.tip = t;
      el.removeAttribute("title");
    }
    return el.dataset.tip || "";
  };
  const place = (el) => {
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(innerWidth - tw - 8, x));
    let y = r.top - th - 10, below = false;
    if (y < 8) { y = r.bottom + 10; below = true; }
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
    tip.classList.toggle("below", below);
    tip.style.setProperty("--ax", `${Math.round(Math.max(10, Math.min(tw - 10, r.left + r.width / 2 - x)))}px`);
  };
  const show = (el) => {
    const t = textOf(el);
    if (!t || !el.isConnected) return;
    cur = el;
    tip.textContent = t;
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.classList.remove("on");
    place(el);
    requestAnimationFrame(() => tip.classList.add("on"));
    el.setAttribute("aria-describedby", tip.id);
    shownAt = performance.now();
  };
  const hide = () => {
    clearTimeout(timer);
    if (cur) cur.removeAttribute("aria-describedby");
    cur = null;
    tip.classList.remove("on");
  };
  const target = (n) => n?.closest?.("[title], [data-tip]");
  document.addEventListener("mouseover", (e) => {
    const el = target(e.target);
    if (el === cur) return;
    const quick = cur && performance.now() - shownAt < 1500;   // moving along a row of buttons: no second wait
    hide();
    if (!el) return;
    textOf(el);
    timer = setTimeout(() => show(el), quick ? 60 : 420);
  }, { passive: true });
  document.addEventListener("mouseout", (e) => {
    const el = target(e.target);
    if (el && !el.contains(e.relatedTarget)) { clearTimeout(timer); if (cur === el) hide(); }
  }, { passive: true });
  document.addEventListener("focusin", (e) => {
    const el = target(e.target);
    if (!el || !e.target.matches?.(":focus-visible")) return;
    hide();
    timer = setTimeout(() => show(el), 300);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  addEventListener("scroll", () => { if (cur) hide(); }, { passive: true, capture: true });
  addEventListener("blur", hide);
})();

/* Toasts: short notes at the bottom of the window, with an optional action button (Undo).
   acpToast("Draft cleared", { action: "Undo", run: fn, kind: "good" | "warn" | "bad", ms }) */
(() => {
  let box = null;
  const region = () => {
    if (box?.isConnected) return box;
    box = document.createElement("div");
    box.className = "toasts";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
    return box;
  };
  window.acpToast = (msg, opt = {}) => {
    const r = region();
    const t = document.createElement("div");
    t.className = `toast2 ${opt.kind || ""}`;
    const txt = document.createElement("span");
    txt.className = "tx";
    txt.textContent = msg;
    t.append(Object.assign(document.createElement("i"), { className: "gem" }), txt);
    let gone = false;
    const close = () => {
      if (gone) return;
      gone = true;
      t.classList.add("out");
      setTimeout(() => t.remove(), 260);
    };
    if (opt.action && opt.run) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tact";
      b.textContent = opt.action;
      b.addEventListener("click", () => { close(); opt.run(); });
      t.append(b);
    }
    const x = document.createElement("button");
    x.type = "button";
    x.className = "tx-close";
    x.setAttribute("aria-label", "Close");
    x.textContent = "×";
    x.addEventListener("click", close);
    t.append(x);
    while (r.children.length >= 3) r.firstElementChild.remove();
    r.append(t);
    requestAnimationFrame(() => t.classList.add("in"));
    let left = opt.ms || (opt.action ? 6000 : 2800), at = performance.now(), tm = setTimeout(close, left);
    t.addEventListener("mouseenter", () => { clearTimeout(tm); left -= performance.now() - at; });
    t.addEventListener("mouseleave", () => { at = performance.now(); tm = setTimeout(close, Math.max(1200, left)); });
    return close;
  };
})();
