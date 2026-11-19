(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var DEMO = params.has('demo');            // ?demo=1 -> sense càmera, per provar a l'ordinador
  var CFG = window.CONFIG;
  var BOOKS = window.BOOKS;
  var U = 1 / CFG.sheet.widthCm;            // 1 unitat de MindAR = amplada del paper

  var ESTATS = {
    lliure:   { text: 'Lliure per agafar',                 color: '#27ae60' },
    pendent:  { text: 'Escollit (pendent de confirmació)', color: '#e67e22' },
    escollit: { text: 'Escollit',                          color: '#c0392b' }
  };

  var estats = {};
  BOOKS.forEach(function (b) { estats[b.id] = 'lliure'; });
  var bookEls = {};
  var doors = [];
  var currentId = null;
  var doorsOpen = false;
  var sceneEl, rootEl;

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ------------------------------------------------------------------
  //  TEXTURES METÀL·LIQUES DEL MOBLE (generades en canvas lleuger 256x256)
  // ------------------------------------------------------------------
  var CAB_TEX = null;

  function seededRand(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function makeMetalTex(opts) {
    var S = 256;
    var cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    var ctx = cv.getContext('2d');
    var rnd = seededRand(opts.seed || 101);

    ctx.fillStyle = opts.base;
    ctx.fillRect(0, 0, S, S);

    // Taques suaus de desgast / pols mate
    for (var i = 0; i < (opts.clouds || 22); i++) {
      var cx = rnd() * S, cy = rnd() * S;
      var rad = (0.15 + rnd() * 0.3) * S;
      var g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
      g.addColorStop(0, rnd() > 0.45 ? opts.lightTint : opts.darkTint);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }

    // Gra fi de pintura metàl·lica
    for (var p = 0; p < 1400; p++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(20,16,12,0.065)';
      ctx.fillRect(rnd() * S, rnd() * S, 1.4, 1.4);
    }

    // Micro-ratllades d'ús
    ctx.lineWidth = 1;
    for (var sc = 0; sc < (opts.scratches || 24); sc++) {
      var x1 = rnd() * S, y1 = rnd() * S;
      var ang = rnd() * Math.PI * 2;
      var len = 8 + rnd() * 32;
      ctx.strokeStyle = rnd() > 0.4 ? 'rgba(255,248,235,0.075)' : 'rgba(25,20,16,0.075)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Petits punts d'òxid / desgast
    for (var r = 0; r < (opts.rust || 0); r++) {
      ctx.fillStyle = 'rgba(112, 74, 42, 0.24)';
      ctx.beginPath();
      ctx.arc(rnd() * S, rnd() * S, 1 + rnd() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nervadures verticals estampades
    if (opts.ribs) {
      for (var rb = 0; rb < opts.ribs.length; rb++) {
        var rxPos = opts.ribs[rb] * S;
        var grad = ctx.createLinearGradient(rxPos - 7, 0, rxPos + 7, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.35, 'rgba(25,20,15,0.2)');
        grad.addColorStop(0.5, 'rgba(255,252,244,0.18)');
        grad.addColorStop(0.65, 'rgba(25,20,15,0.2)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(rxPos - 7, 0, 14, S);
      }
    }

    return cv.toDataURL('image/png');
  }

  function getCabTextures() {
    if (CAB_TEX) return CAB_TEX;
    var col = CFG.cabinet.colors;
    try {
      CAB_TEX = {
        door:   'src: url(' + makeMetalTex({ seed: 17, base: col.door, lightTint: 'rgba(225,215,202,0.15)', darkTint: 'rgba(38,30,24,0.17)', clouds: 26, scratches: 30 }) + '); roughness: 0.78; metalness: 0.14; npot: true',
        body:   'src: url(' + makeMetalTex({ seed: 42, base: col.body, lightTint: 'rgba(255,250,232,0.15)', darkTint: 'rgba(92,82,58,0.17)', clouds: 22, scratches: 24, rust: 28 }) + '); roughness: 0.80; metalness: 0.12; npot: true',
        inside: 'src: url(' + makeMetalTex({ seed: 73, base: col.inside, lightTint: 'rgba(245,238,218,0.11)', darkTint: 'rgba(55,50,42,0.19)', clouds: 18, scratches: 18, ribs: [0.22, 0.5, 0.78] }) + '); roughness: 0.85; metalness: 0.08; npot: true',
        shelf:  'src: url(' + makeMetalTex({ seed: 91, base: col.shelf, lightTint: 'rgba(235,244,250,0.16)', darkTint: 'rgba(52,64,74,0.16)', clouds: 16, scratches: 32 }) + '); roughness: 0.65; metalness: 0.20; npot: true',
        handle: 'roughness: 0.28; metalness: 0.55'
      };
    } catch (e) {
      console.warn('Textures fallback:', e);
      CAB_TEX = {};
    }
    return CAB_TEX;
  }

  function box(w, h, d, x, y, z, color, parent, matKey) {
    var attrs = { width: w, height: h, depth: d, position: x + ' ' + y + ' ' + z };
    var tex = matKey ? getCabTextures()[matKey] : null;
    if (tex) {
      attrs.material = tex;
      if (matKey === 'handle') attrs.color = color;
    } else {
      attrs.color = color;
    }
    return el('a-box', attrs, parent);
  }

  // ------------------------------------------------------------------
  //  TEXTURES I MATERIALS DELS LLIBRES (tapa de tela/cartró + fulls + portada)
  // ------------------------------------------------------------------
  var BOOK_SHARED = null;
  var BOOK_MAT_REGISTRY = {};
  var BOOK_MAT_SEQ = 0;

  function getBookSharedAssets() {
    if (BOOK_SHARED) return BOOK_SHARED;
    var THREE = window.AFRAME && AFRAME.THREE;
    if (!THREE) return null;
    var rnd = seededRand(303);

    // 1. Textura de relleu (bump) de tapa dura / tela editorial + plec del llom
    var coverBumpCv = document.createElement('canvas');
    coverBumpCv.width = 256;
    coverBumpCv.height = 256;
    var bctx = coverBumpCv.getContext('2d');
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 256, 256);

    // Trama fina de tela / paper rugós
    for (var y = 0; y < 256; y += 2) {
      for (var x = 0; x < 256; x += 2) {
        var v = 120 + Math.floor(rnd() * 18) + (((x + y) % 4 === 0) ? 5 : -4);
        bctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        bctx.fillRect(x, y, 2, 2);
      }
    }
    // Solc vertical del plec d'obertura prop del llom
    var crease = bctx.createLinearGradient(14, 0, 28, 0);
    crease.addColorStop(0, 'rgba(70,70,70,0)');
    crease.addColorStop(0.5, 'rgba(45,45,45,0.65)');
    crease.addColorStop(1, 'rgba(70,70,70,0)');
    bctx.fillStyle = crease;
    bctx.fillRect(14, 0, 14, 256);

    var coverBump = new THREE.CanvasTexture(coverBumpCv);
    coverBump.wrapS = coverBump.wrapT = THREE.RepeatWrapping;

    // 2. Textura de fulls apilats (es veu als cantells del llibre)
    var pagesCv = document.createElement('canvas');
    pagesCv.width = 128;
    pagesCv.height = 256;
    var pctx = pagesCv.getContext('2d');
    pctx.fillStyle = '#f3ede0';
    pctx.fillRect(0, 0, 128, 256);
    for (var px = 0; px < 128; px += 2) {
      var shade = 224 + Math.floor(rnd() * 24);
      pctx.fillStyle = 'rgb(' + shade + ',' + (shade - 6) + ',' + (shade - 18) + ')';
      pctx.fillRect(px, 0, 1, 256);
    }
    for (var py = 0; py < 256; py += 3) {
      pctx.fillStyle = rnd() > 0.5 ? 'rgba(140,120,90,0.14)' : 'rgba(255,252,245,0.2)';
      pctx.fillRect(0, py, 128, 1);
    }

    var pagesMap = new THREE.CanvasTexture(pagesCv);
    if (THREE.SRGBColorSpace) pagesMap.colorSpace = THREE.SRGBColorSpace;
    pagesMap.wrapS = pagesMap.wrapT = THREE.RepeatWrapping;

    var pagesMat = new THREE.MeshStandardMaterial({
      map: pagesMap,
      bumpMap: pagesMap,
      bumpScale: 0.008,
      roughness: 0.88,
      metalness: 0.02
    });

    BOOK_SHARED = { coverBump: coverBump, pagesMat: pagesMat };
    return BOOK_SHARED;
  }

  function registerBookPartComponent() {
    if (!window.AFRAME || AFRAME.components['book-part']) return;
    AFRAME.registerComponent('book-part', {
      schema: { type: 'string', default: '' },
      dependencies: ['geometry', 'material'],
      init: function () { this.applyMat(); },
      update: function () { this.applyMat(); },
      applyMat: function () {
        var mat = BOOK_MAT_REGISTRY[this.data];
        var mesh = this.el.getObject3D('mesh');
        if (mat && mesh) {
          mesh.material = mat;
        }
      }
    });
  }

  function registerMat(mat) {
    var key = 'bm_' + (++BOOK_MAT_SEQ);
    BOOK_MAT_REGISTRY[key] = mat;
    return key;
  }

  function makeCoverBaseMaterial(b) {
    var THREE = window.AFRAME && AFRAME.THREE;
    var shared = getBookSharedAssets();
    if (!THREE || !shared) return null;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(b.color),
      bumpMap: shared.coverBump,
      bumpScale: 0.007,
      roughness: b.metallic ? 0.36 : 0.72,
      metalness: b.metallic ? 0.48 : 0.06
    });
  }

  function makeCoverFrontMaterial(b, img) {
    var THREE = window.AFRAME && AFRAME.THREE;
    if (!THREE || !img) return makeCoverBaseMaterial(b);
    var shared = getBookSharedAssets();
    var tex = new THREE.Texture(img);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      bumpMap: shared.coverBump,
      bumpScale: 0.003,
      roughness: 0.68,
      metalness: 0.04
    });
  }

  function isLightHex(hex) {
    var c = (hex || '').replace('#', '');
    if (c.length !== 6) return false;
    var r = parseInt(c.substr(0, 2), 16);
    var g = parseInt(c.substr(2, 2), 16);
    var b = parseInt(c.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 165;
  }

  // Construeix un llibre 3D realista (tapa frontal amb portada integrada, tapa posterior, llom i fulls)
  function buildBookMesh(parent, b, w, h, d, clickable, coverImg) {
    registerBookPartComponent();
    var shared = getBookSharedAssets();
    var baseMat = shared ? makeCoverBaseMaterial(b) : null;
    var frontMat = shared ? makeCoverFrontMaterial(b, coverImg) : null;
    var pagesMat = shared ? shared.pagesMat : null;

    var frontKey = (baseMat && frontMat)
      ? registerMat([baseMat, baseMat, baseMat, baseMat, frontMat, baseMat])
      : '';
    var baseKey = baseMat ? registerMat(baseMat) : '';
    var pagesKey = pagesMat ? registerMat(pagesMat) : '';

    var coverThick = d * 0.12;
    var pageInset = Math.min(w * 0.035, h * 0.025);
    var pageH = h - pageInset * 1.6;
    var pageW = w - pageInset;
    var pageD = d - coverThick * 2;

    // Bloc de fulls color crema (amb textura de fulles apilades als cantells)
    var pagesAttrs = {
      width: pageW,
      height: pageH,
      depth: pageD,
      position: (pageInset * 0.35) + ' 0 0',
      color: '#f4efe4'
    };
    if (pagesKey) pagesAttrs['book-part'] = pagesKey;
    var pages = el('a-box', pagesAttrs, parent);

    // Tapa davantera (la cara +Z porta directament la textura de la portada)
    var frontAttrs = {
      width: w,
      height: h,
      depth: coverThick,
      position: '0 0 ' + (d / 2 - coverThick / 2),
      color: b.color
    };
    if (frontKey) frontAttrs['book-part'] = frontKey;
    if (clickable) {
      pagesAttrs['class'] = 'clickable';
      pagesAttrs['data-id'] = b.id;
      frontAttrs['class'] = 'clickable';
      frontAttrs['data-id'] = b.id;
      backAttrs['class'] = 'clickable';
      backAttrs['data-id'] = b.id;
      spineAttrs['class'] = 'clickable';
      spineAttrs['data-id'] = b.id;
    }
    var front = el('a-box', frontAttrs, parent);

    // Tapa posterior
    var backAttrs = {
      width: w,
      height: h,
      depth: coverThick,
      position: '0 0 ' + (-d / 2 + coverThick / 2),
      color: b.color
    };
    if (baseKey) backAttrs['book-part'] = baseKey;
    var back = el('a-box', backAttrs, parent);

    // Llom (cantell esquerre, lleugerament encastat en Z perquè no trepitgi la portada frontal)
    var spineAttrs = {
      width: coverThick * 1.15,
      height: h,
      depth: Math.max(pageD, d - coverThick * 0.4),
      position: (-w / 2 + coverThick * 0.5) + ' 0 0',
      color: b.color
    };
    if (baseKey) spineAttrs['book-part'] = baseKey;
    var spine = el('a-box', spineAttrs, parent);

    return {
      front: front,
      back: back,
      spine: spine,
      pages: pages,
      coverThick: coverThick,
      mats: { baseMat: baseMat, frontMat: frontMat, pagesMat: pagesMat }
    };
  }

  // ------------------------------------------------------------------
  //  ESCENA
  // ------------------------------------------------------------------
  function buildScene() {
    var arAttr = DEMO ? '' :
      'mindar-image="imageTargetSrc: ' + CFG.targetFile + '; autoStart: false; uiLoading: no; uiScanning: no; uiError: no;"';
    var camAttr = DEMO ? 'position="0 0 12"' : 'position="0 0 0" look-controls="enabled: false"';
    var rootAttr = DEMO ? '' : 'mindar-image-target="targetIndex: 0"';

    document.body.insertAdjacentHTML('afterbegin',
      '<a-scene id="scene" ' + arAttr + ' color-space="sRGB" renderer="colorManagement: true; alpha: true" ' +
      'vr-mode-ui="enabled: false" device-orientation-permission-ui="enabled: false">' +
        (DEMO
          ? '<a-entity id="cam-rig" demo-vertical-move><a-camera ' + camAttr + ' cursor="fuse: false; rayOrigin: mouse" raycaster="far: 10000; objects: .clickable"></a-camera></a-entity>'
          : '<a-camera ' + camAttr + ' cursor="fuse: false; rayOrigin: mouse" raycaster="far: 10000; objects: .clickable"></a-camera>') +
        '<a-entity light="type: ambient; intensity: 1.15"></a-entity>' +
        '<a-entity light="type: directional; intensity: 0.95" position="1 2 3"></a-entity>' +
        '<a-entity id="root" ' + rootAttr + '></a-entity>' +
      '</a-scene>');

    sceneEl = $('scene');
    rootEl = $('root');

    if (DEMO) document.body.classList.add('demo-mode');

    sceneEl.addEventListener('loaded', function () {
      if (!DEMO && sceneEl.renderer) {
        sceneEl.renderer.setClearColor(0x000000, 0);
      }
      var canvas = sceneEl.canvas;
      if (!canvas || !window.AFRAME) return;

      var tapStart = null;
      function handleTapAt(clientX, clientY) {
        if (!doorsOpen || !$('panel').classList.contains('panel-closed')) return;
        var camEl = document.querySelector('a-camera');
        var camObj = camEl && camEl.getObject3D('camera');
        if (!camObj) return;

        var rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var ndc = new AFRAME.THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1
        );
        var ray = new AFRAME.THREE.Raycaster();
        ray.setFromCamera(ndc, camObj);

        var targets = [];
        var meshToId = new Map();
        for (var id in bookEls) {
          var rec = bookEls[id];
          if (!rec || !rec.g || !rec.g.object3D || !rec.g.object3D.visible) continue;
          rec.g.object3D.traverse(function (obj) {
            if (obj.isMesh) {
              targets.push(obj);
              meshToId.set(obj, id);
            }
          });
        }
        if (!targets.length) return;
        var hits = ray.intersectObjects(targets, false);
        if (hits.length > 0) {
          var hitId = meshToId.get(hits[0].object);
          if (hitId) openPanel(hitId);
        }
      }

      canvas.addEventListener('touchstart', function (ev) {
        if (ev.touches && ev.touches.length === 1) {
          tapStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
        } else {
          tapStart = null;
        }
      }, { passive: true });

      canvas.addEventListener('touchend', function (ev) {
        if (!tapStart || !ev.changedTouches || !ev.changedTouches.length) return;
        var touch = ev.changedTouches[0];
        var dx = touch.clientX - tapStart.x;
        var dy = touch.clientY - tapStart.y;
        var dt = Date.now() - tapStart.t;
        tapStart = null;
        if (Math.hypot(dx, dy) < 18 && dt < 500) {
          handleTapAt(touch.clientX, touch.clientY);
        }
      }, { passive: true });

      canvas.addEventListener('click', function (ev) {
        handleTapAt(ev.clientX, ev.clientY);
      });
    }, { once: true });
  }

  // ------------------------------------------------------------------
  //  ARMARI 3D (es construeix en cm i s'escala al tamany del paper)
  // ------------------------------------------------------------------
  function buildCabinet() {
    var c = CFG.cabinet, col = c.colors;
    var W = c.widthCm, H = c.heightCm, D = c.depthCm, T = c.wallCm;
    var fs = c.frame.sideCm, ft = c.frame.topCm, fb = c.frame.bottomCm;
    var st = c.shelfThicknessCm;
    var FD = 3;                                   // fondària del marc frontal

    // L'origen del grup és la cantonada inferior-esquerra-davantera de l'armari.
    var group = el('a-entity', {
      id: 'cabinet',
      position: (-CFG.sheet.fromLeftCm * U) + ' ' + (-CFG.sheet.fromBottomCm * U) + ' 0',
      scale: U + ' ' + U + ' ' + U
    }, rootEl);

    // Carcassa metàl·lica crema
    box(T, H, D, T / 2, H / 2, -D / 2, col.body, group, 'body');              // costat esquerre
    box(T, H, D, W - T / 2, H / 2, -D / 2, col.body, group, 'body');          // costat dret
    box(W, T, D, W / 2, H - T / 2, -D / 2, col.body, group, 'body');          // tapa
    box(W, T, D, W / 2, T / 2, -D / 2, col.body, group, 'body');              // base
    box(W, H, T, W / 2, H / 2, -D + T / 2, col.inside, group, 'inside');      // fons amb nervadures

    // Marc frontal crema (amb relleu superior com a la foto real)
    box(W + 1.2, ft, FD + 0.8, W / 2, H - ft / 2, -FD / 2 + 0.4, col.body, group, 'body');
    box(W, fb, FD, W / 2, fb / 2, -FD / 2, col.body, group, 'body');
    box(fs, H, FD, fs / 2, H / 2, -FD / 2, col.body, group, 'body');
    box(fs, H, FD, W - fs / 2, H / 2, -FD / 2, col.body, group, 'body');

    // Guies verticals interiors per als prestatges
    [T + 0.6, W - T - 0.6].forEach(function (gx) {
      [-(FD + 4), -(D - T - 4)].forEach(function (gz) {
        box(1.2, H - ft - fb, 0.8, gx, H / 2, gz, col.inside, group, 'inside');
      });
    });

    // Terra interior i prestatges gris-blavós
    var depthIn = D - T - FD;
    var zc = -(FD + depthIn / 2);
    var ys = [fb].concat(c.shelvesFromBottomCm).concat([H - ft]);     // de baix a dalt
    box(W - 2 * T, st, depthIn, W / 2, fb - st / 2, zc, col.shelf, group, 'shelf');
    for (var s = 1; s < ys.length - 1; s++) {
      box(W - 2 * T, st, depthIn, W / 2, ys[s], zc, col.shelf, group, 'shelf');
    }

    // Portes metàl·liques marrons (pivoten sobre les frontisses exteriors)
    var dw = (W - 2 * fs - 0.6) / 2, dh = H - ft - fb - 0.6;
    var handleY = 81 - fb;                                            // nanses a ~81 cm del terra
    [-1, 1].forEach(function (side) {
      var hingeX = side === 1 ? W - fs : fs;
      var pivot = el('a-entity', { position: hingeX + ' ' + (fb + 0.3) + ' -1.2' }, group);

      // Fulla principal de la porta
      box(dw, dh, 1.8, -side * (dw / 2 + 0.15), dh / 2, 0, col.door, pivot, 'door');

      // Nervadures verticals estampades a la cara INTERIOR de cada porta
      [-dw * 0.32, -dw * 0.68].forEach(function (ribOffset) {
        box(2.2, dh - 8, 0.5, side * ribOffset, dh / 2, -1.05, col.door, pivot, 'door');
      });

      // Frontisses cilíndriques exteriors (dalt i baix)
      [14, dh - 14].forEach(function (hy) {
        el('a-cylinder', {
          radius: 0.7, height: 6.5,
          position: hingeX + ' ' + (fb + hy) + ' 0.3',
          color: col.handle,
          material: getCabTextures().handle || ''
        }, group);
      });

      // Nanses cromades en forma de C amb bases rectangulars
      var hx = -side * (dw - 5.2);
      box(1.6, 13.5, 1.5, hx, handleY, 3.0, col.handle, pivot, 'handle');
      box(2.2, 2.6, 2.8, hx, handleY + 6.2, 1.7, col.handle, pivot, 'handle');
      box(2.2, 2.6, 2.8, hx, handleY - 6.2, 1.7, col.handle, pivot, 'handle');

      // Baldó cromat central
      if (side === 1) {
        box(5.6, 4.2, 1.5, -dw + 1.8, 97 - fb, 1.6, col.handle, pivot, 'handle');
        box(4.2, 1.2, 1.8, -dw + 0.4, 97 - fb, 2.2, col.handle, pivot, 'handle');
      }
      doors.push({ pivot: pivot, deg: side * CFG.doorOpenDeg });
    });

    // Llibres: booksPerRow (de dalt a baix) reparteix els llibres pels forats
    var rows = ys.length - 1;
    var idx = 0;
    for (var r = 0; r < rows; r++) {
      var j = rows - 1 - r;
      var base = (j === 0) ? ys[0] : ys[j] + st / 2;
      var top = (j === rows - 1) ? ys[rows] : ys[j + 1] - st / 2;
      var n = c.booksPerRow[r] || 0;
      var slotW = (W - 2 * T) / Math.max(n, 1);
      var bh = Math.min(c.bookMaxHeightCm, top - base - 3);
      var bd = 3.2;
      for (var k = 0; k < n && idx < BOOKS.length; k++, idx++) {
        var bw = Math.min(c.bookMaxWidthCm, bh * 0.72, slotW * 0.8);
        var x = T + slotW * (k + 0.5);
        var y = base + bh / 2 + 1;
        var z = -(FD + c.bookInsetCm + bd / 2);
        addBook(group, BOOKS[idx], idx, x, y, z, bw, bh, bd, Math.min(c.bookMaxWidthCm, slotW * 0.8));
      }
    }
  }

  function startIdleFloat(rec) {
    var y = rec.yBottom + rec.h / 2;
    rec.g.setAttribute('position', rec.x + ' ' + y + ' ' + rec.z);
    rec.g.setAttribute('animation__float',
      'property: position; from: ' + rec.x + ' ' + y + ' ' + rec.z +
      '; to: ' + rec.x + ' ' + (y + 1.1) + ' ' + (rec.z + 0.6) +
      '; dir: alternate; loop: true; easing: easeInOutSine; dur: ' + (1800 + (rec.i * 173) % 700));
    rec.g.setAttribute('animation__tilt',
      'property: rotation; from: 0 -3 0; to: 0 3 0; dir: alternate; loop: true; easing: easeInOutSine; dur: ' +
      (2400 + (rec.i * 211) % 800));
  }

  function addBook(group, b, i, x, y, z, bw, bh, bd, maxW) {
    var g = el('a-entity', { position: x + ' ' + y + ' ' + z }, group);

    var parts = buildBookMesh(g, b, bw, bh, bd, true, null);

    var label = el('a-text', {
      value: b.curt || b.titol, align: 'center',
      color: isLightHex(b.color) ? '#231912' : '#ffffff',
      width: bw * 0.88, 'wrap-count': 10,
      position: '0 0 ' + (bd / 2 + 0.12)
    }, g);

    var badge = el('a-sphere', {
      radius: 1.65, color: ESTATS.lliure.color,
      position: (bw / 2 - 1.5) + ' ' + (bh / 2 - 1.5) + ' ' + (bd / 2 + 0.65)
    }, g);

    var rec = {
      g: g, parts: parts, cover: parts.front, label: label, badge: badge,
      coverImg: null,
      w: bw, h: bh, d: bd, maxH: bh, maxW: maxW,
      x: x, z: z, yBottom: y - bh / 2, i: i
    };
    bookEls[b.id] = rec;
    startIdleFloat(rec);

    parts.front.addEventListener('click', function () { openPanel(b.id); });

    if (b.portada) loadCover(b, rec);
  }

  // Si existeix la imatge de la portada, el llibre agafa EXACTAMENT la seva proporció
  // i l'aplica directament sobre la cara frontal de la tapa (sense plans superposats).
  function loadCover(b, rec) {
    var img = new Image();
    img.onload = function () {
      if (!img.naturalWidth || !img.naturalHeight) return;
      var r = img.naturalWidth / img.naturalHeight;
      var h = rec.maxH, w = h * r;
      if (w > rec.maxW) { w = rec.maxW; h = w / r; }
      rec.w = w; rec.h = h;
      rec.coverImg = img;

      // Reconstruir geometria amb la proporció exacta i la textura integrada
      while (rec.g.firstChild) rec.g.removeChild(rec.g.firstChild);
      var parts = buildBookMesh(rec.g, b, w, h, rec.d, true, img);
      rec.parts = parts;
      rec.cover = parts.front;
      parts.front.addEventListener('click', function () { openPanel(b.id); });

      rec.badge = el('a-sphere', {
        radius: 1.65, color: ESTATS.lliure.color,
        position: (w / 2 - 1.5) + ' ' + (h / 2 - 1.5) + ' ' + (rec.d / 2 + 0.65)
      }, rec.g);

      startIdleFloat(rec);
      paint(b.id);
    };
    img.src = b.portada;
  }

  // ------------------------------------------------------------------
  //  VISOR 3D: el llibre surt de l'armari, gira i torna suaument al tancar
  // ------------------------------------------------------------------
  var viewerEl = null;
  var shownId = null;
  var closingBook = false;

  function clearViewerImmediate() {
    if (viewerEl && viewerEl.parentNode) viewerEl.parentNode.removeChild(viewerEl);
    viewerEl = null;
    if (shownId && bookEls[shownId]) bookEls[shownId].g.setAttribute('visible', true);
    shownId = null;
    closingBook = false;
  }

  function getShelfLocalPosInCamera(rec, camEl) {
    var THREE = AFRAME.THREE;
    var p = new THREE.Vector3();
    rec.g.object3D.updateWorldMatrix(true, false);
    rec.g.object3D.getWorldPosition(p);
    camEl.object3D.updateWorldMatrix(true, false);
    camEl.object3D.worldToLocal(p);
    return p;
  }

  function flyBackViewer() {
    if (!viewerEl || !shownId || closingBook) return;
    var id = shownId;
    var rec = bookEls[id];
    var camEl = document.querySelector('a-camera');
    if (!rec || !camEl) { clearViewerImmediate(); return; }

    closingBook = true;
    var v = viewerEl;
    v.removeAttribute('animation__bob');
    v.removeAttribute('animation__bobrot');
    v.removeAttribute('animation__fly');
    v.removeAttribute('animation__grow');
    v.removeAttribute('animation__spin');

    var targetPos = getShelfLocalPosInCamera(rec, camEl);
    var VH = 0.62;
    var s0 = (rec.h * U) / VH;
    var dur = 620;

    v.setAttribute('animation__backpos',
      'property: position; to: ' + targetPos.x + ' ' + targetPos.y + ' ' + targetPos.z +
      '; dur: ' + dur + '; easing: easeInOutCubic');
    v.setAttribute('animation__backscale',
      'property: scale; to: ' + s0 + ' ' + s0 + ' ' + s0 +
      '; dur: ' + dur + '; easing: easeInOutCubic');
    v.setAttribute('animation__backrot',
      'property: rotation; to: 0 360 0; dur: ' + dur + '; easing: easeInOutCubic');

    v.addEventListener('animationcomplete__backpos', function () {
      if (viewerEl === v) clearViewerImmediate();
    }, { once: true });
  }

  function showViewer(id) {
    clearViewerImmediate();
    var rec = bookEls[id];
    var b = BOOKS.filter(function (x) { return x.id === id; })[0];
    var camEl = document.querySelector('a-camera');
    if (!rec || !camEl) return;

    var p = getShelfLocalPosInCamera(rec, camEl);

    var VH = 0.62, VW = VH * (rec.w / rec.h), D = VH * 0.085;
    var s0 = (rec.h * U) / VH;                      // comença amb la mida exacta del llibre a l'armari
    var v = el('a-entity', {
      position: p.x + ' ' + p.y + ' ' + p.z,
      scale: s0 + ' ' + s0 + ' ' + s0
    }, camEl);

    buildBookMesh(v, b, VW, VH, D, false, rec.coverImg);

    if (!rec.coverImg) {
      el('a-text', {
        value: b.curt || b.titol, align: 'center',
        color: isLightHex(b.color) ? '#231912' : '#ffffff',
        width: VW * 0.88, 'wrap-count': 10, position: '0 0 ' + (D / 2 + 0.005)
      }, v);
    }

    var dur = 850;
    v.setAttribute('animation__fly',
      'property: position; to: 0 0.25 -1.28; dur: ' + dur + '; easing: easeOutCubic');
    v.setAttribute('animation__grow',
      'property: scale; to: 1 1 1; dur: ' + dur + '; easing: easeOutBack');
    v.setAttribute('animation__spin',
      'property: rotation; from: 6 -340 -4; to: 2 -6 0; dur: ' + dur + '; easing: easeOutCubic');

    v.addEventListener('animationcomplete__fly', function () {
      if (closingBook || viewerEl !== v) return;
      v.setAttribute('animation__bob',
        'property: position; from: 0 0.25 -1.28; to: 0 0.285 -1.28; dir: alternate; loop: true; dur: 2100; easing: easeInOutSine');
      v.setAttribute('animation__bobrot',
        'property: rotation; from: 2 -8 -1.5; to: -1 8 1.5; dir: alternate; loop: true; dur: 3200; easing: easeInOutSine');
    }, { once: true });

    rec.g.setAttribute('visible', false);           // el llibre surt del prestatge
    viewerEl = v;
    shownId = id;
  }

  function openDoors() {
    if (doorsOpen) return;
    doorsOpen = true;
    doors.forEach(function (d) {
      d.pivot.setAttribute('animation__open',
        'property: rotation; to: 0 ' + d.deg + ' 0; dur: 1650; delay: 300; easing: easeInOutCubic');
    });
  }

  function closeDoors() {
    doorsOpen = false;
    doors.forEach(function (d) {
      d.pivot.removeAttribute('animation__open');
      d.pivot.setAttribute('rotation', '0 0 0');
    });
  }

  // ------------------------------------------------------------------
  //  ESTATS DELS LLIBRES
  // ------------------------------------------------------------------
  function paint(id) {
    var e = bookEls[id];
    if (!e) return;
    var s = ESTATS[estats[id]] || ESTATS.lliure;
    e.badge.setAttribute('color', s.color);
    var taken = estats[id] === 'escollit';
    var op = taken ? 0.45 : 1;
    if (e.parts && e.parts.mats) {
      [e.parts.mats.baseMat, e.parts.mats.frontMat, e.parts.mats.pagesMat].forEach(function (mat) {
        if (!mat) return;
        mat.transparent = taken;
        mat.opacity = op;
        mat.needsUpdate = true;
      });
    }
  }

  function updateSplashStats() {
    var freeCount = 0;
    BOOKS.forEach(function (b) {
      if ((estats[b.id] || 'lliure') === 'lliure') freeCount++;
    });
    var elCount = $('splash-count');
    if (elCount) {
      elCount.textContent = freeCount + ' de ' + BOOKS.length + ' llibres disponibles ara mateix';
    }
  }

  function applyStates(map) {
    BOOKS.forEach(function (b) {
      var s = map && map[b.id];
      estats[b.id] = ESTATS[s] ? s : 'lliure';
      paint(b.id);
    });
    updateSplashStats();
    renderPanel();
  }

  // ------------------------------------------------------------------
  //  FITXA
  // ------------------------------------------------------------------
  function openPanel(id) {
    if (currentId === id && !$('panel').classList.contains('panel-closed')) return;
    currentId = id;
    $('p-msg').textContent = '';
    renderPanel();
    $('panel').classList.add('panel-closed');
    $('panel').setAttribute('aria-hidden', 'true');
    showViewer(id);                                  // animació: el llibre vola cap a la càmera
    clearTimeout(openPanel._t);
    openPanel._t = setTimeout(function () {
      if (currentId === id) {
        $('panel').classList.remove('panel-closed');
        $('panel').setAttribute('aria-hidden', 'false');
      }
    }, 560);
  }

  function closePanel() {
    clearTimeout(openPanel._t);
    $('panel').classList.add('panel-closed');
    $('panel').setAttribute('aria-hidden', 'true');
    currentId = null;
    flyBackViewer();                                 // animació: el llibre torna al seu prestatge
  }

  function renderPanel() {
    if (!currentId) return;
    var b = BOOKS.filter(function (x) { return x.id === currentId; })[0];
    var est = estats[currentId];
    var s = ESTATS[est];
    $('p-title').textContent = b.titol;
    $('p-author').textContent = [b.autor, b.editorial].filter(Boolean).join(' · ');
    $('p-summary').textContent = b.resum;
    var chip = $('p-status');
    chip.textContent = s.text;
    chip.style.background = s.color;
    $('p-pick').classList.toggle('hidden', est !== 'lliure');
    $('p-pick').disabled = false;
    if (est === 'pendent') {
      $('p-msg').textContent = "Algú ja l'ha escollit. L'administrador ha de confirmar-ho.";
    } else if (est === 'escollit') {
      $('p-msg').textContent = 'Aquest llibre ja no està disponible.';
    } else {
      $('p-msg').textContent = '';
    }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 3500);
  }

  function pickCurrent() {
    var id = currentId;
    $('p-pick').disabled = true;
    window.Data.pick(id).then(function () {
      toast('Fet! El llibre queda pendent de confirmació.');
    }).catch(function (err) {
      if (err && err.message === 'no-lliure') {
        toast("Ho sento, algú l'ha escollit just abans.");
      } else {
        console.error(err);
        toast("No s'ha pogut guardar. Torna-ho a provar.");
      }
      renderPanel();
    });
  }

  // ------------------------------------------------------------------
  //  ARRENCADA
  // ------------------------------------------------------------------
  function showError(msg) {
    clearTimeout(hideSplashSmooth._t);
    var m = $('splash-msg');
    if (m) {
      m.textContent = msg;
      m.classList.remove('hidden');
    }
    var sp = $('splash');
    if (sp) {
      sp.classList.remove('hidden');
      sp.classList.remove('splash-exit');
    }
    if ($('hint')) $('hint').classList.add('hidden');
  }

  function hideSplashSmooth() {
    var sp = $('splash');
    if (!sp) return;
    clearTimeout(hideSplashSmooth._t);
    sp.classList.add('splash-exit');
    hideSplashSmooth._t = setTimeout(function () { sp.classList.add('hidden'); }, 450);
  }

  async function startAR() {
    if ($('splash-msg')) $('splash-msg').classList.add('hidden');

    if (DEMO) {
      hideSplashSmooth();
      openDoors();
      return;
    }

    if (!window.AFRAME || !sceneEl) {
      showError("No s'ha carregat el motor 3D (A-Frame). Comprova la connexió a internet o prova la vista 3D sense càmera.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("El navegador bloqueja la càmera en aquesta adreça (cal HTTPS o localhost). Fes servir l'enllaç de sota per provar la vista 3D.");
      return;
    }

    hideSplashSmooth();
    $('hint').classList.remove('hidden');

    try {
      if (!sceneEl.hasLoaded) {
        await Promise.race([
          new Promise(function (r) { sceneEl.addEventListener('loaded', r, { once: true }); }),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('scene-timeout')); }, 7000); })
        ]);
      }
      var mindar = sceneEl.systems && sceneEl.systems['mindar-image-system'];
      if (!mindar) {
        throw new Error('mindar-missing');
      }
      await mindar.start();
    } catch (e) {
      console.error('Error iniciant RA:', e);
      var msg = "No s'ha pogut obrir la càmera. Revisa els permisos o prova la vista 3D sense càmera.";
      if (e && (e.message === 'mindar-missing' || String(e).indexOf('targets') !== -1 || String(e).indexOf('fetch') !== -1)) {
        msg = "Falta el fitxer targets.mind a la carpeta del projecte (o s'ha obert sense servidor web). Prova la vista 3D sense càmera de sota.";
      } else if (e && e.name === 'NotAllowedError') {
        msg = "Has denegat el permís de la càmera al navegador. Activa'l i torna-ho a provar.";
      } else if (e && e.name === 'NotFoundError') {
        msg = "No s'ha trobat cap càmera en aquest dispositiu. Fes servir 'O prova la vista 3D sense càmera'.";
      }
      showError(msg);
    }
  }

  function init() {
    // 1. Connectem els botons primer perquè mai quedin bloquejats
    if ($('start')) $('start').addEventListener('click', startAR);
    if ($('close')) $('close').addEventListener('click', closePanel);
    if ($('p-pick')) $('p-pick').addEventListener('click', pickCurrent);

    if (DEMO && $('demo-btn')) {
      $('demo-btn').textContent = 'Estàs en mode vista 3D (sense càmera)';
      $('demo-btn').removeAttribute('href');
    }

    if (DEMO) {
      if (window.AFRAME && !AFRAME.components['demo-vertical-move']) {
        var keysPressed = {};
        function isQE(ev) {
          var c = ev.code || '';
          var k = (ev.key || '').toLowerCase();
          if (c === 'KeyQ' || k === 'q') return 'q';
          if (c === 'KeyE' || k === 'e') return 'e';
          return '';
        }
        document.addEventListener('keydown', function (ev) {
          if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
          var key = isQE(ev);
          if (key) {
            keysPressed[key] = true;
            ev.preventDefault();
          }
        }, true);
        document.addEventListener('keyup', function (ev) {
          var key = isQE(ev);
          if (key) keysPressed[key] = false;
        }, true);
        window.addEventListener('blur', function () { keysPressed = {}; });

        AFRAME.registerComponent('demo-vertical-move', {
          tick: function (time, timeDelta) {
            var dir = (keysPressed.e ? 1 : 0) - (keysPressed.q ? 1 : 0);
            if (!dir) return;
            var dt = Math.min((timeDelta || 16) / 1000, 0.1);
            this.el.object3D.position.y += dir * 6.5 * dt;
          }
        });
      }
    }

    updateSplashStats();

    // 2. Construïm l'escena 3D i l'armari amb captura d'errors
    try {
      buildScene();
      buildCabinet();

      if (!DEMO && rootEl) {
        rootEl.addEventListener('targetFound', function () {
          $('hint').classList.add('hidden');
          openDoors();
        });
        rootEl.addEventListener('targetLost', function () {
          $('hint').classList.remove('hidden');
          closeDoors();
        });
      }
    } catch (err) {
      console.error('Error muntant escena 3D:', err);
      showError("Error carregant l'escena 3D: " + (err && err.message ? err.message : err));
    }

    // 3. Connectem la base de dades
    if (window.Data && window.Data.mode === 'local') {
      var tag = $('mode-tag');
      if (tag) {
        tag.textContent = 'Mode prova (sense base de dades)';
        tag.classList.remove('hidden');
      }
    }
    if (window.Data) {
      window.Data.start(applyStates, function () {
        toast("No es pot connectar amb la base de dades.");
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
