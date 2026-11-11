/* 画面イメージのアニメーション
   実際の DeltaShade と同じく、カーソルが動いている間は 1 秒に約 15 回 色を読み直すので数値が揺れ、
   止まった瞬間にその場所の値で止まる。ΔE は表示している Lab から CIEDE2000 で毎回計算する。 */
(function () {
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var REF = { L: 91.94, a: 2.80, b: 11.32 };   // 基準点（左中切歯の中央、写真から実測）

  function ciede2000(x, y) {
    var d = Math.PI / 180, c1 = Math.hypot(x.a, x.b), c2 = Math.hypot(y.a, y.b), cb = (c1 + c2) / 2;
    var g = 0.5 * (1 - Math.sqrt(Math.pow(cb, 7) / (Math.pow(cb, 7) + Math.pow(25, 7))));
    var a1 = (1 + g) * x.a, a2 = (1 + g) * y.a, c1p = Math.hypot(a1, x.b), c2p = Math.hypot(a2, y.b);
    function hue(b, a) { if (b === 0 && a === 0) return 0; var h = Math.atan2(b, a) / d; return h >= 0 ? h : h + 360; }
    var h1 = hue(x.b, a1), h2 = hue(y.b, a2), dL = y.L - x.L, dC = c2p - c1p, dh = 0;
    if (c1p * c2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    var dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(dh / 2 * d), Lb = (x.L + y.L) / 2, Cb = (c1p + c2p) / 2, Hb = h1 + h2;
    if (c1p * c2p !== 0) Hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2);
    var T = 1 - 0.17 * Math.cos((Hb - 30) * d) + 0.24 * Math.cos(2 * Hb * d) + 0.32 * Math.cos((3 * Hb + 6) * d) - 0.20 * Math.cos((4 * Hb - 63) * d);
    var dT = 30 * Math.exp(-Math.pow((Hb - 275) / 25, 2)), Rc = 2 * Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7)));
    var l50 = (Lb - 50) * (Lb - 50), SL = 1 + 0.015 * l50 / Math.sqrt(20 + l50), SC = 1 + 0.045 * Cb, SH = 1 + 0.015 * Cb * T;
    var RT = -Math.sin(2 * dT * d) * Rc, tl = dL / SL, tc = dC / SC, th = dH / SH;
    return Math.sqrt(tl * tl + tc * tc + th * th + RT * tc * th);
  }
  function labToHex(l) {
    var fy = (l.L + 16) / 116, fx = fy + l.a / 500, fz = fy - l.b / 200, e = 216 / 24389, k = 24389 / 27;
    function inv(f) { return f * f * f > e ? f * f * f : (116 * f - 16) / k; }
    var X = inv(fx) * 0.96422, Y = l.L > k * e ? fy * fy * fy : l.L / k, Z = inv(fz) * 0.82521;
    var x = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z, y = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z, z = 0.0122982 * X - 0.0204830 * Y + 1.3299098 * Z;
    var rgb = [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.9692660 * x + 1.8760108 * y + 0.0415560 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
    return "#" + rgb.map(function (v) {
      v = Math.min(1, Math.max(0, v)); v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return ("0" + Math.round(v * 255).toString(16)).slice(-2);
    }).join("");
  }
  function f2(v) { return v.toFixed(2); }
  function f1(v) { return v.toFixed(1); }
  function sd(v) { return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(2); }
  function cls(de) { var s = Math.round(de * 100) / 100; return s < 1.5 ? "de-green" : s < 3 ? "de-blue" : s < 6 ? "de-orange" : "de-red"; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(p, q, t) { return { L: lerp(p.L, q.L, t), a: lerp(p.a, q.a, t), b: lerp(p.b, q.b, t) }; }
  function jitter(l) {   // 動いている間に読み取る、カーソル下の細かい色のばらつき
    return { L: l.L + (Math.random() * 2 - 1) * 6, a: l.a + (Math.random() * 2 - 1) * 3, b: l.b + (Math.random() * 2 - 1) * 7 };
  }
  var SAMPLE_MS = 66;  // 1 秒に約 15 回

  /* ---- 見出しの画面イメージ：歯から歯へ ---- */
  (function () {
    function $(id) { return document.getElementById(id); }
    var cur = $("hv-cursor"), ov = $("hv-overlay"), scene = document.querySelector(".scene");
    if (!cur || !ov) return;
    var pts = [
      { x: 76.2, y: 45.9, lab: { L: 89.38, a: 3.53, b: 15.13 }, rgb: "#f0ddc3" },
      { x: 59.9, y: 45.9, lab: { L: 95.54, a: 1.38, b: 6.60 }, rgb: "#f9f0e5" },
      { x: 40.0, y: 37.1, lab: { L: 88.39, a: 5.48, b: 21.27 }, rgb: "#f3d9b5" },
      { x: 23.8, y: 45.9, lab: { L: 90.19, a: 2.97, b: 12.30 }, rgb: "#efe0cb" }
    ];
    function place(x, y) {
      cur.style.left = x + "%"; cur.style.top = y + "%";
      ov.style.left = x + "%"; ov.style.top = y + "%";
      ov.classList.remove("flip");
      var r = ov.getBoundingClientRect(), sr = scene.getBoundingClientRect();
      if (r.right > sr.right - 6) ov.classList.add("flip");   // 画面の端だけ左に回り込む（アプリと同じ）
    }
    function values(lab, rgb) {
      var de = ciede2000(REF, lab);
      $("hv-chip").style.background = rgb || labToHex(lab); $("mc-cur").style.background = rgb || labToHex(lab);
      ["L", "a", "b"].forEach(function (k) {
        $("hv-" + k).textContent = f2(lab[k]); $("mc-" + k).textContent = f2(lab[k]);
        $("hv-d" + k).textContent = "(" + sd(lab[k] - REF[k]) + ")"; $("mc-d" + k).textContent = sd(lab[k] - REF[k]);
      });
      ["hv-de", "mc-de"].forEach(function (id) { var e = $(id); e.textContent = f2(de); e.className = cls(de); });
    }
    place(pts[0].x, pts[0].y); values(pts[0].lab, pts[0].rgb);
    if (RM) return;
    var MOVE = 900, HOLD = 1700, i = 0, t0 = performance.now(), lastSample = 0, settled = true;
    function frame(now) {
      var from = pts[i], to = pts[(i + 1) % pts.length], e = now - t0;
      if (e < MOVE) {
        var p = ease(e / MOVE);
        place(lerp(from.x, to.x, p), lerp(from.y, to.y, p));
        if (now - lastSample > SAMPLE_MS) { lastSample = now; values(jitter(mix(from.lab, to.lab, p))); }
        settled = false;
      } else {
        if (!settled) { place(to.x, to.y); values(to.lab, to.rgb); settled = true; }
        if (e > MOVE + HOLD) { i = (i + 1) % pts.length; t0 = now; }
      }
      requestAnimationFrame(frame);
    }
    setTimeout(function () { t0 = performance.now(); requestAnimationFrame(frame); }, HOLD);
  })();

  /* ---- 写真をクリックしても隠れない：8 秒で 1 周 ---- */
  (function () {
    var panels = document.querySelectorAll(".fd-panel");
    if (!panels.length) return;
    var BG = { L: 74.6, a: -3.4, b: -5.9 };           // 机（背景）の色
    var TOOTH = { L: 89.38, a: 3.53, b: 15.13 };      // 写真の歯（右側切歯）
    var START = { x: 24, y: 80 }, TARGET = { x: 46, y: 44 };
    var P = [].map.call(panels, function (el) {
      return {
        cursor: el.querySelector(".fd-cursor"), click: el.querySelector(".fd-click"), photo: el.querySelector(".fd-photo"),
        note: el.querySelector(".fd-note"), mag: el.querySelector(".fd-mag"), vals: el.querySelector(".fd-vals"),
        ds: el.querySelector(".fd-ds"), cmp: el.querySelector(".fd-compare")
      };
    });
    function show(lab, x, y) {
      P.forEach(function (p) {
        p.cursor.style.left = x + "%"; p.cursor.style.top = y + "%";
        if (p.ds) {
          p.ds.style.left = "calc(" + x + "% + 16px)"; p.ds.style.top = "calc(" + y + "% + 18px)";
          var de = ciede2000(REF, lab);
          var rows = ["L", "a", "b"].map(function (k) {
            return "<tr><td>" + k + "</td><td>" + f2(lab[k]) + '</td><td class="diff">(' + sd(lab[k] - REF[k]) + ")</td></tr>";
          }).join("");
          p.ds.innerHTML = '<div class="de"><span>ΔE00</span><em class="' + cls(de) + '">' + f2(de) + '</em></div><div class="row"><div class="chip" style="background:' + labToHex(lab) + '"></div><table>' + rows + "</table></div>";
        }
        if (p.cmp) {
          var de2 = ciede2000(REF, lab);
          p.cmp.querySelector(".fdc-cur").style.background = labToHex(lab);
          ["L", "a", "b"].forEach(function (k) {
            p.cmp.querySelector(".fdc-" + k).textContent = f2(lab[k]);
            p.cmp.querySelector(".fdc-d" + k).textContent = sd(lab[k] - REF[k]);
          });
          p.cmp.querySelector(".fdc-de").innerHTML = 'ΔE00 <b class="' + cls(de2) + '">' + f2(de2) + "</b>";
        }
        if (p.vals) { p.vals.innerHTML = "L* " + f1(lab.L) + "<br>a* " + f1(lab.a) + "<br>b* " + f1(lab.b); p.mag.style.background = labToHex(lab); }
      });
    }
    function raise(on) { P.forEach(function (p) { p.photo.style.zIndex = on ? 4 : 1; }); }
    function note(on) { P.forEach(function (p) { p.note.style.opacity = on ? 1 : 0; }); }
    function ripple() {
      P.forEach(function (p) { p.click.classList.remove("go"); void p.click.offsetWidth; p.click.classList.add("go"); });
    }
    if (RM) { show(TOOTH, TARGET.x, TARGET.y); raise(true); note(true); return; }
    show(BG, START.x, START.y); raise(false); note(false);
    var CYCLE = 8000, t0 = performance.now(), last = 0, phase = "";
    function frame(now) {
      var t = (now - t0) % CYCLE;
      if (t < 2000) {                                   // 写真へ移動（数値が揺れる）
        if (phase !== "in") { phase = "in"; raise(false); note(false); }
        var p = ease(t / 2000);
        var lab = mix(BG, TOOTH, p);
        if (now - last > SAMPLE_MS) { last = now; P.forEach(function () {}); show(jitter(lab), lerp(START.x, TARGET.x, p), lerp(START.y, TARGET.y, p)); }
        else P.forEach(function (q) {
          q.cursor.style.left = lerp(START.x, TARGET.x, p) + "%"; q.cursor.style.top = lerp(START.y, TARGET.y, p) + "%";
          if (q.ds) { q.ds.style.left = "calc(" + lerp(START.x, TARGET.x, p) + "% + 16px)"; q.ds.style.top = "calc(" + lerp(START.y, TARGET.y, p) + "% + 18px)"; }
        });
      } else if (t < 6800) {                            // 止まる → クリック
        if (phase !== "stop") { phase = "stop"; show(TOOTH, TARGET.x, TARGET.y); }
        if (t > 2640 && phase === "stop") { phase = "click"; ripple(); raise(true); }
        if (t > 2900) note(true);
      } else {                                          // 元の位置へ戻る（数値が揺れる）
        if (phase !== "out") { phase = "out"; note(false); }
        var q2 = ease((t - 6800) / 1200);
        if (t > 7400) raise(false);
        if (now - last > SAMPLE_MS) { last = now; show(jitter(mix(TOOTH, BG, q2)), lerp(TARGET.x, START.x, q2), lerp(TARGET.y, START.y, q2)); }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();
})();
