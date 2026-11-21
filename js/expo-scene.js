/**
 * expo-scene.js
 * Scenario 2 — Exhibition Big-Screen & Touch Kiosk Engine (展会大屏互动演示)
 *
 * Designed specifically for trade-show 4K LED walls and 65"–86" interactive touch kiosks:
 *   1. Unattended 5-Act Cinematic Showreel (45s seamless loop):
 *      Act 1: Dramatic orbital hero pan around assembled CM-700MM
 *      Act 2: Smooth front cutaway slide-open (enclosure + floor contact shadow in lockstep)
 *      Act 3: Macro push-in across spinning R1–R5 calender rolls @ 45 m/min
 *      Act 4: Lateral tracking dolly along glowing S-wrap web G1–G10 & W1 winder @ 60 m/min
 *      Act 5: Live Exploded-View Assembly Showcase (parts float apart, hold, reassemble!)
 *   2. Instant Presenter / Touch Takeover + 25s Inactivity Auto-Resume:
 *      Any drag, pinch-zoom, button press, or clicker hotkey (1-5, C, X, E, Space, F, H)
 *      takes immediate control; after 25s of idle time, smoothly resets and resumes showreel.
 *   3. Multi-Touch Pointer Support (1-finger orbit, 2-finger pinch zoom & pan).
 *   4. Dark Obsidian Exhibition Plinth with architectural floor light-ring & high-contrast rim lights.
 *   5. 100% Offline Local Three.js r147 + Draco WASM + Single Source of Truth config.
 */
