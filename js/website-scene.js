/**
 * website-scene.js
 * Scenario 1 — Official Product Website (官网产品展示页) 3D Orchestrator
 *
 * Design principles specifically tailored for an Official B2B Product Website:
 *   1. Zero scroll hijacking: sticky 3D canvas passively choreographs camera & cutaway
 *      directly from smooth native page scrolling across 5 editorial chapters.
 *   2. Seamless light studio integration: Three.js ground (#edf0f5) melts invisibly
 *      into the page background, anchored solely by dual baked floor contact shadows.
 *   3. Asymmetrical framing: shifts camera targets per chapter so the 3D machine sits
 *      opposite the editorial copy card with zero text/model collision.
 *   4. Opt-in 360° Explore Mode: clicking "360° 自由探索" expands interactive Orbit/Pan/Zoom
 *      + 5 curated 3D spatial hotspots + concise solid/cutaway/xray toggle.
 *   5. 100% offline: reuses local vendor Three.js r147, Draco WASM, specs/machine_config.json,
 *      and js/cm700-loader.js without external CDN calls.
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
  // 1. EDITORIAL CHAPTER CHOREOGRAPHY (ASYMMETRICAL FRAMING OPPOSITE TEXT CARDS)
  // ===========================================================================
  var CHAPTER_POSES = [
    // Ch 0: Hero (Copy on LEFT -> entire CM-700MM incl. golden stairs & HMI framed cleanly on RIGHT)
    { pos: [5.45, 2.52, 8.15], target: [-1.72, 1.24, -0.45], cutaway: 0.0 },
    // Ch 1: Cutaway Reveal (Copy on LEFT -> opened 5-roll stack & full winder framed cleanly on RIGHT)
    { pos: [0.55, 1.56, 5.85], target: [-0.35, 1.12, -0.10], cutaway: 1.0 },
    // Ch 2: 5-Roll Precision Macro (Copy on RIGHT -> ALL R1..R5 + powder box framed cleanly on LEFT)
    { pos: [0.15, 1.42, 3.55], target: [0.18, 1.25, 0.05], cutaway: 1.0 },
    // Ch 3: S-Wrap Tension & Winding (Copy on LEFT -> G1..G10 & W1 framed cleanly on RIGHT)
    { pos: [1.18, 1.18, 3.65], target: [0.62, 0.72, 0.05], cutaway: 1.0 },
    // Ch 4: Turnkey Line & Safety (Copy on RIGHT -> stairs, hopper, HMI framed on LEFT)
    { pos: [-5.45, 2.70, 5.45], target: [0.85, 1.26, -0.25], cutaway: 0.0 }
  ];

  // Centered hero pose for 360° Free Exploration Mode
  var EXPLORE_DEFAULT_POSE = {
    pos: [5.65, 2.15, 6.25],
    target: [-0.18, 1.20, -0.45]
  };

  // Curated 5 buyer-focused 3D Spatial Hotspots (shown in 360° Explore Mode)
  var HOTSPOTS = [
    {
      id: 'rolls',
      num: '01',
      tag: '核心压延主机',
      title: '五辊阶梯精密压延系统 (R1–R5)',
      desc: '硬化镜面合金钢五辊阶梯排列，配备 CNC 车削轴承压盖、±0.5 °C 热油循环控温与液压弯辊挠度补偿，实现自支撑干法电极膜一次致密成膜。',
      worldPos: [-0.08, 1.56, 0.48],
      requiresCutaway: true,
      focusCam: [-0.35, 1.48, 2.95],
      focusTarget: [-0.05, 1.32, 0.05],
      metrics: [
        { k: '最大线压力', v: '860 kN' },
        { k: '膜厚精度', v: '±1.5 μm' }
      ]
    },
    {
      id: 'powder',
      num: '02',
      tag: '无溶剂供粉',
      title: '干法粉体定量供料与布料区',
      desc: 'SUS316L 抛光粉料仓配合滑轨定量布料台，将纤维化干混粉料均匀送入 R1–R2 喂料辊缝，全程 0% NMP 有机溶剂与烘箱能耗。',
      worldPos: [-0.84, 1.88, 0.36],
      requiresCutaway: true,
      focusCam: [-1.15, 2.05, 3.10],
      focusTarget: [-0.72, 1.65, 0.05],
      metrics: [
        { k: '有效幅宽', v: '700 mm' },
        { k: '溶剂排放', v: '0% NMP' }
      ]
    },
    {
      id: 'gauge',
      num: '03',
      tag: '张力与测厚',
      title: 'S 型多级导辊与激光测厚桥',
      desc: 'G1–G9 低惯量精密导辊构建多级张力解耦区间；G6–G7 构成全水平激光在线测厚基准桥，G8 浮动摆辊实时稳压防褶皱。',
      worldPos: [1.22, 0.90, 0.42],
      requiresCutaway: true,
      focusCam: [1.28, 1.16, 3.05],
      focusTarget: [1.18, 0.78, 0.05],
      metrics: [
        { k: '张力精度', v: '±0.8 N' },
        { k: '料带路径', v: '5.98 m' }
      ]
    },
    {
      id: 'winder',
      num: '04',
      tag: '精密收卷',
      title: 'C 型开口气胀收卷单元 (W1)',
      desc: '采用开放式 C 型快换结构与气胀轴设计，实现成膜极片齐边精密卷绕，支持 3"/6" 卷芯快速上下料。',
      worldPos: [1.92, 0.42, 0.48],
      requiresCutaway: false,
      focusCam: [3.25, 1.05, 2.65],
      focusTarget: [1.85, 0.42, 0.05],
      metrics: [
        { k: '最高线速', v: '60 m/min' },
        { k: '卷芯规格', v: '3" / 6" 气胀轴' }
      ]
    },
    {
      id: 'hmi',
      num: '05',
      tag: '智能人机',
      title: '悬臂式工业 SCADA 触摸终端',
      desc: '高架悬臂式人机控制箱与独立侧置操作台协同工作，实时监控五辊线速、辊缝压力、膜厚趋势与急停安全联锁。',
      worldPos: [-1.26, 1.24, 1.72],
      requiresCutaway: false,
      focusCam: [-2.85, 1.65, 3.85],
      focusTarget: [-1.15, 1.22, 1.35],
      metrics: [
        { k: '人机终端', v: 'SCADA + 副屏' },
        { k: '安全规范', v: 'ISO 联锁急停' }
      ]
    }
  ];

  // ===========================================================================
  // 2. BOOTSTRAP FROM SINGLE SOURCE OF TRUTH (specs/machine_config.json)
  // ===========================================================================
  function bootstrapWebsite() {
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
        hydrateSpecsFromConfig(cfg);
        initWebsiteUI(cfg);
        initWebsite3D();
      })
      .catch(function (err) {
        console.error('Website config load error:', err);
        var lt = $('stage-loader-text');
        if (lt) lt.textContent = '请通过本地 HTTP 服务访问以启用 3D 展示';
      });
  }

  function hydrateSpecsFromConfig(cfg) {
    var m = cfg.machine || {};
    if ($('spec-model') && m.model) $('spec-model').textContent = m.model;
    if ($('spec-width') && m.filmWidthMm) $('spec-width').textContent = m.filmWidthMm + ' mm';
    if ($('spec-force') && m.defaultForceKn) $('spec-force').textContent = m.defaultForceKn + ' kN（液压弯辊补偿）';
    if ($('spec-temp') && m.defaultTempC) $('spec-temp').textContent = '室温 – 180 °C（典型 ' + m.defaultTempC + ' °C ±0.5 °C）';
  }

  // ===========================================================================
  // 3. EDITORIAL PAGE UI (MODALS, LIGHTBOX, DOWNLOAD SPEC)
  // ===========================================================================
  function initWebsiteUI(cfg) {
    var modal = $('inquiry-modal');
    var formView = $('modal-form-view');
    var successView = $('modal-success-view');
    var form = $('inquiry-form');

    function openInquiry() {
      if (!modal) return;
      if (formView) formView.classList.remove('hidden');
      if (successView) successView.classList.add('hidden');
      modal.classList.remove('hidden');
    }
    function closeInquiry() {
      if (modal) modal.classList.add('hidden');
    }

    document.querySelectorAll('.js-open-inquiry').forEach(function (btn) {
      btn.addEventListener('click', openInquiry);
    });
    if ($('btn-close-modal')) $('btn-close-modal').addEventListener('click', closeInquiry);
    if ($('btn-done-modal')) $('btn-done-modal').addEventListener('click', closeInquiry);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeInquiry();
      });
    }
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (formView) formView.classList.add('hidden');
        if (successView) successView.classList.remove('hidden');
        form.reset();
      });
    }

    // Lightbox for Studio Renders
    var lb = $('lightbox-modal');
    var lbImg = $('lightbox-img');
    var lbCap = $('lightbox-caption');
    document.querySelectorAll('.gallery-card').forEach(function (card) {
      card.addEventListener('click', function () {
        if (!lb || !lbImg) return;
        lbImg.src = card.getAttribute('data-lightbox') || '';
        lbImg.alt = card.getAttribute('data-caption') || '';
        if (lbCap) lbCap.textContent = card.getAttribute('data-caption') || '';
        lb.classList.remove('hidden');
      });
    });
    function closeLightbox() { if (lb) lb.classList.add('hidden'); }
    if ($('btn-close-lightbox')) $('btn-close-lightbox').addEventListener('click', closeLightbox);
    if (lb) lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

    // Download JSON Spec Summary
    var dlBtn = $('btn-download-spec');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        var summary = {
          product: cfg.machine,
          calenderStack: cfg.calenderStack,
          guideRollsCount: (cfg.guideRolls || []).length,
          winderDrum: cfg.winderDrum,
          subsystems: (cfg.parts || []).map(function (p) {
            return { id: p.id, nameZh: p.zh, nameEn: p.en, specs: p.specs };
          })
        };
        var blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'CM-700MM_Technical_Specifications.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }

    // Chapter Rail Dot Navigation
    document.querySelectorAll('.rail-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        var targetId = dot.getAttribute('data-goto');
        var el = targetId ? $(targetId) : null;
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ===========================================================================
  // 4. THREE.JS SEAMLESS LIGHT-STUDIO SCENE & SCROLLYTELLING ENGINE
  // ===========================================================================
  function initWebsite3D() {
    var THREE = global.THREE;
    var host = $('web3d-host');
    var poster = $('webgl-poster');
    var loaderBadge = $('stage-loader');
    var loaderText = $('stage-loader-text');

    if (!THREE || !THREE.GLTFLoader || !THREE.DRACOLoader || !host) {
      if (loaderBadge) loaderBadge.classList.add('done');
      return;
    }

    var width = host.clientWidth || window.innerWidth;
    var height = host.clientHeight || window.innerHeight;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    } catch (e) {
      console.warn('WebGL unavailable, keeping static studio poster:', e);
      if (loaderBadge) loaderBadge.classList.add('done');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    // Seamless bright architectural studio background matching CSS --bg-studio (#edf0f5)
    var studioHex = 0xedf0f5;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(studioHex);
    scene.fog = new THREE.Fog(studioHex, 14.5, 34.0);

    var camera = new THREE.PerspectiveCamera(38, width / height, 0.08, 100);

    // High-contrast architectural softbox PMREM so brushed steel & chrome pop on light bg
    function createGalleryEnvMap() {
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x525864);

      var panels = [
        // Bright overhead studio softbox
        { pos: [0, 9, 0],     rot: [Math.PI / 2, 0, 0],  size: [16, 7],  color: 0xffffff, mult: 2.35 },
        // Warm key reflector right-front
        { pos: [10, 5, 7],    rot: [0, -Math.PI / 4, 0], size: [8, 6],   color: 0xfff8f0, mult: 2.05 },
        // Cool fill reflector left-front
        { pos: [-10, 4.5, 6], rot: [0, Math.PI / 4, 0],  size: [9, 5.5], color: 0xe2f0ff, mult: 1.65 },
        // Crisp dark studio flags to carve crisp metallic bevel highlights!
        { pos: [0, 3.5, 11],  rot: [0, Math.PI, 0],      size: [10, 3],  color: 0x1e2530, mult: 0.7 },
        { pos: [-11, 2, -4],  rot: [0, Math.PI / 2, 0],  size: [8, 4],   color: 0x262f3c, mult: 0.8 },
        // Rear rim strip
        { pos: [0, 4.5, -11], rot: [0, 0, 0],            size: [14, 5],  color: 0xdbeafe, mult: 1.45 },
        // Light ground bounce
        { pos: [0, -5, 0],    rot: [-Math.PI / 2, 0, 0], size: [24, 24], color: 0xbac2ce, mult: 1.0 }
      ];
      panels.forEach(function (ps) {
        var geo = new THREE.PlaneGeometry(ps.size[0], ps.size[1]);
        var col = new THREE.Color(ps.color).multiplyScalar(ps.mult);
        var mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
        var m = new THREE.Mesh(geo, mat);
        m.position.set(ps.pos[0], ps.pos[1], ps.pos[2]);
        m.rotation.set(ps.rot[0], ps.rot[1], ps.rot[2]);
        envScene.add(m);
      });

      var rt = pmrem.fromScene(envScene, 0.032);
      pmrem.dispose();
      return rt.texture;
    }

    scene.environment = createGalleryEnvMap();

    // Clean three-point + hemisphere studio rig
    var hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.92);
    scene.add(hemi);

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.32);
    keyLight.position.set(6.5, 9.0, 7.2);
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

    var fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.68);
    fillLight.position.set(-7.5, 5.2, 5.5);
    scene.add(fillLight);

    var rimLight = new THREE.DirectionalLight(0xf1f5f9, 0.60);
    rimLight.position.set(-2.5, 5.0, -7.5);
    scene.add(rimLight);

    var nipLight = new THREE.PointLight(0x38d8ff, 0.85, 3.2, 1.8);
    nipLight.position.set(-0.35, 1.55, 0.55);
    scene.add(nipLight);

    // Invisible seamless studio floor (receives subtle shadow + melts into #edf0f5 bg)
    var floorGeo = new THREE.CircleGeometry(30, 72);
    var floorMat = new THREE.MeshStandardMaterial({
      color: studioHex,
      roughness: 0.55,
      metalness: 0.02
    });
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.002;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Dual Baked Floor Contact Shadows (static frames + sliding cutaway enclosure)
    var csCfg = DATA.CONTACT_SHADOW;
    var csWidth = csCfg.xMax - csCfg.xMin;
    var csDepth = csCfg.zMax - csCfg.zMin;
    var csCenterX = (csCfg.xMin + csCfg.xMax) * 0.5;
    var csCenterZ = (csCfg.zMin + csCfg.zMax) * 0.5;
    var texLoader = new THREE.TextureLoader();

    var staticShadowMat = new THREE.MeshBasicMaterial({
      map: texLoader.load('assets/contact_shadow_static.png'),
      transparent: true,
      opacity: 0.90,
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
      opacity: 0.90,
      depthWrite: false
    });
    var cutawayShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(csWidth, csDepth), cutawayShadowMat);
    cutawayShadowMesh.rotation.x = -Math.PI / 2;
    cutawayShadowMesh.position.set(csCenterX, 0.0022, csCenterZ);
    cutawayShadowMesh.renderOrder = 2;
    scene.add(cutawayShadowMesh);

    // =========================================================================
    // STATE & CAMERA CONTROLLERS (SCROLLYTELLING + OPT-IN 360° ORBIT)
    // =========================================================================
    var machine = null;
    var state = {
      is360Mode: false,
      activeChapter: 0,
      lineSpeed: DATA.MACHINE_SPECS.defaultLineSpeed || 24.0,
      cutawayProgress: 0.0,
      targetCutaway: 0.0,
      viewMode360: 'solid', // solid | cutaway | xray
      showHotspots: true,
      selectedHotspotId: null,
      mouseParallaxX: 0,
      mouseParallaxY: 0,
      savedScrollY: 0
    };

    // Story camera state (smooth Cartesian lerp in scrollytelling)
    var storyCam = {
      curPos: new THREE.Vector3(CHAPTER_POSES[0].pos[0], CHAPTER_POSES[0].pos[1], CHAPTER_POSES[0].pos[2]),
      curTgt: new THREE.Vector3(CHAPTER_POSES[0].target[0], CHAPTER_POSES[0].target[1], CHAPTER_POSES[0].target[2]),
      desPos: new THREE.Vector3(CHAPTER_POSES[0].pos[0], CHAPTER_POSES[0].pos[1], CHAPTER_POSES[0].pos[2]),
      desTgt: new THREE.Vector3(CHAPTER_POSES[0].target[0], CHAPTER_POSES[0].target[1], CHAPTER_POSES[0].target[2])
    };

    // Spherical Orbit camera state (used strictly in opt-in 360° Mode)
    var orbitCam = {
      target: new THREE.Vector3(),
      desiredTarget: new THREE.Vector3(),
      theta: 0.72,
      phi: 1.42,
      radius: 7.8,
      desiredTheta: 0.72,
      desiredPhi: 1.42,
      desiredRadius: 7.8,
      tween: null
    };

    function syncOrbitFromVectors(posVec, tgtVec, immediate) {
      var off = posVec.clone().sub(tgtVec);
      var r = Math.max(1.2, off.length());
      var phi = clamp(Math.acos(clamp(off.y / r, -0.999, 0.999)), 0.14, Math.PI * 0.485);
      var theta = Math.atan2(off.x, off.z);
      orbitCam.desiredTarget.copy(tgtVec);
      orbitCam.desiredRadius = r;
      orbitCam.desiredPhi = phi;
      orbitCam.desiredTheta = theta;
      if (immediate) {
        orbitCam.target.copy(tgtVec);
        orbitCam.radius = r;
        orbitCam.phi = phi;
        orbitCam.theta = theta;
      }
    }

    function tweenOrbitTo(posArr, tgtArr, durationSec) {
      orbitCam.tween = {
        elapsed: 0,
        duration: durationSec || 0.85,
        startPos: camera.position.clone(),
        startTgt: orbitCam.target.clone(),
        endPos: new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
        endTgt: new THREE.Vector3(tgtArr[0], tgtArr[1], tgtArr[2])
      };
    }

    // Subtle pointer parallax during scrollytelling (enhances spatial depth effortlessly)
    window.addEventListener('pointermove', function (e) {
      if (state.is360Mode) return;
      state.mouseParallaxX = ((e.clientX / Math.max(1, window.innerWidth)) - 0.5) * 2.0;
      state.mouseParallaxY = ((e.clientY / Math.max(1, window.innerHeight)) - 0.5) * 2.0;
    });

    // =========================================================================
    // CONTINUOUS SCROLL CHOREOGRAPHY COMPUTATION
    // =========================================================================
    var chapterEls = [
      $('ch-hero'),
      $('ch-cutaway'),
      $('ch-rolls'),
      $('ch-web'),
      $('ch-plant')
    ];

    function sampleScrollChoreography() {
      if (state.is360Mode) return;
      var vh = window.innerHeight || 900;
      // Compute continuous chapter float index [0 .. 4] based on each chapter center vs viewport center
      var centers = chapterEls.map(function (el) {
        if (!el) return 0;
        var r = el.getBoundingClientRect();
        return r.top + r.height * 0.5;
      });
      var midY = vh * 0.5;
      var fIdx = 0.0;
      if (midY <= centers[0]) {
        fIdx = 0.0;
      } else if (midY >= centers[centers.length - 1]) {
        fIdx = centers.length - 1;
      } else {
        for (var i = 0; i < centers.length - 1; i++) {
          if (midY >= centers[i] && midY <= centers[i + 1]) {
            var span = Math.max(1, centers[i + 1] - centers[i]);
            var rawT = clamp((midY - centers[i]) / span, 0, 1);
            fIdx = i + easeInOutCubic(rawT);
            break;
          }
        }
      }

      var i0 = Math.floor(fIdx);
      var i1 = Math.min(CHAPTER_POSES.length - 1, i0 + 1);
      var frac = fIdx - i0;
      var pA = CHAPTER_POSES[i0];
      var pB = CHAPTER_POSES[i1];

      // Subtle parallax on camera position (gentler on close-ups)
      var pScale = (i0 === 2 || i0 === 3) ? 0.08 : 0.22;
      storyCam.desPos.set(
        lerp(pA.pos[0], pB.pos[0], frac) + state.mouseParallaxX * pScale,
        lerp(pA.pos[1], pB.pos[1], frac) - state.mouseParallaxY * (pScale * 0.5),
        lerp(pA.pos[2], pB.pos[2], frac)
      );
      storyCam.desTgt.set(
        lerp(pA.target[0], pB.target[0], frac),
        lerp(pA.target[1], pB.target[1], frac),
        lerp(pA.target[2], pB.target[2], frac)
      );
      state.targetCutaway = lerp(pA.cutaway, pB.cutaway, frac);

      var nearest = Math.round(fIdx);
      if (nearest !== state.activeChapter) {
        state.activeChapter = nearest;
        updateChapterIndicators(nearest);
      }
    }

    function updateChapterIndicators(idx) {
      var counter = $('rail-counter');
      if (counter) counter.textContent = '0' + (idx + 1) + ' / 0' + CHAPTER_POSES.length;
      document.querySelectorAll('.rail-dot').forEach(function (d, i) {
        d.classList.toggle('active', i === idx);
      });
      document.querySelectorAll('.nav-link[data-chapter-link]').forEach(function (a) {
        a.classList.toggle('active', Number(a.getAttribute('data-chapter-link')) === idx);
      });
    }

    // =========================================================================
    // SPEED MICRO-DEMO IN CHAPTER 2
    // =========================================================================
    document.querySelectorAll('.speed-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var spd = Number(pill.getAttribute('data-speed')) || 24;
        state.lineSpeed = spd;
        document.querySelectorAll('.speed-pill').forEach(function (p) {
          p.classList.toggle('active', p === pill);
        });
        var tp = $('live-throughput-pill');
        if (tp) tp.textContent = (spd * 0.70).toFixed(1) + ' m²/min';
      });
    });

    // =========================================================================
    // OPT-IN 360° INTERACTIVE MODE & 3D SPATIAL HOTSPOTS
    // =========================================================================
    var hotspotLayer = $('hotspot-layer');
    var hotspotCard = $('hotspot-card');
    var exploreHud = $('explore-hud');
    var hotspotEls = [];

    function buildHotspots() {
      if (!hotspotLayer) return;
      hotspotLayer.innerHTML = '';
      hotspotEls = HOTSPOTS.map(function (hs) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hotspot-pin';
        btn.setAttribute('data-hs-id', hs.id);
        btn.innerHTML = '<span class="hotspot-num">' + hs.num + '</span><span>' + hs.tag + '</span>';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          selectHotspot(hs.id);
        });
        hotspotLayer.appendChild(btn);
        return {
          spec: hs,
          el: btn,
          vec: new THREE.Vector3(hs.worldPos[0], hs.worldPos[1], hs.worldPos[2])
        };
      });
    }

    function selectHotspot(hsId) {
      var found = null;
      HOTSPOTS.forEach(function (h) { if (h.id === hsId) found = h; });
      if (!found) {
        state.selectedHotspotId = null;
        if (hotspotCard) hotspotCard.classList.add('hidden');
        hotspotEls.forEach(function (item) { item.el.classList.remove('selected'); });
        return;
      }

      state.selectedHotspotId = found.id;
      hotspotEls.forEach(function (item) {
        item.el.classList.toggle('selected', item.spec.id === found.id);
      });

      // Automatically open cutaway if the hotspot sits inside the front enclosure!
      if (found.requiresCutaway) {
        setExploreMode('cutaway');
      } else if (state.viewMode360 === 'xray') {
        setExploreMode('solid');
      }

      tweenOrbitTo(found.focusCam, found.focusTarget, 0.85);

      if (hotspotCard) {
        $('hc-index').textContent = found.num;
        $('hc-tag').textContent = found.tag;
        $('hc-title').textContent = found.title;
        $('hc-desc').textContent = found.desc;
        var mWrap = $('hc-metrics');
        mWrap.innerHTML = '';
        found.metrics.forEach(function (m) {
          var div = document.createElement('div');
          div.className = 'hc-metric-pill';
          div.innerHTML = '<span>' + m.k + '</span><strong>' + m.v + '</strong>';
          mWrap.appendChild(div);
        });
        hotspotCard.classList.remove('hidden');
      }
    }

    function updateHotspotProjections() {
      if (!state.is360Mode || !state.showHotspots) return;
      var w = renderer.domElement.clientWidth || window.innerWidth;
      var h = renderer.domElement.clientHeight || window.innerHeight;
      var cutOpen = state.cutawayProgress > 0.45 || state.viewMode360 === 'xray';

      hotspotEls.forEach(function (item) {
        var projected = item.vec.clone().project(camera);
        var inFront = projected.z < 1.0 && projected.z > -1.0;
        var sx = (projected.x * 0.5 + 0.5) * w;
        var sy = (-projected.y * 0.5 + 0.5) * h;
        var inBounds = sx > 36 && sx < w - 36 && sy > 76 && sy < h - 92;

        if (!inFront || !inBounds) {
          item.el.style.opacity = '0';
          item.el.style.pointerEvents = 'none';
          return;
        }
        item.el.style.left = sx.toFixed(1) + 'px';
        item.el.style.top = sy.toFixed(1) + 'px';
        // Dim internal roller hotspots gently when front cabinet is closed (still clickable to auto-open!)
        var isHiddenInside = item.spec.requiresCutaway && !cutOpen;
        item.el.style.opacity = isHiddenInside ? '0.52' : '1.0';
        item.el.style.pointerEvents = 'auto';
      });
    }

    function setExploreMode(mode) {
      state.viewMode360 = mode;
      if (mode === 'solid') {
        state.targetCutaway = 0.0;
        if (machine) machine.setViewMode('solid');
      } else if (mode === 'cutaway') {
        state.targetCutaway = 1.0;
        if (machine) machine.setViewMode('cutaway');
      } else if (mode === 'xray') {
        if (machine) machine.setViewMode('xray');
      }
      document.querySelectorAll('.exp-mode-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-exp-mode') === mode);
      });
    }

    function enter360Mode() {
      if (state.is360Mode) return;
      state.savedScrollY = window.scrollY;
      state.is360Mode = true;
      document.body.classList.add('mode-360');
      if (exploreHud) exploreHud.classList.remove('hidden');
      if (hotspotLayer) hotspotLayer.classList.toggle('hidden', !state.showHotspots);

      // Sync orbit smoothly from current camera pose and glide to centered showcase
      syncOrbitFromVectors(camera.position, storyCam.curTgt, true);
      tweenOrbitTo(EXPLORE_DEFAULT_POSE.pos, EXPLORE_DEFAULT_POSE.target, 0.85);
      setExploreMode(state.cutawayProgress > 0.5 ? 'cutaway' : 'solid');
      handleResize();
    }

    function exit360Mode() {
      if (!state.is360Mode) return;
      state.is360Mode = false;
      selectHotspot(null);
      document.body.classList.remove('mode-360');
      if (exploreHud) exploreHud.classList.add('hidden');
      if (hotspotLayer) hotspotLayer.classList.add('hidden');
      if (machine) machine.setViewMode('solid');
      // Sync scrollytelling current camera from orbit exit position so transition is seamless!
      storyCam.curPos.copy(camera.position);
      storyCam.curTgt.copy(orbitCam.target);
      window.scrollTo(0, state.savedScrollY);
      handleResize();
    }

    buildHotspots();

    // Bind 360° Mode Buttons
    ['btn-enter-360-nav', 'btn-enter-360-hero', 'btn-enter-360-ch4', 'btn-enter-360-banner'].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener('click', enter360Mode);
    });
    if ($('btn-exit-360')) $('btn-exit-360').addEventListener('click', exit360Mode);
    if ($('btn-close-hc')) $('btn-close-hc').addEventListener('click', function () { selectHotspot(null); });
    if ($('btn-reset-360')) {
      $('btn-reset-360').addEventListener('click', function () {
        selectHotspot(null);
        setExploreMode('solid');
        tweenOrbitTo(EXPLORE_DEFAULT_POSE.pos, EXPLORE_DEFAULT_POSE.target, 0.80);
      });
    }
    if ($('btn-toggle-hotspots')) {
      $('btn-toggle-hotspots').addEventListener('click', function () {
        state.showHotspots = !state.showHotspots;
        $('btn-toggle-hotspots').classList.toggle('active', state.showHotspots);
        $('btn-toggle-hotspots').textContent = state.showHotspots ? '热点标注：开' : '热点标注：关';
        if (hotspotLayer) hotspotLayer.classList.toggle('hidden', !state.showHotspots);
        if (!state.showHotspots) selectHotspot(null);
      });
    }
    document.querySelectorAll('.exp-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        setExploreMode(b.getAttribute('data-exp-mode'));
      });
    });

    // Orbit Drag & Wheel Controls (active ONLY in 360° Mode)
    var domEl = renderer.domElement;
    var drag = { active: false, mode: 'orbit', lastX: 0, lastY: 0 };
    domEl.addEventListener('contextmenu', function (e) { if (state.is360Mode) e.preventDefault(); });
    domEl.addEventListener('pointerdown', function (e) {
      if (!state.is360Mode || (e.button !== 0 && e.button !== 2)) return;
      orbitCam.tween = null;
      drag.active = true;
      drag.mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      domEl.setPointerCapture(e.pointerId);
    });
    domEl.addEventListener('pointermove', function (e) {
      if (!state.is360Mode || !drag.active) return;
      var dx = e.clientX - drag.lastX;
      var dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      if (drag.mode === 'orbit') {
        orbitCam.desiredTheta -= dx * 0.0062;
        orbitCam.desiredPhi = clamp(orbitCam.desiredPhi - dy * 0.0055, 0.14, Math.PI * 0.485);
      } else {
        var panSpeed = orbitCam.radius * 0.0011;
        var right = new THREE.Vector3();
        var up = new THREE.Vector3();
        camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
        orbitCam.desiredTarget.addScaledVector(right, -dx * panSpeed);
        orbitCam.desiredTarget.addScaledVector(up, dy * panSpeed);
        orbitCam.desiredTarget.y = clamp(orbitCam.desiredTarget.y, 0.2, 3.2);
      }
    });
    domEl.addEventListener('pointerup', function (e) {
      if (!drag.active) return;
      drag.active = false;
      try { domEl.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    domEl.addEventListener('wheel', function (e) {
      if (!state.is360Mode) return;
      e.preventDefault();
      orbitCam.tween = null;
      var factor = Math.pow(1.0012, e.deltaY);
      orbitCam.desiredRadius = clamp(orbitCam.desiredRadius * factor, 1.8, 15.5);
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('lightbox-modal') && !$('lightbox-modal').classList.contains('hidden')) {
          $('lightbox-modal').classList.add('hidden');
        } else if ($('inquiry-modal') && !$('inquiry-modal').classList.contains('hidden')) {
          $('inquiry-modal').classList.add('hidden');
        } else if (state.is360Mode) {
          exit360Mode();
        }
      }
    });

    // =========================================================================
    // FLOOR CONTACT SHADOW SYNC
    // =========================================================================
    function updateFloorShadows() {
      var cutP = clamp(state.cutawayProgress, 0.0, 1.0);
      var slideEase = easeInOutCubic(cutP);
      var cutAlpha = clamp(1.0 - (cutP - 0.32) / 0.58, 0.0, 1.0);
      var xrayFade = (state.is360Mode && state.viewMode360 === 'xray') ? 0.32 : 1.0;
      var baseStrength = 0.88 * xrayFade;

      staticShadowMat.opacity = baseStrength;
      staticShadowMesh.visible = baseStrength > 0.01;

      cutawayShadowMesh.position.z = csCenterZ + DATA.CUTAWAY_OFFSET_Z * slideEase;
      cutawayShadowMat.opacity = baseStrength * cutAlpha;
      cutawayShadowMesh.visible = (baseStrength * cutAlpha) > 0.01;
    }

    // =========================================================================
    // LOAD LOCAL DRACO-COMPRESSED GLB + CENTERLINE
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
            if (loaderBadge) loaderBadge.classList.add('done');
            updateFloorShadows();
          },
          function (xhr) {
            if (loaderText && xhr.total) {
              loaderText.textContent = '正在加载 3D 精密样机… ' + Math.round((xhr.loaded / xhr.total) * 100) + '%';
            }
          },
          function (err) {
            console.error('Website GLB load error:', err);
            if (loaderText) loaderText.textContent = '3D 加载失败，已切换静态影棚预览';
          }
        );
      });

    // =========================================================================
    // RESIZE & ANIMATION LOOP
    // =========================================================================
    function handleResize() {
      var w = host.clientWidth || window.innerWidth;
      var h = host.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', handleResize);

    var lastTime = performance.now();
    function tick(now) {
      requestAnimationFrame(tick);
      var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000.0));
      lastTime = now;

      if (!state.is360Mode) {
        sampleScrollChoreography();
        var damp = 1.0 - Math.exp(-6.5 * dt);
        storyCam.curPos.lerp(storyCam.desPos, damp);
        storyCam.curTgt.lerp(storyCam.desTgt, damp);
        camera.position.copy(storyCam.curPos);
        camera.lookAt(storyCam.curTgt);
      } else {
        if (orbitCam.tween) {
          var tw = orbitCam.tween;
          tw.elapsed += dt;
          var k = easeInOutCubic(tw.elapsed / tw.duration);
          var curP = tw.startPos.clone().lerp(tw.endPos, k);
          var curT = tw.startTgt.clone().lerp(tw.endTgt, k);
          syncOrbitFromVectors(curP, curT, true);
          if (tw.elapsed >= tw.duration) orbitCam.tween = null;
        } else {
          var oDamp = 1.0 - Math.exp(-9.0 * dt);
          orbitCam.target.lerp(orbitCam.desiredTarget, oDamp);
          orbitCam.theta = lerp(orbitCam.theta, orbitCam.desiredTheta, oDamp);
          orbitCam.phi = lerp(orbitCam.phi, orbitCam.desiredPhi, oDamp);
          orbitCam.radius = lerp(orbitCam.radius, orbitCam.desiredRadius, oDamp);
        }
        var sinPhi = Math.sin(orbitCam.phi);
        camera.position.set(
          orbitCam.target.x + orbitCam.radius * sinPhi * Math.sin(orbitCam.theta),
          orbitCam.target.y + orbitCam.radius * Math.cos(orbitCam.phi),
          orbitCam.target.z + orbitCam.radius * sinPhi * Math.cos(orbitCam.theta)
        );
        camera.lookAt(orbitCam.target);
      }

      // Smooth cutaway interpolation
      if (machine && Math.abs(state.cutawayProgress - state.targetCutaway) > 0.0008) {
        var cDamp = 1.0 - Math.exp(-6.5 * dt);
        state.cutawayProgress = lerp(state.cutawayProgress, state.targetCutaway, cDamp);
        if (Math.abs(state.cutawayProgress - state.targetCutaway) < 0.0015) {
          state.cutawayProgress = state.targetCutaway;
        }
        machine.setCutawayProgress(state.cutawayProgress);
      }

      if (machine) {
        machine.updateKinematics(dt, state.lineSpeed, true);
      }

      updateFloorShadows();
      renderer.render(scene, camera);
      updateHotspotProjections();
    }
    requestAnimationFrame(tick);

    // Expose debug handle for automated QA
    CM700._webDebug = {
      enter360Mode: enter360Mode,
      exit360Mode: exit360Mode,
      selectHotspot: selectHotspot,
      setExploreMode: setExploreMode
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapWebsite);
  } else {
    bootstrapWebsite();
  }
})(window);
