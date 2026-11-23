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
  var sceneEl, rootEl, holderEl;

  // Estat d'ancoratge en RA:
  // 'scanning' -> buscant cartell
  // 'settling' -> detectat, estabilitzant 1 segon sense tremolor
  // 'locked'   -> fixat en 3D (no es mou ni desapareix en apropar-se)
  var anchorState = DEMO ? 'locked' : 'scanning';
  var targetCurrentlyVisible = false;
  var goodFrameStreakMs = 0;
  var everWasReady = false;
  var frameGuideMesh = null;
  var frameGuideMat = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ------------------------------------------------------------------
  //  UI D'ESTAT D'ESCANEIG / FIXACIÓ
  // ------------------------------------------------------------------
  function ensureHintUI() {
    var hint = $('hint');
    if (!hint) return;
    if (!$('hint-dot')) {
      var dot = hint.querySelector('.scan-pulse');
      if (dot) dot.id = 'hint-dot';
    }
    if (!$('hint-text')) {
      var spans = hint.querySelectorAll('span');
      if (spans.length > 1) spans[1].id = 'hint-text';
    }
    if (!$('lock-now-btn')) {
      var lockBtn = document.createElement('button');
      lockBtn.id = 'lock-now-btn';
      lockBtn.type = 'button';
      lockBtn.className = 'hint-btn hint-btn-ok hidden';
      lockBtn.textContent = 'Fixar ara';
      hint.appendChild(lockBtn);
    }
    if (!$('rescan-btn')) {
      var btn = document.createElement('button');
      btn.id = 'rescan-btn';
      btn.type = 'button';
      btn.className = 'hint-btn hidden';
      btn.textContent = 'Re-escanejar';
      hint.appendChild(btn);
    }
  }

  function updateGuideVisual(visible, isReady) {
    if (!frameGuideMesh || !frameGuideMat) return;
    frameGuideMesh.visible = !!visible && !DEMO;
    if (visible) {
      frameGuideMat.color.setHex(isReady ? 0x2ecc71 : 0xf39c12);
    }
  }

  function setAnchorState(next) {
    anchorState = next;
    ensureHintUI();
    var dot = $('hint-dot');
    var txt = $('hint-text');
    var lockBtn = $('lock-now-btn');
    var rescanBtn = $('rescan-btn');

    if (DEMO) return;

    if (next === 'scanning') {
      goodFrameStreakMs = 0;
      everWasReady = false;
      closePanel();
      closeDoors();
      if (holderEl && holderEl.object3D) holderEl.object3D.visible = false;
      updateGuideVisual(false, false);
      if (dot) { dot.classList.remove('locked'); dot.classList.remove('warn'); }
      if (txt) txt.textContent = "Apunta la càmera al cartell de l'armari";
      if (lockBtn) lockBtn.classList.add('hidden');
      if (rescanBtn) rescanBtn.classList.add('hidden');
    } else if (next === 'settling') {
      goodFrameStreakMs = 0;
      everWasReady = false;
      if (dot) { dot.classList.remove('locked'); dot.classList.add('warn'); }
      if (txt) txt.textContent = "Enquadra l'armari sencer...";
      if (lockBtn) lockBtn.classList.remove('hidden');
      if (rescanBtn) rescanBtn.classList.remove('hidden');
    } else if (next === 'locked') {
      if (holderEl && holderEl.object3D) holderEl.object3D.visible = true;
      updateGuideVisual(false, true);
      if (dot) { dot.classList.remove('warn'); dot.classList.add('locked'); }
      if (txt) txt.textContent = "Armari fixat · Toca un llibre";
      if (lockBtn) lockBtn.classList.add('hidden');
      if (rescanBtn) rescanBtn.classList.remove('hidden');
      openDoors();
    }
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

    for (var i = 0; i < (opts.clouds || 22); i++) {
      var cx = rnd() * S, cy = rnd() * S;
      var rad = (0.15 + rnd() * 0.3) * S;
      var g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
      g.addColorStop(0, rnd() > 0.45 ? opts.lightTint : opts.darkTint);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }

    for (var p = 0; p < 1400; p++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(20,16,12,0.065)';
      ctx.fillRect(rnd() * S, rnd() * S, 1.4, 1.4);
    }

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

    for (var r = 0; r < (opts.rust || 0); r++) {
      ctx.fillStyle = 'rgba(112, 74, 42, 0.24)';
      ctx.beginPath();
      ctx.arc(rnd() * S, rnd() * S, 1 + rnd() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

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

    var coverBumpCv = document.createElement('canvas');
    coverBumpCv.width = 256;
    coverBumpCv.height = 256;
    var bctx = coverBumpCv.getContext('2d');
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 256, 256);

    for (var y = 0; y < 256; y += 2) {
      for (var x = 0; x < 256; x += 2) {
        var v = 120 + Math.floor(rnd() * 18) + (((x + y) % 4 === 0) ? 5 : -4);
        bctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        bctx.fillRect(x, y, 2, 2);
      }
    }
    var crease = bctx.createLinearGradient(14, 0, 28, 0);
    crease.addColorStop(0, 'rgba(70,70,70,0)');
    crease.addColorStop(0.5, 'rgba(45,45,45,0.65)');
    crease.addColorStop(1, 'rgba(70,70,70,0)');
    bctx.fillStyle = crease;
    bctx.fillRect(14, 0, 14, 256);

    var coverBump = new THREE.CanvasTexture(coverBumpCv);
    coverBump.wrapS = coverBump.wrapT = THREE.RepeatWrapping;

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

    var pagesAttrs = {
      width: pageW,
      height: pageH,
      depth: pageD,
      position: (pageInset * 0.35) + ' 0 0',
      color: '#f4efe4'
    };
    if (pagesKey) pagesAttrs['book-part'] = pagesKey;

    var frontAttrs = {
      width: w,
      height: h,
      depth: coverThick,
      position: '0 0 ' + (d / 2 - coverThick / 2),
      color: b.color
    };
    if (frontKey) frontAttrs['book-part'] = frontKey;

    var backAttrs = {
      width: w,
      height: h,
      depth: coverThick,
      position: '0 0 ' + (-d / 2 + coverThick / 2),
      color: b.color
    };
    if (baseKey) backAttrs['book-part'] = baseKey;

    var spineAttrs = {
      width: coverThick * 1.15,
      height: h,
      depth: Math.max(pageD, d - coverThick * 0.4),
      position: (-w / 2 + coverThick * 0.5) + ' 0 0',
      color: b.color
    };
    if (baseKey) spineAttrs['book-part'] = baseKey;

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

    var pages = el('a-box', pagesAttrs, parent);
    var front = el('a-box', frontAttrs, parent);
    var back = el('a-box', backAttrs, parent);
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
  //  COMPONENT D'ANCORATGE AMB VALIDACIÓ D'ANGLE I ENQUADRAMENT SENCER (RA)
  // ------------------------------------------------------------------
  function registerSmoothAnchorComponent() {
    if (!window.AFRAME || AFRAME.components['smooth-anchor']) return;
    var THREE = AFRAME.THREE;
    var targetPos = new THREE.Vector3();
    var targetQuat = new THREE.Quaternion();
    var targetScale = new THREE.Vector3();
    var clampedQuat = new THREE.Quaternion();
    var euler = new THREE.Euler(0, 0, 0, 'YXZ');
    var normalVec = new THREE.Vector3();
    var toCamVec = new THREE.Vector3();
    var cornerVec = new THREE.Vector3();

    var c = CFG.cabinet;
    var x0 = -CFG.sheet.fromLeftCm * U;
    var x1 = (c.widthCm - CFG.sheet.fromLeftCm) * U;
    var y0 = -CFG.sheet.fromBottomCm * U;
    var y1 = (c.heightCm - CFG.sheet.fromBottomCm) * U;
    var z0 = 0;
    var z1 = -c.depthCm * U;
    var CAB_CORNERS = [
      new THREE.Vector3(x0, y0, z0),
      new THREE.Vector3(x1, y0, z0),
      new THREE.Vector3(x0, y1, z0),
      new THREE.Vector3(x1, y1, z0),
      new THREE.Vector3(x0, y0, z1),
      new THREE.Vector3(x1, y0, z1),
      new THREE.Vector3(x0, y1, z1),
      new THREE.Vector3(x1, y1, z1)
    ];

    function sanitizePose(rawQuat, outQuat) {
      // Nivella l'armari en vertical perquè mai surti tort o inclinat en angles estranys
      euler.setFromQuaternion(rawQuat, 'YXZ');
      var maxPitch = THREE.MathUtils.degToRad(12);
      var maxRoll = THREE.MathUtils.degToRad(3);
      var maxYaw = THREE.MathUtils.degToRad(42);
      euler.x = Math.max(-maxPitch, Math.min(maxPitch, euler.x));
      euler.y = Math.max(-maxYaw, Math.min(maxYaw, euler.y));
      euler.z = Math.max(-maxRoll, Math.min(maxRoll, euler.z));
      outQuat.setFromEuler(euler);
    }

    function isValidTargetPose(pos, scale) {
      return pos.lengthSq() > 1e-6 && scale.x > 1e-5;
    }

    function evaluateFraming(holderObj, rawQuat) {
      var camEl = document.querySelector('a-camera');
      var camObj = camEl && camEl.getObject3D('camera');
      if (!camObj) return { ok: true, msg: "Estabilitzant armari..." };

      normalVec.set(0, 0, 1).applyQuaternion(rawQuat).normalize();
      toCamVec.copy(holderObj.position).multiplyScalar(-1).normalize();
      var dotAngle = Math.max(-1, Math.min(1, normalVec.dot(toCamVec)));
      var angleDeg = THREE.MathUtils.radToDeg(Math.acos(dotAngle));
      if (angleDeg > 40) {
        return { ok: false, msg: "Posa't més de front al cartell" };
      }

      holderObj.updateMatrixWorld(true);
      camObj.updateMatrixWorld(true);
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      var behind = false;
      for (var i = 0; i < CAB_CORNERS.length; i++) {
        cornerVec.copy(CAB_CORNERS[i]).applyMatrix4(holderObj.matrixWorld);
        cornerVec.project(camObj);
        if (cornerVec.z >= 1) behind = true;
        if (cornerVec.x < minX) minX = cornerVec.x;
        if (cornerVec.x > maxX) maxX = cornerVec.x;
        if (cornerVec.y < minY) minY = cornerVec.y;
        if (cornerVec.y > maxY) maxY = cornerVec.y;
      }

      var margin = 1.06;
      if (behind || (maxY - minY) > margin * 2 || (maxX - minX) > margin * 2) {
        return { ok: false, msg: "Fes un pas enrere perquè surti l'armari sencer" };
      }
      if (minY < -margin && maxY <= margin) {
        return { ok: false, msg: "Apunta una mica més avall (es talla la base)" };
      }
      if (maxY > margin && minY >= -margin) {
        return { ok: false, msg: "Apunta una mica més amunt (es talla dalt)" };
      }
      if (minX < -margin && maxX <= margin) {
        return { ok: false, msg: "Mou el mòbil una mica a l'esquerra" };
      }
      if (maxX > margin && minX >= -margin) {
        return { ok: false, msg: "Mou el mòbil una mica a la dreta" };
      }
      if (minX < -margin || maxX > margin || minY < -margin || maxY > margin) {
        return { ok: false, msg: "Fes un pas enrere per enquadrar tot l'armari" };
      }

      return { ok: true, msg: "Armari sencer detectat · Fixant..." };
    }

    AFRAME.registerComponent('smooth-anchor', {
      init: function () {
        this.hasSnapped = false;
        this.lastHintMsg = '';
        if (!DEMO) {
          this.el.object3D.visible = false;
        }
      },
      snapToTarget: function () {
        if (!rootEl || !rootEl.object3D) return false;
        rootEl.object3D.updateWorldMatrix(true, false);
        rootEl.object3D.getWorldPosition(targetPos);
        rootEl.object3D.getWorldQuaternion(targetQuat);
        rootEl.object3D.getWorldScale(targetScale);

        if (!isValidTargetPose(targetPos, targetScale)) return false;

        sanitizePose(targetQuat, clampedQuat);
        this.el.object3D.position.copy(targetPos);
        this.el.object3D.quaternion.copy(clampedQuat);
        this.el.object3D.scale.copy(targetScale);
        this.el.object3D.visible = true;
        this.hasSnapped = true;
        return true;
      },
      tick: function (time, timeDelta) {
        if (DEMO) return;
        if (anchorState === 'scanning') {
          this.hasSnapped = false;
          this.el.object3D.visible = false;
          updateGuideVisual(false, false);
          return;
        }
        if (anchorState === 'locked') {
          return;
        }

        var txt = $('hint-text');
        var dot = $('hint-dot');
        if (!targetCurrentlyVisible || !rootEl || !rootEl.object3D) {
          updateGuideVisual(this.hasSnapped, everWasReady);
          if (txt && this.lastHintMsg !== "Torna a apuntar al cartell...") {
            this.lastHintMsg = "Torna a apuntar al cartell...";
            txt.textContent = this.lastHintMsg;
          }
          if (dot) { dot.classList.remove('locked'); dot.classList.add('warn'); }
          return;
        }

        rootEl.object3D.updateWorldMatrix(true, false);
        rootEl.object3D.getWorldPosition(targetPos);
        rootEl.object3D.getWorldQuaternion(targetQuat);
        rootEl.object3D.getWorldScale(targetScale);

        if (!isValidTargetPose(targetPos, targetScale)) return;

        sanitizePose(targetQuat, clampedQuat);

        if (!this.hasSnapped) {
          this.snapToTarget();
        } else {
          var dt = Math.min((timeDelta || 16) / 1000, 0.1);
          var alpha = 1 - Math.exp(-10 * dt);
          this.el.object3D.position.lerp(targetPos, alpha);
          this.el.object3D.quaternion.slerp(clampedQuat, alpha);
          this.el.object3D.scale.lerp(targetScale, alpha);
          this.el.object3D.visible = true;
        }

        var check = evaluateFraming(this.el.object3D, targetQuat);
        updateGuideVisual(true, check.ok);

        if (txt && this.lastHintMsg !== check.msg) {
          this.lastHintMsg = check.msg;
          txt.textContent = check.msg;
        }
        if (dot) {
          dot.classList.remove('locked');
          dot.classList.add('warn');
        }

        if (check.ok) {
          everWasReady = true;
          goodFrameStreakMs += Math.min(timeDelta || 16, 100);
          if (goodFrameStreakMs >= 650) {
            setAnchorState('locked');
          }
        } else {
          goodFrameStreakMs = Math.max(0, goodFrameStreakMs - (timeDelta || 16));
        }
      }
    });
  }

  // ------------------------------------------------------------------
  //  ESCENA
  // ------------------------------------------------------------------
  function buildScene() {
    registerSmoothAnchorComponent();

    // IMPORTANT: No sobreescrivim filterMinCF/filterBeta amb valors minúsculs perquè
    // congelarien la posició inicial a (0,0,0) i l'armari no apareixeria.
    var arAttr = DEMO ? '' :
      'mindar-image="imageTargetSrc: ' + CFG.targetFile +
      '; autoStart: false; uiLoading: no; uiScanning: no; uiError: no; warmupTolerance: 4; missTolerance: 15;"';
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
        '<a-entity id="cabinet-holder" smooth-anchor></a-entity>' +
      '</a-scene>');

    sceneEl = $('scene');
    rootEl = $('root');
    holderEl = $('cabinet-holder');

    if (DEMO) document.body.classList.add('demo-mode');

    sceneEl.addEventListener('loaded', function () {
      if (!DEMO && sceneEl.renderer) {
        sceneEl.renderer.setClearColor(0x000000, 0);
      }
      var canvas = sceneEl.canvas;
      if (!canvas || !window.AFRAME) return;

      var tapStart = null;
      var lastTouchEndMs = 0;
      var dragLast = null;
      var pinchStartDist = null;
      var pinchStartScale = null;

      function handleTapAt(clientX, clientY) {
        if (!doorsOpen || currentId || !$('panel').classList.contains('panel-closed')) return;
        if (holderEl && holderEl.object3D && !holderEl.object3D.visible) return;
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
        if (!ev.touches) return;
        if (ev.touches.length === 1) {
          tapStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
          dragLast = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
          pinchStartDist = null;
        } else if (ev.touches.length === 2 && !DEMO && anchorState === 'locked' && holderEl && holderEl.object3D) {
          tapStart = null;
          dragLast = null;
          var dx = ev.touches[0].clientX - ev.touches[1].clientX;
          var dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinchStartDist = Math.hypot(dx, dy);
          pinchStartScale = holderEl.object3D.scale.x;
        }
      }, { passive: true });

      canvas.addEventListener('touchmove', function (ev) {
        if (DEMO || anchorState !== 'locked' || !holderEl || !holderEl.object3D || !holderEl.object3D.visible) return;
        if (!$('panel').classList.contains('panel-closed')) return;

        if (ev.touches.length === 2 && pinchStartDist && pinchStartScale) {
          var dx = ev.touches[0].clientX - ev.touches[1].clientX;
          var dy = ev.touches[0].clientY - ev.touches[1].clientY;
          var dist = Math.hypot(dx, dy);
          if (dist > 10) {
            var factor = Math.min(Math.max(dist / pinchStartDist, 0.55), 2.4);
            var nextS = pinchStartScale * factor;
            holderEl.object3D.scale.set(nextS, nextS, nextS);
          }
        } else if (ev.touches.length === 1 && dragLast) {
          var tx = ev.touches[0].clientX;
          var ty = ev.touches[0].clientY;
          var moveX = tx - dragLast.x;
          var moveY = ty - dragLast.y;
          dragLast = { x: tx, y: ty };
          if (tapStart && Math.hypot(tx - tapStart.x, ty - tapStart.y) < 12) return;

          var depth = Math.max(Math.abs(holderEl.object3D.position.z), 0.5);
          var rect = canvas.getBoundingClientRect();
          var span = depth * 0.95;
          holderEl.object3D.position.x += (moveX / Math.max(rect.height, 1)) * span;
          holderEl.object3D.position.y -= (moveY / Math.max(rect.height, 1)) * span;
        }
      }, { passive: true });

      canvas.addEventListener('touchend', function (ev) {
        pinchStartDist = null;
        dragLast = null;
        if (!tapStart || !ev.changedTouches || !ev.changedTouches.length) return;
        var touch = ev.changedTouches[0];
        var dx = touch.clientX - tapStart.x;
        var dy = touch.clientY - tapStart.y;
        var dt = Date.now() - tapStart.t;
        tapStart = null;
        if (Math.hypot(dx, dy) < 18 && dt < 500) {
          lastTouchEndMs = Date.now();
          handleTapAt(touch.clientX, touch.clientY);
        }
      }, { passive: true });

      canvas.addEventListener('click', function (ev) {
        if (Date.now() - lastTouchEndMs < 650) return;
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
    var FD = 3;

    var group = el('a-entity', {
      id: 'cabinet',
      position: (-CFG.sheet.fromLeftCm * U) + ' ' + (-CFG.sheet.fromBottomCm * U) + ' 0',
      scale: U + ' ' + U + ' ' + U
    }, holderEl);

    box(T, H, D, T / 2, H / 2, -D / 2, col.body, group, 'body');
    box(T, H, D, W - T / 2, H / 2, -D / 2, col.body, group, 'body');
    box(W, T, D, W / 2, H - T / 2, -D / 2, col.body, group, 'body');
    box(W, T, D, W / 2, T / 2, -D / 2, col.body, group, 'body');
    box(W, H, T, W / 2, H / 2, -D + T / 2, col.inside, group, 'inside');

    box(W + 1.2, ft, FD + 0.8, W / 2, H - ft / 2, -FD / 2 + 0.4, col.body, group, 'body');
    box(W, fb, FD, W / 2, fb / 2, -FD / 2, col.body, group, 'body');
    box(fs, H, FD, fs / 2, H / 2, -FD / 2, col.body, group, 'body');
    box(fs, H, FD, W - fs / 2, H / 2, -FD / 2, col.body, group, 'body');

    [T + 0.6, W - T - 0.6].forEach(function (gx) {
      [-(FD + 4), -(D - T - 4)].forEach(function (gz) {
        box(1.2, H - ft - fb, 0.8, gx, H / 2, gz, col.inside, group, 'inside');
      });
    });

    var depthIn = D - T - FD;
    var zc = -(FD + depthIn / 2);
    var ys = [fb].concat(c.shelvesFromBottomCm).concat([H - ft]);
    box(W - 2 * T, st, depthIn, W / 2, fb - st / 2, zc, col.shelf, group, 'shelf');
    for (var s = 1; s < ys.length - 1; s++) {
      box(W - 2 * T, st, depthIn, W / 2, ys[s], zc, col.shelf, group, 'shelf');
    }

    var dw = (W - 2 * fs - 0.6) / 2, dh = H - ft - fb - 0.6;
    var handleY = 81 - fb;
    [-1, 1].forEach(function (side) {
      var hingeX = side === 1 ? W - fs : fs;
      var pivot = el('a-entity', { position: hingeX + ' ' + (fb + 0.3) + ' -1.2' }, group);

      box(dw, dh, 1.8, -side * (dw / 2 + 0.15), dh / 2, 0, col.door, pivot, 'door');

      [-dw * 0.32, -dw * 0.68].forEach(function (ribOffset) {
        box(2.2, dh - 8, 0.5, side * ribOffset, dh / 2, -1.05, col.door, pivot, 'door');
      });

      [14, dh - 14].forEach(function (hy) {
        el('a-cylinder', {
          radius: 0.7, height: 6.5,
          position: hingeX + ' ' + (fb + hy) + ' 0.3',
          color: col.handle,
          material: getCabTextures().handle || ''
        }, group);
      });

      var hx = -side * (dw - 5.2);
      box(1.6, 13.5, 1.5, hx, handleY, 3.0, col.handle, pivot, 'handle');
      box(2.2, 2.6, 2.8, hx, handleY + 6.2, 1.7, col.handle, pivot, 'handle');
      box(2.2, 2.6, 2.8, hx, handleY - 6.2, 1.7, col.handle, pivot, 'handle');

      if (side === 1) {
        box(5.6, 4.2, 1.5, -dw + 1.8, 97 - fb, 1.6, col.handle, pivot, 'handle');
        box(4.2, 1.2, 1.8, -dw + 0.4, 97 - fb, 2.2, col.handle, pivot, 'handle');
      }
      doors.push({ pivot: pivot, deg: side * CFG.doorOpenDeg });
    });

    // Marc guia 3D per comprovar visualment que tot l'armari cap dins la pantalla abans de fixar-lo
    if (!DEMO && window.AFRAME) {
      var THREE = AFRAME.THREE;
      var boxGeo = new THREE.BoxGeometry(W + 1.5, H + 1.5, D + 1.5);
      var edgesGeo = new THREE.EdgesGeometry(boxGeo);
      frameGuideMat = new THREE.LineBasicMaterial({ color: 0xf39c12, transparent: true, opacity: 0.92 });
      frameGuideMesh = new THREE.LineSegments(edgesGeo, frameGuideMat);
      frameGuideMesh.position.set(W / 2, H / 2, -D / 2);
      frameGuideMesh.visible = false;
      group.object3D.add(frameGuideMesh);
    }

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

  function loadCover(b, rec) {
    var img = new Image();
    img.onload = function () {
      if (!img.naturalWidth || !img.naturalHeight) return;
      var r = img.naturalWidth / img.naturalHeight;
      var h = rec.maxH, w = h * r;
      if (w > rec.maxW) { w = rec.maxW; h = w / r; }
      rec.w = w; rec.h = h;
      rec.coverImg = img;

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
  var viewerStartScale = 1;

  function clearViewerImmediate() {
    if (viewerEl && viewerEl.parentNode) viewerEl.parentNode.removeChild(viewerEl);
    viewerEl = null;
    if (shownId && bookEls[shownId]) bookEls[shownId].g.setAttribute('visible', true);
    shownId = null;
    closingBook = false;
  }

  function getShelfTransformInCamera(rec, camEl) {
    var THREE = AFRAME.THREE;
    var p = new THREE.Vector3();
    var ws = new THREE.Vector3();
    rec.g.object3D.updateWorldMatrix(true, false);
    rec.g.object3D.getWorldPosition(p);
    rec.g.object3D.getWorldScale(ws);
    camEl.object3D.updateWorldMatrix(true, false);
    camEl.object3D.worldToLocal(p);
    return { pos: p, worldScaleY: ws.y || U };
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

    var shelf = getShelfTransformInCamera(rec, camEl);
    var targetPos = shelf.pos;
    var s0 = viewerStartScale;
    var curPos = v.object3D.position;
    var curScale = v.object3D.scale;
    var dur = 620;

    v.setAttribute('animation__backpos',
      'property: position; from: ' + curPos.x + ' ' + curPos.y + ' ' + curPos.z +
      '; to: ' + targetPos.x + ' ' + targetPos.y + ' ' + targetPos.z +
      '; dur: ' + dur + '; easing: easeInOutCubic');
    v.setAttribute('animation__backscale',
      'property: scale; from: ' + curScale.x + ' ' + curScale.y + ' ' + curScale.z +
      '; to: ' + s0 + ' ' + s0 + ' ' + s0 +
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

    var shelf = getShelfTransformInCamera(rec, camEl);
    var p = shelf.pos;

    var VH = 0.62, VW = VH * (rec.w / rec.h), D = VH * 0.085;
    var s0 = (rec.h * shelf.worldScaleY) / VH;
    viewerStartScale = s0;

    // Calculem la posició de vol proporcional a la distància real de l'armari i al FOV
    // de la càmera perquè MAI quedi tallat pel pla 'near' de MindAR ni massa petit/gran.
    var camObj = camEl.getObject3D('camera');
    var dist = Math.max(Math.abs(p.z), 1.5);
    var targetDist = dist * 0.62;
    var projY = camObj && camObj.projectionMatrix && camObj.projectionMatrix.elements && camObj.projectionMatrix.elements[5];
    var tanHalfFov = (projY && projY > 0.1)
      ? (1 / projY)
      : Math.tan(AFRAME.THREE.MathUtils.degToRad((camObj && camObj.fov) ? camObj.fov : 65) / 2);
    var visibleHeight = 2 * targetDist * tanHalfFov;
    var desiredHeight = visibleHeight * 0.36;
    var targetScale = desiredHeight / VH;
    var targetY = visibleHeight * 0.14;
    var targetZ = -targetDist;

    var v = el('a-entity', {
      position: p.x + ' ' + p.y + ' ' + p.z,
      scale: s0 + ' ' + s0 + ' ' + s0
    }, camEl);

    v.object3D.position.set(p.x, p.y, p.z);
    v.object3D.scale.set(s0, s0, s0);

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
      'property: position; from: ' + p.x + ' ' + p.y + ' ' + p.z +
      '; to: 0 ' + targetY + ' ' + targetZ +
      '; dur: ' + dur + '; easing: easeOutCubic');
    v.setAttribute('animation__grow',
      'property: scale; from: ' + s0 + ' ' + s0 + ' ' + s0 +
      '; to: ' + targetScale + ' ' + targetScale + ' ' + targetScale +
      '; dur: ' + dur + '; easing: easeOutBack');
    v.setAttribute('animation__spin',
      'property: rotation; from: 6 -340 -4; to: 2 -6 0; dur: ' + dur + '; easing: easeOutCubic');

    var bobTop = targetY + visibleHeight * 0.018;
    v.addEventListener('animationcomplete__fly', function () {
      if (closingBook || viewerEl !== v) return;
      v.setAttribute('animation__bob',
        'property: position; from: 0 ' + targetY + ' ' + targetZ +
        '; to: 0 ' + bobTop + ' ' + targetZ +
        '; dir: alternate; loop: true; dur: 2100; easing: easeInOutSine');
      v.setAttribute('animation__bobrot',
        'property: rotation; from: 2 -8 -1.5; to: -1 8 1.5; dir: alternate; loop: true; dur: 3200; easing: easeInOutSine');
    }, { once: true });

    rec.g.setAttribute('visible', false);
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
    if (currentId === id) return;
    currentId = id;
    $('p-msg').textContent = '';
    renderPanel();
    $('panel').classList.add('panel-closed');
    $('panel').setAttribute('aria-hidden', 'true');
    showViewer(id);
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
    flyBackViewer();
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
    setAnchorState('scanning');

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
    ensureHintUI();
    if ($('start')) $('start').addEventListener('click', startAR);
    if ($('close')) $('close').addEventListener('click', closePanel);
    if ($('p-pick')) $('p-pick').addEventListener('click', pickCurrent);
    if ($('lock-now-btn')) {
      $('lock-now-btn').addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (anchorState === 'settling') setAnchorState('locked');
      });
    }
    if ($('rescan-btn')) {
      $('rescan-btn').addEventListener('click', function (ev) {
        ev.stopPropagation();
        setAnchorState('scanning');
      });
    }

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

    try {
      buildScene();
      buildCabinet();

      if (!DEMO && rootEl) {
        rootEl.addEventListener('targetFound', function () {
          targetCurrentlyVisible = true;
          if (anchorState === 'scanning') {
            var comp = holderEl && holderEl.components && holderEl.components['smooth-anchor'];
            if (comp) comp.snapToTarget();
            setAnchorState('settling');
          }
        });
        rootEl.addEventListener('targetLost', function () {
          targetCurrentlyVisible = false;
          if (anchorState === 'settling' && everWasReady) {
            setAnchorState('locked');
          }
        });
      }
    } catch (err) {
      console.error('Error muntant escena 3D:', err);
      showError("Error carregant l'escena 3D: " + (err && err.message ? err.message : err));
    }

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