(function (global) {
  'use strict';

  var CM700 = global.CM700App = global.CM700App || {};
  var DATA = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutCubic(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function $(id) { return document.getElementById(id); }

  // ===========================================================================
  // 1. 5-ACT CINEMATIC SHOWREEL TIMELINE (45 SECONDS SEAMLESS LOOP)
  // ===========================================================================
  var TOTAL_CYCLE_SEC = 45.0;
  var IDLE_AUTO_RESUME_SEC = 25.0;

  var SHOWREEL_ACTS = [
    {
      index: 0,
      start: 0.0,
      end: 9.0,
      code: 'ACT 01',
      tag: '旗舰外观巡航 · FLAGSHIP OVERVIEW',
      headline: '700 mm 宽幅干法极片制膜旗舰',
      subline: '彻底告别 NMP 有毒溶剂与百米干燥烘箱，以五辊精密压延重塑动力与固态电池极片制造',
      startPos: [6.75, 2.28, 5.95],
      endPos:   [4.75, 2.02, 7.25],
      startTgt: [-0.25, 1.18, -0.45],
      endTgt:   [-0.25, 1.18, -0.45],
      manualPos: [5.75, 2.12, 6.65],
      manualTgt: [-0.22, 1.18, -0.45],
      speed: 24.0,
      cutawayMode: 'closed',
      explodeMode: 'none'
    },
    {
      index: 1,
      start: 9.0,
      end: 18.0,
      code: 'ACT 02',
      tag: '动态剖视透解 · MODULAR CUTAWAY',
      headline: '全密闭拉丝防护 · 一键滑移直达核心',
      subline: '前置 CM-700MM 重型移动护罩与 C 型前护板平滑外移，五辊主机与 10 组导辊路径一览无余',
      startPos: [2.85, 1.82, 5.95],
      endPos:   [-0.65, 1.48, 4.95],
      startTgt: [0.15, 1.15, -0.15],
      endTgt:   [0.25, 1.12, -0.10],
      manualPos: [-0.65, 1.48, 4.95],
      manualTgt: [0.25, 1.12, -0.10],
      speed: 32.0,
      cutawayMode: 'open_ramp',
      explodeMode: 'none'
    },
    {
      index: 2,
      start: 18.0,
      end: 27.0,
      code: 'ACT 03',
      tag: '五辊阶梯压延 · 5-ROLL CALENDER STACK',
      headline: '五辊阶梯递进压延 · ±1.5 μm 致密成膜',
      subline: '860 kN 液压弯辊补偿与 ±0.5 °C 热油恒温控辊，16 根辊轴实时同步对旋，零针孔一次成膜',
      startPos: [-0.65, 1.48, 3.25],
      endPos:   [0.05, 1.36, 2.58],
      startTgt: [-0.08, 1.28, 0.02],
      endTgt:   [0.14, 1.22, 0.02],
      manualPos: [-0.28, 1.42, 2.90],
      manualTgt: [0.05, 1.24, 0.02],
      speed: 45.0,
      cutawayMode: 'open',
      explodeMode: 'none'
    },
    {
      index: 3,
      start: 27.0,
      end: 36.0,
      code: 'ACT 04',
      tag: 'S 型张力测厚 · PRECISION WEB & WINDING',
      headline: '10 导辊 S 型张力链 · 60 m/min 齐边收卷',
      subline: '5.98 m 零褶皱相切料带路径，集成 G6–G7 全幅在线激光测厚桥与 C 型气胀轴快速换卷',
      startPos: [0.60, 1.12, 3.35],
      endPos:   [2.38, 0.96, 3.12],
      startTgt: [1.08, 0.74, 0.04],
      endTgt:   [1.72, 0.56, 0.02],
      manualPos: [1.65, 1.06, 3.35],
      manualTgt: [1.38, 0.68, 0.03],
      speed: 60.0,
      cutawayMode: 'open',
      explodeMode: 'none'
    },
    {
      index: 4,
      start: 36.0,
      end: 45.0,
      code: 'ACT 05',
      tag: '模块化整线架构 · EXPLODED ASSEMBLY',
      headline: '13 大模块化工程总成 · 交钥匙整线交付',
      subline: '涵盖供粉塔架、悬臂 SCADA 智控、ISO 安全梯台、模温液压站与双联 PLC 电控，快速部署投产',
      startPos: [6.25, 3.10, 6.85],
      endPos:   [4.25, 2.65, 7.85],
      startTgt: [-0.15, 1.35, -0.35],
      endTgt:   [-0.15, 1.25, -0.35],
      manualPos: [5.65, 2.95, 7.25],
      manualTgt: [-0.15, 1.32, -0.35],
      speed: 24.0,
      cutawayMode: 'close_ramp',
      explodeMode: 'pulse'
    }
  ];

  // ===========================================================================
  // 2. BOOTSTRAP FROM SINGLE SOURCE OF TRUTH (specs/machine_config.json)
  // ===========================================================================
  function bootstrapExpo() {
    fetch('specs/machine_config.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (cfg) {
        var partsById = {};
        (cfg.parts || []).forEach(function (p) { partsById[p.id] = p; });
        DATA = {
          RAW_CONFIG: cfg,
          PARTS: cfg.parts || [],
          PARTS_BY_ID: partsById,
          CAMERA_PRESETS: cfg.cameraPresets || {},
          MACHINE_SPECS: cfg.machine || {},
          CONTACT_SHADOW: cfg.contactShadow || { xMin: -4.6, xMax: 3.8, zMin: -3.8, zMax: 2.6 },
          CUTAWAY_OFFSET_Z: (cfg.layout && cfg.layout.cutawayOffsetZ) ? Number(cfg.layout.cutawayOffsetZ) : 2.35
        };
        CM700.DATA = DATA;
        initExpoStage();
      })
      .catch(function (err) {
        console.error('Expo config load failed:', err);
        var lt = $('expo-loader-text');
        if (lt) lt.textContent = '配置加载失败：请通过 HTTP 服务访问本页面';
      });
  }

  // ===========================================================================
  // 3. PROCEDURAL EXHIBITION STAGE FLOOR TEXTURE (RADIAL SPOTLIGHT + RINGS)
  // ===========================================================================
  function createExhibitionPlinthTexture(THREE) {
    var sz = 1024;
    var canvas = document.createElement('canvas');
    canvas.width = sz;
    canvas.height = sz;
    var ctx = canvas.getContext('2d');
    var c = sz * 0.5;

    // Deep obsidian stage radial gradient (balanced so metallic CM-700MM pops cleanly)
    var grad = ctx.createRadialGradient(c, c, 20, c, c, c);
    grad.addColorStop(0.0, '#162030');
    grad.addColorStop(0.32, '#0e1624');
    grad.addColorStop(0.62, '#080e18');
    grad.addColorStop(1.0, '#060a12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sz, sz);

    // Subtle precision architectural concentric turntable rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c, c, sz * 0.30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, sz * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle radial compass ticks on outer exhibition plinth ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.26)';
    ctx.lineWidth = 1.5;
    for (var i = 0; i < 36; i++) {
      var ang = (i / 36) * Math.PI * 2;
      var r0 = sz * (i % 3 === 0 ? 0.290 : 0.295);
      var r1 = sz * 0.306;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(ang) * r0, c + Math.sin(ang) * r0);
      ctx.lineTo(c + Math.cos(ang) * r1, c + Math.sin(ang) * r1);
      ctx.stroke();
    }

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  // ===========================================================================
  // 4. MAIN 3D EXHIBITION STAGE INITIALIZATION
  // ===========================================================================
  function initExpoStage() {
    var THREE = global.THREE;
    var host = $('expo-canvas-host');
    var poster = $('expo-poster');
    var loaderEl = $('expo-loader');
    var loaderText = $('expo-loader-text');

    if (!THREE || !THREE.GLTFLoader || !THREE.DRACOLoader || !host) {
      if (loaderEl) loaderEl.classList.add('done');
      return;
    }

    var width = host.clientWidth || window.innerWidth;
    var height = host.clientHeight || window.innerHeight;

    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    var voidHex = 0x060a12;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(voidHex);
    scene.fog = new THREE.Fog(voidHex, 13.5, 32.0);

    var camera = new THREE.PerspectiveCamera(39, width / height, 0.08, 100);

    // Dramatic High-Contrast Trade-Show Showroom PMREM Environment
    function createExpoEnvMap() {
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x161f2e);

      var strips = [
        // Brilliant overhead linear gallery light bar
        { pos: [0, 8.5, 0],   rot: [Math.PI / 2, 0, 0],  size: [15, 4.5], color: 0xffffff, mult: 2.8 },
        // Warm key reflector right-front (brings brushed stainless & gold stairs alive!)
        { pos: [9, 5, 7],     rot: [0, -Math.PI / 4, 0], size: [7, 5.5],  color: 0xfff5e6, mult: 2.3 },
        // Electric cyan rim panel left-back (signature trade-show edge highlight!)
        { pos: [-9, 4.5, 5],  rot: [0, Math.PI / 3, 0],  size: [8, 4.5],  color: 0x38bdf8, mult: 1.9 },
        { pos: [0, 4.5, -10], rot: [0, 0, 0],            size: [12, 4.5], color: 0xbae6fd, mult: 1.8 },
        // Subtle dark reflective floor bounce
        { pos: [0, -5, 0],    rot: [-Math.PI / 2, 0, 0], size: [22, 22],  color: 0x1e293b, mult: 0.9 }
      ];
      strips.forEach(function (ps) {
        var geo = new THREE.PlaneGeometry(ps.size[0], ps.size[1]);
        var col = new THREE.Color(ps.color).multiplyScalar(ps.mult);
        var mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
        var m = new THREE.Mesh(geo, mat);
        m.position.set(ps.pos[0], ps.pos[1], ps.pos[2]);
        m.rotation.set(ps.rot[0], ps.rot[1], ps.rot[2]);
        envScene.add(m);
      });

      var rt = pmrem.fromScene(envScene, 0.030);
      pmrem.dispose();
      return rt.texture;
    }

    scene.environment = createExpoEnvMap();

    // Cinematic Showroom Lighting Rig
    var hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.78);
    scene.add(hemi);

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    keyLight.position.set(6.5, 9.2, 7.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 26.0;
    keyLight.shadow.camera.left = -5.5;
    keyLight.shadow.camera.right = 5.5;
    keyLight.shadow.camera.top = 5.0;
    keyLight.shadow.camera.bottom = -4.0;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    var cyanRim = new THREE.DirectionalLight(0x38bdf8, 0.95);
    cyanRim.position.set(-8.0, 5.0, 4.5);
    scene.add(cyanRim);

    var backRim = new THREE.DirectionalLight(0xe0f2fe, 0.85);
    backRim.position.set(-2.0, 5.5, -8.0);
    scene.add(backRim);

    var nipLight = new THREE.PointLight(0x38d8ff, 1.4, 3.6, 1.7);
    nipLight.position.set(-0.35, 1.55, 0.55);
    scene.add(nipLight);

    // Exhibition Plinth Stage Floor
    var plinthTex = createExhibitionPlinthTexture(THREE);
    var floorGeo = new THREE.CircleGeometry(15.5, 72);
    var floorMat = new THREE.MeshStandardMaterial({
      map: plinthTex,
      roughness: 0.62,
      metalness: 0.14
    });
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(-0.20, -0.002, -0.45);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Dual Baked Floor Contact Shadows
    var csCfg = DATA.CONTACT_SHADOW;
    var csWidth = csCfg.xMax - csCfg.xMin;
    var csDepth = csCfg.zMax - csCfg.zMin;
    var csCenterX = (csCfg.xMin + csCfg.xMax) * 0.5;
    var csCenterZ = (csCfg.zMin + csCfg.zMax) * 0.5;
    var texLoader = new THREE.TextureLoader();

    var staticShadowMat = new THREE.MeshBasicMaterial({
      map: texLoader.load('assets/contact_shadow_static.png'),
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    var staticShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(csWidth, csDepth), staticShadowMat);
    staticShadowMesh.rotation.x = -Math.PI / 2;
    staticShadowMesh.position.set(csCenterX, 0.0014, csCenterZ);
    staticShadowMesh.renderOrder = 1;
    scene.add(staticShadowMesh);

    var cutawayShadowMat = new THREE.MeshBasicMaterial({
      map: texLoader.load('assets/contact_shadow_cutaway.png'),
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    var cutawayShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(csWidth, csDepth), cutawayShadowMat);
    cutawayShadowMesh.rotation.x = -Math.PI / 2;
    cutawayShadowMesh.position.set(csCenterX, 0.0022, csCenterZ);
    cutawayShadowMesh.renderOrder = 2;
    scene.add(cutawayShadowMesh);

    // Subtle Ambient Showroom Dust Motes (adds live 4K LED depth without distracting)
    var moteCount = 90;
    // Soft circular radial bokeh texture for perimeter showroom motes
    var moteCvs = document.createElement('canvas');
    moteCvs.width = 32;
    moteCvs.height = 32;
    var mCtx = moteCvs.getContext('2d');
    var mGrad = mCtx.createRadialGradient(16, 16, 1, 16, 16, 16);
    mGrad.addColorStop(0.0, 'rgba(125, 211, 252, 0.95)');
    mGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.45)');
    mGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0.0)');
    mCtx.fillStyle = mGrad;
    mCtx.fillRect(0, 0, 32, 32);
    var moteTex = new THREE.CanvasTexture(moteCvs);

    var moteGeo = new THREE.BufferGeometry();
    var motePos = new Float32Array(moteCount * 3);
    for (var mi = 0; mi < moteCount; mi++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 4.2 + Math.random() * 6.5;
      motePos[mi * 3 + 0] = -0.2 + Math.cos(ang) * rad;
      motePos[mi * 3 + 1] = 0.4 + Math.random() * 4.5;
      motePos[mi * 3 + 2] = -0.4 + Math.sin(ang) * rad;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    var moteMat = new THREE.PointsMaterial({
      size: 0.075,
      map: moteTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var moteField = new THREE.Points(moteGeo, moteMat);
    scene.add(moteField);

    // =========================================================================
    // 5. STATE, SHOWREEL ENGINE & ORBIT CAMERA
    // =========================================================================
    var machine = null;
    var SPEED_STEPS = [24, 45, 60];
    var state = {
      isAutoShowreel: true,
      showreelTime: 0.0,
      activeActIdx: 0,
      idleTimer: 0.0,
      lineSpeed: 24.0,
      cutawayProgress: 0.0,
      targetCutaway: 0.0,
      explodeAmount: 0.0,
      targetExplode: 0.0,
      viewMode: 'solid', // solid | cutaway | xray
      cleanWall: false
    };

    var cam = {
      target: new THREE.Vector3(-0.25, 1.18, -0.45),
      desiredTarget: new THREE.Vector3(-0.25, 1.18, -0.45),
      theta: 0.80,
      phi: 1.44,
      radius: 9.0,
      desiredTheta: 0.80,
      desiredPhi: 1.44,
      desiredRadius: 9.0,
      tween: null
    };

    function syncSphericalFromPos(posArr, tgtArr, immediate) {
      var p = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
      var t = new THREE.Vector3(tgtArr[0], tgtArr[1], tgtArr[2]);
      var off = p.clone().sub(t);
      var r = Math.max(1.2, off.length());
      var phi = clamp(Math.acos(clamp(off.y / r, -0.999, 0.999)), 0.14, Math.PI * 0.485);
      var theta = Math.atan2(off.x, off.z);
      cam.desiredTarget.copy(t);
      cam.desiredRadius = r;
      cam.desiredPhi = phi;
      cam.desiredTheta = theta;
      if (immediate) {
        cam.target.copy(t);
        cam.radius = r;
        cam.phi = phi;
        cam.theta = theta;
      }
    }

    function tweenCameraTo(posArr, tgtArr, durationSec) {
      cam.tween = {
        elapsed: 0,
        duration: durationSec || 0.95,
        startPos: camera.position.clone(),
        startTgt: cam.target.clone(),
        endPos: new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
        endTgt: new THREE.Vector3(tgtArr[0], tgtArr[1], tgtArr[2])
      };
    }

    // Initialize at Act 0 start pose
    syncSphericalFromPos(SHOWREEL_ACTS[0].startPos, SHOWREEL_ACTS[0].startTgt, true);

    // =========================================================================
    // 6. UI SYNCHRONIZATION & BROADCAST LOWER-THIRD TRANSITIONS
    // =========================================================================
    var lowerThirdEl = $('expo-lower-third');
    var ltSwitchTimeout = null;

    function updateLowerThird(actIdx, immediate) {
      var act = SHOWREEL_ACTS[actIdx] || SHOWREEL_ACTS[0];
      function applyText() {
        if ($('lt-act-num')) $('lt-act-num').textContent = act.code;
        if ($('lt-act-tag')) $('lt-act-tag').textContent = act.tag;
        if ($('lt-headline')) $('lt-headline').textContent = act.headline;
        if ($('lt-subline')) $('lt-subline').textContent = act.subline;
      }
      if (immediate || !lowerThirdEl) {
        applyText();
        return;
      }
      if (ltSwitchTimeout) clearTimeout(ltSwitchTimeout);
      lowerThirdEl.classList.add('switching');
      ltSwitchTimeout = setTimeout(function () {
        applyText();
        lowerThirdEl.classList.remove('switching');
      }, 180);
    }

    function updateKPIs() {
      var spd = state.lineSpeed;
      if ($('expo-kpi-speed')) $('expo-kpi-speed').textContent = spd.toFixed(1);
      if ($('expo-kpi-output')) $('expo-kpi-output').textContent = (spd * 0.70).toFixed(1);
      if ($('btn-speed-text')) $('btn-speed-text').textContent = Math.round(spd) + ' m/min';
    }

    function syncControlStates() {
      // Act buttons
      document.querySelectorAll('.act-btn').forEach(function (b) {
        b.classList.toggle('active', Number(b.getAttribute('data-act')) === state.activeActIdx);
      });
      // Mode toggle buttons
      if ($('btn-exp-cutaway')) $('btn-exp-cutaway').classList.toggle('active', state.targetCutaway > 0.5);
      if ($('btn-exp-xray')) $('btn-exp-xray').classList.toggle('active', state.viewMode === 'xray');
      if ($('btn-exp-explode')) $('btn-exp-explode').classList.toggle('active', state.targetExplode > 0.15);

      // Play/Auto-showreel button & top status pill
      var playBtn = $('btn-exp-play');
      var statusPill = $('mode-status-pill');
      var statusLabel = $('status-mode-label');
      var cdEl = $('idle-countdown');

      if (playBtn) {
        playBtn.classList.toggle('is-playing', state.isAutoShowreel);
        playBtn.textContent = state.isAutoShowreel ? '⏸ 巡演中' : '▶ 恢复巡演';
      }
      if (statusPill && statusLabel) {
        statusPill.classList.toggle('is-auto', state.isAutoShowreel);
        statusPill.classList.toggle('is-manual', !state.isAutoShowreel);
        if (state.isAutoShowreel) {
          statusLabel.textContent = '无人值守巡演 · ACT 0' + (state.activeActIdx + 1) + ' / 05';
          if (cdEl) cdEl.classList.add('hidden');
        } else {
          statusLabel.textContent = '讲解交互接管中';
          if (cdEl) {
            var rem = Math.max(1, Math.ceil(IDLE_AUTO_RESUME_SEC - state.idleTimer));
            cdEl.textContent = rem + 's 后自动恢复';
            cdEl.classList.remove('hidden');
          }
        }
      }
      updateKPIs();
    }

    function enterManualTakeover() {
      state.isAutoShowreel = false;
      state.idleTimer = 0.0;
      syncControlStates();
    }

    function resumeAutoShowreel() {
      state.isAutoShowreel = true;
      state.idleTimer = 0.0;
      state.viewMode = 'solid';
      if (machine) machine.setViewMode('solid');
      cam.tween = null;
      // Align showreel clock to start of current act for smooth continuation
      var act = SHOWREEL_ACTS[state.activeActIdx] || SHOWREEL_ACTS[0];
      state.showreelTime = act.start;
      syncControlStates();
    }

    function jumpToAct(actIdx) {
      var act = SHOWREEL_ACTS[actIdx];
      if (!act) return;
      enterManualTakeover();
      var changed = (state.activeActIdx !== actIdx);
      state.activeActIdx = actIdx;
      state.showreelTime = act.start + 0.5;
      state.lineSpeed = act.speed;
      state.viewMode = 'solid';
      if (machine) machine.setViewMode('solid');

      if (actIdx === 0) {
        state.targetCutaway = 0.0;
        state.targetExplode = 0.0;
      } else if (actIdx === 1 || actIdx === 2 || actIdx === 3) {
        state.targetCutaway = 1.0;
        state.targetExplode = 0.0;
      } else if (actIdx === 4) {
        state.targetCutaway = 0.0;
        state.targetExplode = 0.68;
      }
      tweenCameraTo(act.manualPos, act.manualTgt, 0.95);
      if (changed) updateLowerThird(actIdx, false);
      syncControlStates();
    }

    // =========================================================================
    // 7. SHOWREEL CHOREOGRAPHY EVALUATOR (45s CONTINUOUS LOOP)
    // =========================================================================
    function updateAutoShowreel(dt) {
      state.showreelTime = (state.showreelTime + dt) % TOTAL_CYCLE_SEC;
      var t = state.showreelTime;

      // Update full-width broadcast progress bar
      var fill = $('expo-progress-fill');
      if (fill) fill.style.width = ((t / TOTAL_CYCLE_SEC) * 100).toFixed(2) + '%';

      // Find current act
      var act = SHOWREEL_ACTS[0];
      for (var i = 0; i < SHOWREEL_ACTS.length; i++) {
        if (t >= SHOWREEL_ACTS[i].start && t < SHOWREEL_ACTS[i].end) {
          act = SHOWREEL_ACTS[i];
          break;
        }
      }

      if (act.index !== state.activeActIdx) {
        state.activeActIdx = act.index;
        updateLowerThird(act.index, false);
        syncControlStates();
      }

      var dur = Math.max(0.1, act.end - act.start);
      var u = clamp((t - act.start) / dur, 0.0, 1.0);
      var k = easeInOutCubic(u);

      // Smoothly interpolate camera pose inside act
      var p = [
        lerp(act.startPos[0], act.endPos[0], k),
        lerp(act.startPos[1], act.endPos[1], k),
        lerp(act.startPos[2], act.endPos[2], k)
      ];
      var tgt = [
        lerp(act.startTgt[0], act.endTgt[0], k),
        lerp(act.startTgt[1], act.endTgt[1], k),
        lerp(act.startTgt[2], act.endTgt[2], k)
      ];
      // Use gentle spherical damping so transitions between acts glide seamlessly!
      syncSphericalFromPos(p, tgt, false);

      // Cutaway choreography
      if (act.cutawayMode === 'closed') {
        state.targetCutaway = 0.0;
      } else if (act.cutawayMode === 'open') {
        state.targetCutaway = 1.0;
      } else if (act.cutawayMode === 'open_ramp') {
        state.targetCutaway = easeInOutCubic((u - 0.12) / 0.50);
      } else if (act.cutawayMode === 'close_ramp') {
        state.targetCutaway = 1.0 - easeInOutCubic(u / 0.25);
      }

      // Explode choreography (Act 5: smoothly explode 0 -> 0.72, hold, smoothly reassemble 0.72 -> 0!)
      if (act.explodeMode === 'pulse') {
        if (u < 0.28) {
          state.targetExplode = 0.72 * easeInOutCubic(u / 0.28);
        } else if (u < 0.70) {
          state.targetExplode = 0.72;
        } else {
          state.targetExplode = 0.72 * (1.0 - easeInOutCubic((u - 0.70) / 0.28));
        }
      } else {
        state.targetExplode = 0.0;
      }

      // Smoothly ramp line speed to act's signature pace
      state.lineSpeed = lerp(state.lineSpeed, act.speed, 1.0 - Math.exp(-3.5 * dt));
      updateKPIs();
    }

    // =========================================================================
    // 8. FLOOR SHADOW SYNC
    // =========================================================================
    function updateFloorShadows() {
      var cutP = clamp(state.cutawayProgress, 0.0, 1.0);
      var slideEase = easeInOutCubic(cutP);
      var cutAlpha = clamp(1.0 - (cutP - 0.32) / 0.58, 0.0, 1.0);
      var explodeFade = clamp(1.0 - state.explodeAmount * 1.45, 0.0, 1.0);
      var xrayFade = (state.viewMode === 'xray') ? 0.35 : 1.0;
      var baseStrength = 0.82 * explodeFade * xrayFade;

      staticShadowMat.opacity = baseStrength;
      staticShadowMesh.visible = baseStrength > 0.01;

      cutawayShadowMesh.position.z = csCenterZ + DATA.CUTAWAY_OFFSET_Z * slideEase;
      cutawayShadowMat.opacity = baseStrength * cutAlpha;
      cutawayShadowMesh.visible = (baseStrength * cutAlpha) > 0.01;
    }

    // =========================================================================
    // 9. MULTI-TOUCH & MOUSE CONTROLS (65"-86" TOUCH KIOSK READY)
    // =========================================================================
    var domEl = renderer.domElement;
    var activePointers = {};
    var lastPinchDist = 0;
    var lastPanMid = null;
    var mouseDragMode = 'orbit';

    function getPointerList() {
      return Object.keys(activePointers).map(function (k) { return activePointers[k]; });
    }

    domEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    domEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      enterManualTakeover();
      cam.tween = null;
      activePointers[e.pointerId] = { x: e.clientX, y: e.clientY, button: e.button };
      mouseDragMode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      try { domEl.setPointerCapture(e.pointerId); } catch (_) {}

      var pts = getPointerList();
      if (pts.length === 2) {
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        lastPanMid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
      }
    });

    domEl.addEventListener('pointermove', function (e) {
      if (!activePointers[e.pointerId]) return;
      state.idleTimer = 0.0;
      var prev = activePointers[e.pointerId];
      var dx = e.clientX - prev.x;
      var dy = e.clientY - prev.y;
      activePointers[e.pointerId] = { x: e.clientX, y: e.clientY, button: prev.button };

      var pts = getPointerList();
      if (pts.length === 1) {
        if (mouseDragMode === 'orbit') {
          cam.desiredTheta -= dx * 0.0062;
          cam.desiredPhi = clamp(cam.desiredPhi - dy * 0.0055, 0.14, Math.PI * 0.485);
        } else {
          var panSpd = cam.radius * 0.0011;
          var right = new THREE.Vector3();
          var up = new THREE.Vector3();
          camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
          cam.desiredTarget.addScaledVector(right, -dx * panSpd);
          cam.desiredTarget.addScaledVector(up, dy * panSpd);
          cam.desiredTarget.y = clamp(cam.desiredTarget.y, 0.2, 3.2);
        }
      } else if (pts.length >= 2) {
        // 2-finger pinch zoom + pan for big exhibition touchscreens
        var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        var mid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        if (lastPinchDist > 10 && dist > 10) {
          var zoomFactor = lastPinchDist / dist;
          cam.desiredRadius = clamp(cam.desiredRadius * zoomFactor, 1.8, 16.0);
        }
        if (lastPanMid) {
          var pdx = mid.x - lastPanMid.x;
          var pdy = mid.y - lastPanMid.y;
          var pSpd = cam.radius * 0.0010;
          var rVec = new THREE.Vector3();
          var uVec = new THREE.Vector3();
          camera.matrixWorld.extractBasis(rVec, uVec, new THREE.Vector3());
          cam.desiredTarget.addScaledVector(rVec, -pdx * pSpd);
          cam.desiredTarget.addScaledVector(uVec, pdy * pSpd);
          cam.desiredTarget.y = clamp(cam.desiredTarget.y, 0.2, 3.2);
        }
        lastPinchDist = dist;
        lastPanMid = mid;
      }
    });

    function endPointer(e) {
      delete activePointers[e.pointerId];
      try { domEl.releasePointerCapture(e.pointerId); } catch (_) {}
      var pts = getPointerList();
      if (pts.length < 2) {
        lastPinchDist = 0;
        lastPanMid = null;
      }
    }
    domEl.addEventListener('pointerup', endPointer);
    domEl.addEventListener('pointercancel', endPointer);

    domEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      enterManualTakeover();
      cam.tween = null;
      var factor = Math.pow(1.0012, e.deltaY);
      cam.desiredRadius = clamp(cam.desiredRadius * factor, 1.8, 16.0);
    }, { passive: false });

    // =========================================================================
    // 10. PRESENTER DOCK & WIRELESS CLICKER HOTKEYS
    // =========================================================================
    document.querySelectorAll('.act-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        jumpToAct(Number(b.getAttribute('data-act')));
      });
    });

    function toggleCutaway() {
      enterManualTakeover();
      state.targetCutaway = state.targetCutaway > 0.5 ? 0.0 : 1.0;
      if (state.viewMode === 'xray') {
        state.viewMode = 'solid';
        if (machine) machine.setViewMode('solid');
      }
      syncControlStates();
    }

    function toggleXray() {
      enterManualTakeover();
      state.viewMode = (state.viewMode === 'xray') ? 'solid' : 'xray';
      if (machine) machine.setViewMode(state.viewMode);
      syncControlStates();
    }

    function toggleExplode() {
      enterManualTakeover();
      state.targetExplode = state.targetExplode > 0.15 ? 0.0 : 0.68;
      syncControlStates();
    }

    function cycleSpeed() {
      enterManualTakeover();
      var cur = Math.round(state.lineSpeed);
      var nextIdx = 0;
      for (var i = 0; i < SPEED_STEPS.length; i++) {
        if (SPEED_STEPS[i] > cur + 2) { nextIdx = i; break; }
      }
      state.lineSpeed = SPEED_STEPS[nextIdx];
      syncControlStates();
    }

    function toggleCleanWall() {
      state.cleanWall = !state.cleanWall;
      document.body.classList.toggle('clean-wall', state.cleanWall);
      var restoreBtn = $('btn-restore-hud');
      if (restoreBtn) restoreBtn.classList.toggle('hidden', !state.cleanWall);
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(function () {});
        }
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    }

    if ($('btn-exp-cutaway')) $('btn-exp-cutaway').addEventListener('click', toggleCutaway);
    if ($('btn-exp-xray')) $('btn-exp-xray').addEventListener('click', toggleXray);
    if ($('btn-exp-explode')) $('btn-exp-explode').addEventListener('click', toggleExplode);
    if ($('btn-exp-speed')) $('btn-exp-speed').addEventListener('click', cycleSpeed);
    if ($('btn-exp-play')) {
      $('btn-exp-play').addEventListener('click', function () {
        if (state.isAutoShowreel) enterManualTakeover();
        else resumeAutoShowreel();
      });
    }
    if ($('btn-exp-reset')) {
      $('btn-exp-reset').addEventListener('click', function () {
        state.activeActIdx = 0;
        state.targetCutaway = 0.0;
        state.targetExplode = 0.0;
        state.viewMode = 'solid';
        state.lineSpeed = 24.0;
        if (machine) machine.setViewMode('solid');
        updateLowerThird(0, false);
        resumeAutoShowreel();
      });
    }
    if ($('btn-clean-wall')) $('btn-clean-wall').addEventListener('click', toggleCleanWall);
    if ($('btn-restore-hud')) $('btn-restore-hud').addEventListener('click', toggleCleanWall);
    if ($('btn-fullscreen')) $('btn-fullscreen').addEventListener('click', toggleFullscreen);

    window.addEventListener('keydown', function (e) {
      if (e.key >= '1' && e.key <= '5') {
        jumpToAct(Number(e.key) - 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (state.isAutoShowreel) enterManualTakeover();
        else resumeAutoShowreel();
      } else if (e.key === 'c' || e.key === 'C') {
        toggleCutaway();
      } else if (e.key === 'x' || e.key === 'X') {
        toggleXray();
      } else if (e.key === 'e' || e.key === 'E') {
        toggleExplode();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleCleanWall();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'r' || e.key === 'R') {
        state.activeActIdx = 0;
        updateLowerThird(0, false);
        resumeAutoShowreel();
      }
    });

    // =========================================================================
    // 11. LOAD LOCAL DRACO-COMPRESSED GLB
    // =========================================================================
    var dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('vendor/draco/');
    var gltfLoader = new THREE.GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    fetch('assets/web_centerline.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (webMeta) {
        gltfLoader.load(
          'assets/cm700mm_calender.glb',
          function (gltf) {
            machine = CM700.buildMachineFromGLTF(THREE, gltf, webMeta);
            scene.add(machine.root);
            if (poster) poster.classList.add('fade-out');
            if (loaderEl) loaderEl.classList.add('done');
            updateLowerThird(0, true);
            syncControlStates();
            updateFloorShadows();
          },
          function (xhr) {
            if (loaderText && xhr.total) {
              loaderText.textContent = '正在加载 3D 精密展品… ' + Math.round((xhr.loaded / xhr.total) * 100) + '%';
            }
          },
          function (err) {
            console.error('Expo GLB load error:', err);
            if (loaderText) loaderText.textContent = '3D 加载失败，请通过本地/云端 HTTP 访问';
          }
        );
      });

    // =========================================================================
    // 12. ANIMATION LOOP & RESIZE
    // =========================================================================
    window.addEventListener('resize', function () {
      var w = host.clientWidth || window.innerWidth;
      var h = host.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    var lastTime = performance.now();
    var lastCountdownSec = -1;

    function tick(now) {
      requestAnimationFrame(tick);
      var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000.0));
      lastTime = now;

      if (state.isAutoShowreel) {
        updateAutoShowreel(dt);
      } else {
        // Count down inactivity -> seamlessly return to unattended showreel
        if (Object.keys(activePointers).length === 0) {
          state.idleTimer += dt;
          var remSec = Math.max(0, Math.ceil(IDLE_AUTO_RESUME_SEC - state.idleTimer));
          if (remSec !== lastCountdownSec) {
            lastCountdownSec = remSec;
            var cdEl = $('idle-countdown');
            if (cdEl) cdEl.textContent = remSec + 's 后自动恢复';
          }
          if (state.idleTimer >= IDLE_AUTO_RESUME_SEC) {
            resumeAutoShowreel();
          }
        }
      }

      // Smooth camera update (tween vs spherical damping)
      if (cam.tween) {
        var tw = cam.tween;
        tw.elapsed += dt;
        var k = easeInOutCubic(tw.elapsed / tw.duration);
        var curP = tw.startPos.clone().lerp(tw.endPos, k);
        var curT = tw.startTgt.clone().lerp(tw.endTgt, k);
        syncSphericalFromPos([curP.x, curP.y, curP.z], [curT.x, curT.y, curT.z], true);
        if (tw.elapsed >= tw.duration) cam.tween = null;
      } else {
        var dampRate = state.isAutoShowreel ? 3.2 : 8.5;
        var damp = 1.0 - Math.exp(-dampRate * dt);
        cam.target.lerp(cam.desiredTarget, damp);
        // Shortest-angle wrap for theta so orbital sweeps never spin backward
        var dTheta = cam.desiredTheta - cam.theta;
        while (dTheta > Math.PI) dTheta -= Math.PI * 2;
        while (dTheta < -Math.PI) dTheta += Math.PI * 2;
        cam.theta += dTheta * damp;
        cam.phi = lerp(cam.phi, cam.desiredPhi, damp);
        cam.radius = lerp(cam.radius, cam.desiredRadius, damp);
      }

      var sinPhi = Math.sin(cam.phi);
      camera.position.set(
        cam.target.x + cam.radius * sinPhi * Math.sin(cam.theta),
        cam.target.y + cam.radius * Math.cos(cam.phi),
        cam.target.z + cam.radius * sinPhi * Math.cos(cam.theta)
      );
      camera.lookAt(cam.target);

      // Smooth cutaway & explode interpolation
      if (machine) {
        var cDamp = 1.0 - Math.exp(-6.0 * dt);
        if (Math.abs(state.cutawayProgress - state.targetCutaway) > 0.0008) {
          state.cutawayProgress = lerp(state.cutawayProgress, state.targetCutaway, cDamp);
          if (Math.abs(state.cutawayProgress - state.targetCutaway) < 0.0015) {
            state.cutawayProgress = state.targetCutaway;
          }
          machine.setCutawayProgress(state.cutawayProgress);
        }
        if (Math.abs(state.explodeAmount - state.targetExplode) > 0.0008) {
          state.explodeAmount = lerp(state.explodeAmount, state.targetExplode, cDamp);
          if (Math.abs(state.explodeAmount - state.targetExplode) < 0.0015) {
            state.explodeAmount = state.targetExplode;
          }
          machine.setExplodeAmount(state.explodeAmount);
        }
        machine.updateKinematics(dt, state.lineSpeed, true);
      }

      // Subtle perimeter mote drift
      moteField.rotation.y += dt * 0.025;

      updateFloorShadows();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);

    CM700._expoDebug = {
      jumpToAct: jumpToAct,
      resumeAutoShowreel: resumeAutoShowreel,
      toggleCleanWall: toggleCleanWall,
      toggleXray: toggleXray,
      toggleExplode: toggleExplode
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapExpo);
  } else {
    bootstrapExpo();
  }
})(window);
