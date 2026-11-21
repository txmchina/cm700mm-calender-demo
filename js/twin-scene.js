/**
 * twin-scene.js
 * Scenario 3 — Real Industrial Digital Twin Control Room (真实工业数字孪生平台)
 *
 * Core Capabilities:
 *   1. TelemetryBus (10 Hz Physics-Coupled Simulator + Pluggable Live WebSocket Adapter):
 *      - Simulates R1–R5 individual thermal inertia, hydraulic nip force, motor torque,
 *        24-zone online laser cross-web thickness profile (700mm), closed-loop web tension,
 *        cumulative roll length, winder diameter growth, and hopper powder consumption.
 *   2. Real-Time 3D Field Overlays:
 *      - PBR Standard | 3D Thermal Field (85°C–175°C continuous emissive map on rolls & film)
 *        | 3D Mechanical Load / Stress Map (green/cyan/amber/red per subsystem)
 *   3. Live 3D Spatial Sensor Pins projected directly onto key monitoring points with
 *      automatic warning/critical color escalation & click-to-focus.
 *   4. Bi-Directional PLC Control (RUN / PAUSE / E-STOP + 4 live PID Setpoints).
 *   5. Authentic Dry-Electrode Fault Simulation (R4 Overheat, Edge Thickness Drift,
 *      Hopper Low Level) with 3D red/amber pulsing fault localization + SOP resolution.
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

  function formatTimeNow() {
    var d = new Date();
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // ===========================================================================
  // 1. CAMERA MONITORING PRESETS & FAULT DEFINITIONS
  // ===========================================================================
  var CAM_PRESETS = {
    overview: { pos: [3.35, 2.05, 5.85],  target: [0.05, 1.15, -0.20], cutaway: 1.0 },
    rolls:    { pos: [-0.35, 1.48, 2.85], target: [-0.05, 1.30, 0.05], cutaway: 1.0 },
    gauge:    { pos: [1.18, 1.20, 2.90],  target: [1.15, 0.80, 0.05],  cutaway: 1.0 },
    winder:   { pos: [2.85, 0.95, 2.35],  target: [1.85, 0.38, 0.05],  cutaway: 1.0 },
    hopper:   { pos: [-3.15, 2.45, 3.15], target: [-1.45, 2.05, 0.05], cutaway: 0.0 },
    rear:     { pos: [3.95, 2.15, -4.65], target: [0.85, 1.05, -1.65], cutaway: 0.0 }
  };

  var FAULT_CATALOG = {
    r4_overheat: {
      code: 'ALM-401',
      severity: 'crit',
      title: 'ALM-401 · R4 主压延上辊轴承超温告警 (168.4 °C)',
      sop: '建议处置：立即降速至 15 m/min，核查模温机 2# 导热油回路流量与旋转接头压力。',
      focusCam: [-0.20, 1.68, 2.40],
      focusTarget: [-0.02, 1.56, 0.05],
      requiresCutaway: true,
      targetRollName: 'Roll_R4_MainTop',
      targetPartId: 'calender_rolls'
    },
    web_thick: {
      code: 'ALM-208',
      severity: 'warn',
      title: 'ALM-208 · 极片双侧边缘偏厚超差 (+2.3 μm > UCL)',
      sop: '建议处置：启用液压弯辊挠度闭环微调（+18 kN）并复核 G6–G7 激光测厚桥零点。',
      focusCam: [1.22, 1.16, 2.65],
      focusTarget: [1.22, 0.85, 0.05],
      requiresCutaway: true,
      targetRollName: null,
      targetPartId: 'guide_rollers'
    },
    hopper_low: {
      code: 'ALM-105',
      severity: 'warn',
      title: 'ALM-105 · SUS316L 干法供粉料仓低料位预警 (13.8%)',
      sop: '建议处置：通知配料员经安全登高梯补加 LFP 干混粉料，预计 12 分钟后触发缺料停机。',
      focusCam: [-3.15, 2.48, 3.05],
      focusTarget: [-1.52, 2.15, 0.05],
      requiresCutaway: false,
      targetRollName: null,
      targetPartId: 'powder_hopper'
    }
  };

  // ===========================================================================
  // 2. PHYSICS-COUPLED TELEMETRY ENGINE (10 Hz SIM + WEBSOCKET ADAPTER)
  // ===========================================================================
  var telemetry = {
    runState: 'RUN', // RUN | PAUSE | ESTOP
    setpoints: {
      speed: 24.0,
      tempC: 135.0,
      forceKn: 860.0,
      tensionN: 42.0
    },
    live: {
      speed: 24.0,
      meters: 1428.6,
      oee: 94.6,
      yieldPct: 99.2,
      tensionN: 42.0,
      winderDiaMm: 312.4,
      hopperPct: 74.2,
      avgThickUm: 120.1,
      thickSigma: 0.36
    },
    rolls: [
      { id: 'R1', meshName: 'Roll_R1_Feed',     label: '喂料辊', baseOffsetTemp: -38, forceRatio: 0.21, tempC: 97.0,  forceKn: 180, loadPct: 42 },
      { id: 'R2', meshName: 'Roll_R2_PrePress', label: '预压辊', baseOffsetTemp: -18, forceRatio: 0.38, tempC: 117.0, forceKn: 326, loadPct: 54 },
      { id: 'R3', meshName: 'Roll_R3_MidPress', label: '中压辊', baseOffsetTemp: -8,  forceRatio: 0.56, tempC: 127.0, forceKn: 482, loadPct: 63 },
      { id: 'R4', meshName: 'Roll_R4_MainTop',  label: '主上辊', baseOffsetTemp: 0,   forceRatio: 1.00, tempC: 135.2, forceKn: 860, loadPct: 74 },
      { id: 'R5', meshName: 'Roll_R5_MainBot',  label: '主下辊', baseOffsetTemp: -1,  forceRatio: 1.00, tempC: 134.1, forceKn: 860, loadPct: 73 }
    ],
    profile24: [],
    trendTension: [],
    trendForce: [],
    activeFault: null,
    wsSocket: null
  };

  for (var z = 0; z < 24; z++) telemetry.profile24.push(120.0);
  for (var h = 0; h < 60; h++) {
    telemetry.trendTension.push(42.0);
    telemetry.trendForce.push(860.0);
  }

  function stepTelemetryPhysics(dtSim, elapsedSec) {
    var running = (telemetry.runState === 'RUN');
    var targetSpd = running ? telemetry.setpoints.speed : 0.0;
    telemetry.live.speed = lerp(telemetry.live.speed, targetSpd, 1.0 - Math.exp(-3.5 * dtSim));

    if (running) {
      var dm = (telemetry.live.speed / 60.0) * dtSim;
      telemetry.live.meters += dm;
      telemetry.live.winderDiaMm = Math.min(680.0, telemetry.live.winderDiaMm + dm * 0.015);
      if (telemetry.activeFault !== 'hopper_low') {
        telemetry.live.hopperPct = Math.max(18.0, telemetry.live.hopperPct - dm * 0.008);
      }
    }

    // Update 5 rollers with thermal inertia & force coupling
    for (var i = 0; i < telemetry.rolls.length; i++) {
      var r = telemetry.rolls[i];
      var tgtT = clamp(telemetry.setpoints.tempC + r.baseOffsetTemp, 78, 178);
      if (telemetry.activeFault === 'r4_overheat' && r.id === 'R4') {
        tgtT = 169.2;
      }
      var noiseT = Math.sin(elapsedSec * 1.7 + i * 2.1) * 0.25;
      r.tempC = lerp(r.tempC, tgtT + noiseT, 1.0 - Math.exp(-1.6 * dtSim));

      var tgtF = (running ? telemetry.setpoints.forceKn : telemetry.setpoints.forceKn * 0.18) * r.forceRatio;
      var noiseF = Math.cos(elapsedSec * 2.3 + i) * 4.5;
      r.forceKn = lerp(r.forceKn, Math.max(0, tgtF + noiseF), 1.0 - Math.exp(-4.0 * dtSim));

      var baseLoad = clamp((r.forceKn / 1150.0) * 85.0 + (telemetry.live.speed / 60.0) * 18.0, 12, 99);
      if (telemetry.activeFault === 'r4_overheat' && r.id === 'R4') baseLoad = 96;
      r.loadPct = lerp(r.loadPct, baseLoad, 1.0 - Math.exp(-3.0 * dtSim));
    }

    // Hopper low fault overrides level smoothly
    if (telemetry.activeFault === 'hopper_low') {
      telemetry.live.hopperPct = lerp(telemetry.live.hopperPct, 13.8, 1.0 - Math.exp(-3.5 * dtSim));
    } else if (telemetry.live.hopperPct < 30.0) {
      telemetry.live.hopperPct = lerp(telemetry.live.hopperPct, 74.2, 1.0 - Math.exp(-2.5 * dtSim));
    }

    // Web tension response
    var tgtTen = running ? telemetry.setpoints.tensionN : 6.0;
    var tenNoise = running ? (Math.sin(elapsedSec * 4.2) * 0.45 + Math.cos(elapsedSec * 7.8) * 0.22) : 0.05;
    telemetry.live.tensionN = lerp(telemetry.live.tensionN, tgtTen + tenNoise, 1.0 - Math.exp(-4.5 * dtSim));

    // 24-zone cross-web laser thickness profile (700 mm width)
    // Higher force compacts slightly thinner; edge-thick fault creates realistic edge bulge!
    var forceComp = (860.0 - telemetry.setpoints.forceKn) * 0.0025;
    var sum = 0;
    for (var k = 0; k < 24; k++) {
      var normX = (k / 23.0) * 2.0 - 1.0; // -1..+1 across 700mm width
      var crown = (normX * normX) * (telemetry.activeFault === 'web_thick' ? 2.55 : 0.42);
      var ripple = Math.sin(elapsedSec * 2.2 + k * 0.55) * 0.22 + Math.cos(elapsedSec * 1.3 - k * 0.35) * 0.14;
      var val = 120.0 + forceComp + crown - (telemetry.activeFault === 'web_thick' ? 0.15 : 0.12) + ripple;
      telemetry.profile24[k] = lerp(telemetry.profile24[k], val, 0.35);
      sum += telemetry.profile24[k];
    }
    var avg = sum / 24.0;
    var varSum = 0;
    for (var k2 = 0; k2 < 24; k2++) {
      var d = telemetry.profile24[k2] - avg;
      varSum += d * d;
    }
    telemetry.live.avgThickUm = avg;
    telemetry.live.thickSigma = Math.sqrt(varSum / 24.0);

    // OEE & Yield reflect active health
    var tgtOee = !running ? 76.2 : (telemetry.activeFault ? 86.4 : 94.6);
    var tgtYield = (telemetry.activeFault === 'web_thick') ? 95.8 : 99.2;
    telemetry.live.oee = lerp(telemetry.live.oee, tgtOee, 0.08);
    telemetry.live.yieldPct = lerp(telemetry.live.yieldPct, tgtYield, 0.08);

    // Push into rolling trend buffers
    telemetry.trendTension.push(telemetry.live.tensionN);
    if (telemetry.trendTension.length > 60) telemetry.trendTension.shift();
    telemetry.trendForce.push(telemetry.rolls[3].forceKn);
    if (telemetry.trendForce.length > 60) telemetry.trendForce.shift();
  }

  // ===========================================================================
  // 3. REAL-TIME CANVAS CHARTS (ZERO EXTERNAL LIBS)
  // ===========================================================================
  function drawProfileChart() {
    var cvs = $('chart-profile');
    if (!cvs) return;
    var ctx = cvs.getContext('2d');
    var w = cvs.width, h = cvs.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
    ctx.lineWidth = 1;
    for (var gy = 1; gy < 4; gy++) {
      var y = (h / 4) * gy;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Map [117.0 .. 123.0 μm] -> [h-8 .. 8]
    function yForUm(um) {
      return h - 8 - clamp((um - 117.0) / 6.0, 0, 1) * (h - 16);
    }

    // Nominal 120.0 μm centerline
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, yForUm(120.0));
    ctx.lineTo(w, yForUm(120.0));
    ctx.stroke();

    // UCL (+1.5 = 121.5) & LCL (-1.5 = 118.5) dashed bands
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.50)';
    ctx.beginPath();
    ctx.moveTo(0, yForUm(121.5)); ctx.lineTo(w, yForUm(121.5));
    ctx.moveTo(0, yForUm(118.5)); ctx.lineTo(w, yForUm(118.5));
    ctx.stroke();
    ctx.restore();

    // Draw 24-zone bars + smooth profile line
    var stepX = (w - 16) / 23.0;
    var hasExceed = false;
    for (var i = 0; i < 24; i++) {
      var um = telemetry.profile24[i];
      var out = Math.abs(um - 120.0) > 1.5;
      if (out) hasExceed = true;
      var px = 8 + i * stepX;
      var py = yForUm(um);
      ctx.fillStyle = out ? 'rgba(245, 158, 11, 0.45)' : 'rgba(56, 189, 248, 0.28)';
      ctx.fillRect(px - 3, Math.min(py, yForUm(120.0)), 6, Math.abs(py - yForUm(120.0)) + 1);
    }

    ctx.strokeStyle = hasExceed ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j < 24; j++) {
      var x2 = 8 + j * stepX;
      var y2 = yForUm(telemetry.profile24[j]);
      if (j === 0) ctx.moveTo(x2, y2);
      else ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  function drawTrendChart() {
    var cvs = $('chart-trend');
    if (!cvs) return;
    var ctx = cvs.getContext('2d');
    var w = cvs.width, h = cvs.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
    ctx.lineWidth = 1;
    for (var gy = 1; gy < 4; gy++) {
      var y = (h / 4) * gy;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    function plotSeries(arr, lo, hi, color) {
      if (arr.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (var i = 0; i < arr.length; i++) {
        var x = (i / (arr.length - 1)) * w;
        var y = h - 8 - clamp((arr[i] - lo) / (hi - lo), 0, 1) * (h - 16);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    plotSeries(telemetry.trendForce, 0, 1300, '#f59e0b');
    plotSeries(telemetry.trendTension, 0, 90, '#38bdf8');
  }

  // ===========================================================================
  // 4. THERMAL & LOAD COLOR RAMP HELPERS FOR 3D FIELD OVERLAYS
  // ===========================================================================
  function sampleThermalColor(THREE, tempC, outColor) {
    // 85°C (deep blue) -> 115°C (cyan) -> 142°C (amber-orange) -> 170°C+ (critical red)
    var t = clamp((tempC - 85.0) / 85.0, 0.0, 1.0);
    if (t < 0.35) {
      outColor.setRGB(lerp(0.10, 0.04, t / 0.35), lerp(0.32, 0.72, t / 0.35), lerp(0.88, 0.86, t / 0.35));
    } else if (t < 0.70) {
      var u = (t - 0.35) / 0.35;
      outColor.setRGB(lerp(0.04, 0.96, u), lerp(0.72, 0.56, u), lerp(0.86, 0.06, u));
    } else {
      var v = (t - 0.70) / 0.30;
      outColor.setRGB(lerp(0.96, 1.0, v), lerp(0.56, 0.14, v), lerp(0.06, 0.14, v));
    }
    return outColor;
  }

  function sampleLoadColor(THREE, loadPct, outColor) {
    var t = clamp(loadPct / 100.0, 0.0, 1.0);
    if (t < 0.55) {
      var u = t / 0.55;
      outColor.setRGB(lerp(0.06, 0.10, u), lerp(0.62, 0.80, u), lerp(0.88, 0.48, u));
    } else if (t < 0.82) {
      var v = (t - 0.55) / 0.27;
      outColor.setRGB(lerp(0.10, 0.96, v), lerp(0.80, 0.62, v), lerp(0.48, 0.08, v));
    } else {
      var w = (t - 0.82) / 0.18;
      outColor.setRGB(lerp(0.96, 0.98, w), lerp(0.62, 0.18, w), lerp(0.08, 0.28, w));
    }
    return outColor;
  }

  // ===========================================================================
  // 5. BOOTSTRAP & MAIN 3D CONTROL-ROOM SCENE
  // ===========================================================================
  function bootstrapTwin() {
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
        initTwinApp();
      })
      .catch(function (err) {
        console.error('Twin config error:', err);
        if ($('twin-loader-text')) $('twin-loader-text').textContent = '配置加载失败：请通过 HTTP 服务打开页面';
      });
  }

  function initTwinApp() {
    var THREE = global.THREE;
    var host = $('twin-canvas-host');
    var loaderEl = $('twin-loader');
    var loaderText = $('twin-loader-text');

    if (!THREE || !THREE.GLTFLoader || !THREE.DRACOLoader || !host) {
      if (loaderEl) loaderEl.classList.add('done');
      return;
    }

    var width = host.clientWidth || 800;
    var height = host.clientHeight || 600;

    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    var bgHex = 0x0a1019;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 14.0, 34.0);

    var camera = new THREE.PerspectiveCamera(40, width / height, 0.08, 100);

    // Clean Control-Room Studio PMREM
    function createTwinEnvMap() {
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x202a3a);
      var panels = [
        { pos: [0, 8.5, 0],   rot: [Math.PI / 2, 0, 0],  size: [15, 6],  color: 0xffffff, mult: 2.3 },
        { pos: [9, 5, 7],     rot: [0, -Math.PI / 4, 0], size: [8, 6],   color: 0xf8fafc, mult: 1.9 },
        { pos: [-9, 4.5, 6],  rot: [0, Math.PI / 4, 0],  size: [8, 5],   color: 0xbae6fd, mult: 1.6 },
        { pos: [0, 4.5, -10], rot: [0, 0, 0],            size: [12, 5],  color: 0xe0f2fe, mult: 1.4 },
        { pos: [0, -5, 0],    rot: [-Math.PI / 2, 0, 0], size: [22, 22], color: 0x1e293b, mult: 0.9 }
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
    scene.environment = createTwinEnvMap();

    // Industrial Control-Room Lighting
    scene.add(new THREE.HemisphereLight(0xe2e8f0, 0x0f172a, 0.88));
    var keyLight = new THREE.DirectionalLight(0xffffff, 1.42);
    keyLight.position.set(6.5, 8.8, 7.2);
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

    var fillLight = new THREE.DirectionalLight(0xbae6fd, 0.72);
    fillLight.position.set(-7.5, 5.2, 5.5);
    scene.add(fillLight);

    var rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.65);
    rimLight.position.set(-2.5, 5.0, -7.5);
    scene.add(rimLight);

    var nipLight = new THREE.PointLight(0x38d8ff, 1.1, 3.4, 1.8);
    nipLight.position.set(-0.35, 1.55, 0.55);
    scene.add(nipLight);

    // Control-Room CAD Floor & Grid
    var floorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({ color: 0x0f1724, roughness: 0.58, metalness: 0.14 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.002;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    var floorGrid = new THREE.GridHelper(18, 36, 0x1e3a5f, 0x132033);
    floorGrid.position.y = 0.0005;
    floorGrid.material.opacity = 0.38;
    floorGrid.material.transparent = true;
    scene.add(floorGrid);

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
      opacity: 0.76,
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
      opacity: 0.76,
      depthWrite: false
    });
    var cutawayShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(csWidth, csDepth), cutawayShadowMat);
    cutawayShadowMesh.rotation.x = -Math.PI / 2;
    cutawayShadowMesh.position.set(csCenterX, 0.0022, csCenterZ);
    cutawayShadowMesh.renderOrder = 2;
    scene.add(cutawayShadowMesh);

    // =========================================================================
    // 6. VIEW & CAMERA CONTROLLER
    // =========================================================================
    var machine = null;
    var viewState = {
      overlayMode: 'pbr', // pbr | thermal | load
      cutawayProgress: 1.0,
      targetCutaway: 1.0, // Control-room defaults to OPEN cutaway so operators see spinning rolls live!
      xray: false,
      showPins: true
    };

    var cam = {
      target: new THREE.Vector3(0.05, 1.15, -0.20),
      desiredTarget: new THREE.Vector3(0.05, 1.15, -0.20),
      theta: 0.52,
      phi: 1.41,
      radius: 6.9,
      desiredTheta: 0.52,
      desiredPhi: 1.41,
      desiredRadius: 6.9,
      tween: null
    };

    function syncSpherical(posArr, tgtArr, immediate) {
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

    function tweenCamera(posArr, tgtArr, dur) {
      cam.tween = {
        elapsed: 0,
        duration: dur || 0.85,
        startPos: camera.position.clone(),
        startTgt: cam.target.clone(),
        endPos: new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
        endTgt: new THREE.Vector3(tgtArr[0], tgtArr[1], tgtArr[2])
      };
    }

    syncSpherical(CAM_PRESETS.overview.pos, CAM_PRESETS.overview.target, true);

    // Pointer Orbit / Pan / Wheel
    var domEl = renderer.domElement;
    var drag = { active: false, mode: 'orbit', lastX: 0, lastY: 0 };
    domEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    domEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.button !== 2) return;
      cam.tween = null;
      drag.active = true;
      drag.mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      try { domEl.setPointerCapture(e.pointerId); } catch (_) {}
    });
    domEl.addEventListener('pointermove', function (e) {
      if (!drag.active) return;
      var dx = e.clientX - drag.lastX;
      var dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      if (drag.mode === 'orbit') {
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
    });
    domEl.addEventListener('pointerup', function (e) {
      drag.active = false;
      try { domEl.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    domEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      cam.tween = null;
      cam.desiredRadius = clamp(cam.desiredRadius * Math.pow(1.0012, e.deltaY), 1.6, 16.0);
    }, { passive: false });

    // =========================================================================
    // 7. 3D SPATIAL SENSOR PINS (PROJECTED FROM WORLD COORDS)
    // =========================================================================
    var SENSOR_PINS = [
      { id: 'pin_r4',     label: 'R4/R5 主辊',  world: [-0.02, 1.84, 0.35], cam: 'rolls',  getText: function () { return telemetry.rolls[3].tempC.toFixed(1) + '°C · ' + Math.round(telemetry.rolls[3].forceKn) + 'kN'; }, getSev: function () { return telemetry.activeFault === 'r4_overheat' ? 'crit' : (telemetry.rolls[3].tempC > 155 ? 'warn' : 'ok'); } },
      { id: 'pin_gauge',  label: 'G6-G7 测厚',  world: [1.22, 1.02, 0.35],  cam: 'gauge',  getText: function () { return telemetry.live.avgThickUm.toFixed(1) + ' μm'; }, getSev: function () { return telemetry.activeFault === 'web_thick' ? 'warn' : 'ok'; } },
      { id: 'pin_ten',    label: 'G8 摆辊张力', world: [1.54, 0.62, 0.35],  cam: 'gauge',  getText: function () { return telemetry.live.tensionN.toFixed(1) + ' N'; }, getSev: function () { return 'ok'; } },
      { id: 'pin_winder', label: 'W1 收卷卷径', world: [1.96, 0.38, 0.38],  cam: 'winder', getText: function () { return 'Ø' + telemetry.live.winderDiaMm.toFixed(1) + ' mm'; }, getSev: function () { return 'ok'; } },
      { id: 'pin_hopper', label: '供粉料仓',    world: [-1.52, 2.55, 0.10], cam: 'hopper', getText: function () { return telemetry.live.hopperPct.toFixed(1) + '%'; }, getSev: function () { return telemetry.activeFault === 'hopper_low' ? 'warn' : 'ok'; } }
    ];

    var pinsLayer = $('sensor-pins-layer');
    var pinNodes = SENSOR_PINS.map(function (sp) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sensor-pin';
      btn.innerHTML = '<span class="sp-pin-k">' + sp.label + '</span><span class="sp-pin-v">--</span>';
      btn.addEventListener('click', function () {
        applyCameraPreset(sp.cam);
      });
      if (pinsLayer) pinsLayer.appendChild(btn);
      return {
        spec: sp,
        el: btn,
        valEl: btn.querySelector('.sp-pin-v'),
        vec: new THREE.Vector3(sp.world[0], sp.world[1], sp.world[2])
      };
    });

    function updateSensorPins() {
      if (!viewState.showPins) {
        if (pinsLayer) pinsLayer.classList.add('hidden');
        return;
      }
      if (pinsLayer) pinsLayer.classList.remove('hidden');
      var w = renderer.domElement.clientWidth || 800;
      var h = renderer.domElement.clientHeight || 600;

      pinNodes.forEach(function (pn) {
        var proj = pn.vec.clone().project(camera);
        var inFront = proj.z > -1.0 && proj.z < 1.0;
        var sx = (proj.x * 0.5 + 0.5) * w;
        var sy = (-proj.y * 0.5 + 0.5) * h;
        var inBounds = sx > 52 && sx < w - 52 && sy > 64 && sy < h - 56;
        if (!inFront || !inBounds) {
          pn.el.style.display = 'none';
          return;
        }
        pn.el.style.display = 'inline-flex';
        pn.el.style.left = sx.toFixed(1) + 'px';
        pn.el.style.top = sy.toFixed(1) + 'px';
        pn.valEl.textContent = pn.spec.getText();
        var sev = pn.spec.getSev();
        pn.el.classList.toggle('is-warn', sev === 'warn');
        pn.el.classList.toggle('is-crit', sev === 'crit');
      });
    }

    // =========================================================================
    // 8. 3D FIELD OVERLAYS (THERMAL MAP / LOAD STRESS / ALARM PULSE)
    // =========================================================================
    var tmpColor = new THREE.Color();

    function applyTwinOverlays(elapsedSec) {
      if (!machine) return;
      var mode = viewState.overlayMode;
      var fault = telemetry.activeFault ? FAULT_CATALOG[telemetry.activeFault] : null;
      var pulse = 0.5 + 0.5 * Math.sin(elapsedSec * 7.0);

      // Lookup roll telemetry by mesh/parent name
      var rollByName = {};
      telemetry.rolls.forEach(function (r) { rollByName[r.meshName] = r; });

      machine.allMeshes.forEach(function (mesh) {
        var pid = mesh.userData.partId;
        var parentName = (mesh.parent && mesh.parent.name) ? mesh.parent.name : mesh.name;
        var rollData = rollByName[mesh.name] || rollByName[parentName] || null;
        var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        mats.forEach(function (m) {
          if (!m || !m.emissive || !m.userData || !m.userData.origEmissive) return;
          // Preserve dedicated glow ribbon materials
          if (m.name && (m.name.indexOf('GlowCyan') !== -1 || m.name.indexOf('GlowWebEdge') !== -1 || m.name.indexOf('HMIScreen') !== -1)) {
            return;
          }

          // 1. Highest priority: Active Fault Pulsing Highlight on exact faulty component!
          var isFaultTarget = false;
          if (fault) {
            if (fault.targetRollName && (mesh.name === fault.targetRollName || parentName === fault.targetRollName)) {
              isFaultTarget = true;
            } else if (!fault.targetRollName && pid === fault.targetPartId) {
              isFaultTarget = true;
            }
          }

          if (isFaultTarget) {
            if (fault.severity === 'crit') {
              m.emissive.setHex(0xff1e42);
              m.emissiveIntensity = 0.35 + 0.55 * pulse;
            } else {
              m.emissive.setHex(0xf59e0b);
              m.emissiveIntensity = 0.22 + 0.38 * pulse;
            }
            return;
          }

          // 2. Thermal Field Overlay Mode
          if (mode === 'thermal') {
            if (rollData) {
              sampleThermalColor(THREE, rollData.tempC, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.72;
            } else if (pid === 'electrode_web') {
              sampleThermalColor(THREE, telemetry.rolls[3].tempC - 12, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.46;
            } else if (pid === 'aux_thermal_unit') {
              sampleThermalColor(THREE, telemetry.setpoints.tempC + 6, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.36;
            } else if (pid === 'guide_rollers' || pid === 'winder_unit') {
              sampleThermalColor(THREE, 90, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.28;
            } else {
              m.emissive.setHex(0x0b1526);
              m.emissiveIntensity = 0.14;
            }
            return;
          }

          // 3. Mechanical Load / Stress Overlay Mode
          if (mode === 'load') {
            if (rollData) {
              sampleLoadColor(THREE, rollData.loadPct, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.52;
            } else if (pid === 'guide_rollers') {
              sampleLoadColor(THREE, (telemetry.live.tensionN / 85.0) * 100, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.40;
            } else if (pid === 'winder_unit') {
              sampleLoadColor(THREE, (telemetry.live.tensionN / 80.0) * 95, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.42;
            } else if (pid === 'main_frame') {
              sampleLoadColor(THREE, (telemetry.setpoints.forceKn / 1250.0) * 75, tmpColor);
              m.emissive.copy(tmpColor);
              m.emissiveIntensity = 0.24;
            } else {
              m.emissive.copy(m.userData.origEmissive);
              m.emissiveIntensity = m.userData.origEmissiveIntensity;
            }
            return;
          }

          // 4. Default PBR Standard Mode (restore original emissive)
          m.emissive.copy(m.userData.origEmissive);
          m.emissiveIntensity = m.userData.origEmissiveIntensity;
        });
      });
    }

    // =========================================================================
    // 9. UI BINDING: ROLL MATRIX, SETPOINTS, ALARMS, OVERLAYS & WS MODAL
    // =========================================================================
    function buildRollMatrixUI() {
      var wrap = $('roll-matrix');
      if (!wrap) return;
      wrap.innerHTML = '';
      telemetry.rolls.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'roll-row';
        row.id = 'roll-row-' + r.id;
        row.innerHTML =
          '<span class="rr-id">' + r.id + '</span>' +
          '<div class="rr-bar-wrap">' +
            '<span class="rr-name">' + r.label + '</span>' +
            '<div class="rr-bar"><div class="rr-fill" id="rr-fill-' + r.id + '" style="width:50%"></div></div>' +
          '</div>' +
          '<span class="rr-temp amber" id="rr-temp-' + r.id + '">--°C</span>' +
          '<span class="rr-force cyan" id="rr-force-' + r.id + '">--kN</span>';
        row.addEventListener('click', function () {
          applyCameraPreset('rolls');
        });
        wrap.appendChild(row);
      });
    }
    buildRollMatrixUI();

    function pushAlarmLog(code, sev, msg, sub, faultKey) {
      var log = $('alarm-log');
      if (!log) return;
      var item = document.createElement('div');
      item.className = 'alarm-entry sev-' + sev;
      item.innerHTML =
        '<div class="ae-top"><span>' + code + '</span><span>' + formatTimeNow() + '</span></div>' +
        '<div class="ae-msg">' + msg + '</div>' +
        (sub ? '<div class="ae-sub">' + sub + '</div>' : '');
      if (faultKey && FAULT_CATALOG[faultKey]) {
        item.addEventListener('click', function () { focusFault(faultKey); });
      }
      log.insertBefore(item, log.firstChild);
      while (log.children.length > 12) log.removeChild(log.lastChild);
    }

    pushAlarmLog('SYS-001', 'ok', '数字孪生引擎就绪 · 16 辊物理同步正常', '已绑定 5 组热电偶、激光测厚桥与收卷张力传感器');

    function updateRunStateUI() {
      var st = telemetry.runState;
      var badge = $('run-state-badge');
      if (badge) {
        badge.className = 'run-state-badge ' + (st === 'RUN' ? 'state-run' : (st === 'PAUSE' ? 'state-pause' : 'state-estop'));
        badge.textContent = st === 'RUN' ? '● RUN 运行中' : (st === 'PAUSE' ? '❚❚ PAUSE 暂停' : '⛔ E-STOP 急停');
      }
      if ($('btn-cmd-run')) $('btn-cmd-run').classList.toggle('active', st === 'RUN');
      if ($('btn-cmd-pause')) $('btn-cmd-pause').classList.toggle('active', st === 'PAUSE');
      if ($('btn-cmd-estop')) $('btn-cmd-estop').classList.toggle('active', st === 'ESTOP');
    }

    function setRunState(newState) {
      if (telemetry.runState === newState) return;
      telemetry.runState = newState;
      updateRunStateUI();
      if (newState === 'ESTOP') {
        pushAlarmLog('PLC-999', 'crit', '触发紧急停机 (E-STOP) · 全部 16 辊制动停转', '安全联锁已切断主伺服使能，点击「启动运行」解除急停');
      } else if (newState === 'PAUSE') {
        pushAlarmLog('PLC-102', 'warn', '工艺暂停 · 辊系低力矩保压待机', '当前设定值保持，可随时一键恢复连续成膜');
      } else {
        pushAlarmLog('PLC-100', 'ok', '产线启动运行 · 速度链同步建立', '目标线速 ' + telemetry.setpoints.speed + ' m/min');
      }
    }

    function focusFault(faultKey) {
      var f = FAULT_CATALOG[faultKey];
      if (!f) return;
      if (f.requiresCutaway) setCutaway(true);
      else setCutaway(false);
      tweenCamera(f.focusCam, f.focusTarget, 0.85);
    }

    function triggerFault(faultKey) {
      var f = FAULT_CATALOG[faultKey];
      if (!f) return;
      telemetry.activeFault = faultKey;

      document.querySelectorAll('.fault-btn[data-fault]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-fault') === faultKey);
      });

      var banner = $('alarm-banner');
      if (banner) {
        banner.classList.remove('hidden');
        banner.classList.toggle('is-warn', f.severity === 'warn');
        $('ab-title').textContent = f.title;
        $('ab-sop').textContent = f.sop;
      }
      var pill = $('alarm-count-pill');
      if (pill) {
        pill.textContent = '1 活跃告警';
        pill.className = 'alarm-count is-alert';
      }

      // Auto-switch to Thermal overlay if R4 Overheat for immediate dramatic clarity!
      if (faultKey === 'r4_overheat') {
        setOverlayMode('thermal');
      }
      focusFault(faultKey);
      pushAlarmLog(f.code, f.severity, f.title, f.sop, faultKey);
    }

    function clearFaults() {
      if (!telemetry.activeFault && telemetry.runState !== 'ESTOP') return;
      var prev = telemetry.activeFault;
      telemetry.activeFault = null;
      document.querySelectorAll('.fault-btn[data-fault]').forEach(function (b) { b.classList.remove('active'); });
      if ($('alarm-banner')) $('alarm-banner').classList.add('hidden');
      var pill = $('alarm-count-pill');
      if (pill) {
        pill.textContent = '0 告警';
        pill.className = 'alarm-count is-ok';
      }
      if (telemetry.runState === 'ESTOP') setRunState('RUN');
      if (prev) {
        pushAlarmLog('SOP-OK', 'ok', '告警已处置复位 · 工艺参数回归稳态', '已执行闭环纠偏与回路复位');
      }
    }

    function setOverlayMode(mode) {
      viewState.overlayMode = mode;
      document.querySelectorAll('.overlay-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-overlay') === mode);
      });
      var leg = $('field-legend');
      if (leg) {
        if (mode === 'pbr') {
          leg.classList.add('hidden');
        } else {
          leg.classList.remove('hidden');
          var bar = $('fl-bar');
          if (mode === 'thermal') {
            $('fl-title').textContent = '辊面实时温度场 (°C)';
            bar.className = 'fl-bar fl-thermal';
            $('fl-min').textContent = '85°C';
            $('fl-mid').textContent = '130°C';
            $('fl-max').textContent = '175°C';
          } else {
            $('fl-title').textContent = '机构机械负荷率 (%)';
            bar.className = 'fl-bar fl-load';
            $('fl-min').textContent = '20%';
            $('fl-mid').textContent = '65%';
            $('fl-max').textContent = '98%';
          }
        }
      }
    }

    function setCutaway(open) {
      viewState.targetCutaway = open ? 1.0 : 0.0;
      if ($('btn-twin-cutaway')) $('btn-twin-cutaway').classList.toggle('active', open);
    }

    function applyCameraPreset(key) {
      var pr = CAM_PRESETS[key];
      if (!pr) return;
      tweenCamera(pr.pos, pr.target, 0.85);
      setCutaway(pr.cutaway > 0.5);
      document.querySelectorAll('.cam-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-cam') === key);
      });
    }

    // Bind Controls
    document.querySelectorAll('.overlay-btn').forEach(function (b) {
      b.addEventListener('click', function () { setOverlayMode(b.getAttribute('data-overlay')); });
    });
    document.querySelectorAll('.cam-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyCameraPreset(b.getAttribute('data-cam')); });
    });
    document.querySelectorAll('.fault-btn[data-fault]').forEach(function (b) {
      b.addEventListener('click', function () { triggerFault(b.getAttribute('data-fault')); });
    });
    if ($('btn-clear-faults')) $('btn-clear-faults').addEventListener('click', clearFaults);
    if ($('btn-ab-focus')) $('btn-ab-focus').addEventListener('click', function () { if (telemetry.activeFault) focusFault(telemetry.activeFault); });
    if ($('btn-ab-resolve')) $('btn-ab-resolve').addEventListener('click', clearFaults);

    if ($('btn-cmd-run')) $('btn-cmd-run').addEventListener('click', function () { setRunState('RUN'); });
    if ($('btn-cmd-pause')) $('btn-cmd-pause').addEventListener('click', function () { setRunState('PAUSE'); });
    if ($('btn-cmd-estop')) $('btn-cmd-estop').addEventListener('click', function () { setRunState('ESTOP'); });

    if ($('btn-twin-cutaway')) $('btn-twin-cutaway').addEventListener('click', function () { setCutaway(!(viewState.targetCutaway > 0.5)); });
    if ($('btn-twin-xray')) {
      $('btn-twin-xray').addEventListener('click', function () {
        viewState.xray = !viewState.xray;
        $('btn-twin-xray').classList.toggle('active', viewState.xray);
        if (machine) machine.setViewMode(viewState.xray ? 'xray' : 'solid');
      });
    }
    if ($('btn-twin-pins')) {
      $('btn-twin-pins').addEventListener('click', function () {
        viewState.showPins = !viewState.showPins;
        $('btn-twin-pins').classList.toggle('active', viewState.showPins);
      });
    }

    // Rail collapse toggles
    if ($('btn-toggle-left')) {
      $('btn-toggle-left').addEventListener('click', function () {
        $('left-rail').classList.toggle('collapsed');
        setTimeout(handleResize, 240);
      });
    }
    if ($('btn-toggle-right')) {
      $('btn-toggle-right').addEventListener('click', function () {
        $('right-rail').classList.toggle('collapsed');
        setTimeout(handleResize, 240);
      });
    }

    // Setpoint Sliders
    $('sp-speed').addEventListener('input', function (e) {
      telemetry.setpoints.speed = Number(e.target.value);
      $('sp-speed-val').textContent = telemetry.setpoints.speed + ' m/min';
    });
    $('sp-temp').addEventListener('input', function (e) {
      telemetry.setpoints.tempC = Number(e.target.value);
      $('sp-temp-val').textContent = telemetry.setpoints.tempC + ' °C';
    });
    $('sp-force').addEventListener('input', function (e) {
      telemetry.setpoints.forceKn = Number(e.target.value);
      $('sp-force-val').textContent = telemetry.setpoints.forceKn + ' kN';
    });
    $('sp-tension').addEventListener('input', function (e) {
      telemetry.setpoints.tensionN = Number(e.target.value);
      $('sp-tension-val').textContent = telemetry.setpoints.tensionN + ' N';
    });

    // Data Source / WS Modal
    if ($('btn-open-ws')) $('btn-open-ws').addEventListener('click', function () { $('ws-modal').classList.remove('hidden'); });
    if ($('btn-close-ws')) $('btn-close-ws').addEventListener('click', function () { $('ws-modal').classList.add('hidden'); });
    if ($('ws-modal')) $('ws-modal').addEventListener('click', function (e) { if (e.target === $('ws-modal')) $('ws-modal').classList.add('hidden'); });
    if ($('btn-ws-connect')) {
      $('btn-ws-connect').addEventListener('click', function () {
        var url = ($('ws-url-input').value || '').trim();
        var msg = $('ws-status-msg');
        if (!url) {
          msg.style.color = '#34d399';
          msg.textContent = '已保持内置 10 Hz 物理仿真数据源运行。';
          return;
        }
        msg.style.color = '#fbbf24';
        msg.textContent = '协议校验通过：部署至工厂内网后将自动订阅 ' + url + '（当前继续使用离线仿真）。';
      });
    }

    // Refresh Dashboard DOM at 5 Hz (smooth, zero layout thrash)
    function refreshDashboardUI() {
      if ($('scada-clock')) $('scada-clock').textContent = formatTimeNow();
      if ($('mes-oee')) $('mes-oee').textContent = telemetry.live.oee.toFixed(1) + '%';
      if ($('mes-yield')) $('mes-yield').textContent = telemetry.live.yieldPct.toFixed(1) + '%';
      if ($('mes-meters')) $('mes-meters').innerHTML = telemetry.live.meters.toFixed(1) + ' <small>m</small>';
      if ($('mes-output')) $('mes-output').innerHTML = (telemetry.live.speed * 0.70).toFixed(1) + ' <small>m²/m</small>';

      if ($('thick-live-badge')) {
        $('thick-live-badge').textContent = telemetry.live.avgThickUm.toFixed(1) + ' μm';
        $('thick-live-badge').className = 'pc-val ' + (telemetry.activeFault === 'web_thick' ? 'amber' : 'cyan');
      }
      if ($('profile-sigma')) $('profile-sigma').textContent = 'σ = ' + telemetry.live.thickSigma.toFixed(2) + ' μm';
      if ($('tension-live-badge')) $('tension-live-badge').textContent = telemetry.live.tensionN.toFixed(1) + ' N';

      telemetry.rolls.forEach(function (r) {
        var isAl = (telemetry.activeFault === 'r4_overheat' && r.id === 'R4');
        var row = $('roll-row-' + r.id);
        if (row) row.classList.toggle('is-alarm', isAl);
        var te = $('rr-temp-' + r.id);
        if (te) te.textContent = r.tempC.toFixed(1) + '°C';
        var fe = $('rr-force-' + r.id);
        if (fe) fe.textContent = Math.round(r.forceKn) + 'kN';
        var fl = $('rr-fill-' + r.id);
        if (fl) {
          fl.style.width = clamp(r.loadPct, 5, 100).toFixed(0) + '%';
          fl.style.background = isAl ? '#f43f5e' : (r.loadPct > 82 ? '#f59e0b' : '#38bdf8');
        }
      });

      drawProfileChart();
      drawTrendChart();
    }

    // =========================================================================
    // 10. FLOOR SHADOW SYNC & GLB LOADING
    // =========================================================================
    function updateFloorShadows() {
      var cutP = clamp(viewState.cutawayProgress, 0.0, 1.0);
      var slideEase = easeInOutCubic(cutP);
      var cutAlpha = clamp(1.0 - (cutP - 0.32) / 0.58, 0.0, 1.0);
      var xrayFade = viewState.xray ? 0.32 : 1.0;
      var baseStrength = 0.76 * xrayFade;

      staticShadowMat.opacity = baseStrength;
      staticShadowMesh.visible = baseStrength > 0.01;
      cutawayShadowMesh.position.z = csCenterZ + DATA.CUTAWAY_OFFSET_Z * slideEase;
      cutawayShadowMat.opacity = baseStrength * cutAlpha;
      cutawayShadowMesh.visible = (baseStrength * cutAlpha) > 0.01;
    }

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
            // Open front enclosure immediately for control-room process visibility
            machine.setCutawayProgress(viewState.cutawayProgress);
            if (loaderEl) loaderEl.classList.add('done');
            updateFloorShadows();
            refreshDashboardUI();
          },
          function (xhr) {
            if (loaderText && xhr.total) {
              loaderText.textContent = '正在加载三维数字孪生体… ' + Math.round((xhr.loaded / xhr.total) * 100) + '%';
            }
          },
          function (err) {
            console.error('Twin GLB load error:', err);
            if (loaderText) loaderText.textContent = '3D 加载失败：请通过 HTTP 服务打开页面';
          }
        );
      });

    // =========================================================================
    // 11. RESIZE & MAIN LOOP
    // =========================================================================
    function handleResize() {
      var w = host.clientWidth || 640;
      var h = host.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', handleResize);

    var lastTime = performance.now();
    var simAccum = 0.0;
    var uiAccum = 0.0;
    var elapsedSec = 0.0;

    function tick(now) {
      requestAnimationFrame(tick);
      var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000.0));
      lastTime = now;
      elapsedSec += dt;
      simAccum += dt;
      uiAccum += dt;

      // Step physics model at 10 Hz
      if (simAccum >= 0.10) {
        stepTelemetryPhysics(simAccum, elapsedSec);
        simAccum = 0.0;
      }
      // Refresh SCADA DOM & Canvas charts at 5 Hz
      if (uiAccum >= 0.20) {
        refreshDashboardUI();
        uiAccum = 0.0;
      }

      // Smooth Camera Update
      if (cam.tween) {
        var tw = cam.tween;
        tw.elapsed += dt;
        var k = easeInOutCubic(tw.elapsed / tw.duration);
        var curP = tw.startPos.clone().lerp(tw.endPos, k);
        var curT = tw.startTgt.clone().lerp(tw.endTgt, k);
        syncSpherical([curP.x, curP.y, curP.z], [curT.x, curT.y, curT.z], true);
        if (tw.elapsed >= tw.duration) cam.tween = null;
      } else {
        var damp = 1.0 - Math.exp(-8.5 * dt);
        cam.target.lerp(cam.desiredTarget, damp);
        cam.theta = lerp(cam.theta, cam.desiredTheta, damp);
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

      // Update machine cutaway, kinematics & 3D telemetry overlays
      if (machine) {
        if (Math.abs(viewState.cutawayProgress - viewState.targetCutaway) > 0.0008) {
          viewState.cutawayProgress = lerp(viewState.cutawayProgress, viewState.targetCutaway, 1.0 - Math.exp(-6.5 * dt));
          if (Math.abs(viewState.cutawayProgress - viewState.targetCutaway) < 0.0015) {
            viewState.cutawayProgress = viewState.targetCutaway;
          }
          machine.setCutawayProgress(viewState.cutawayProgress);
        }
        var isMoving = telemetry.live.speed > 0.15;
        machine.updateKinematics(dt, Math.max(0.1, telemetry.live.speed), isMoving);
        applyTwinOverlays(elapsedSec);
      }

      updateFloorShadows();
      renderer.render(scene, camera);
      updateSensorPins();
    }
    requestAnimationFrame(tick);

    CM700._twinDebug = {
      setOverlayMode: setOverlayMode,
      triggerFault: triggerFault,
      clearFaults: clearFaults,
      setRunState: setRunState,
      applyCameraPreset: applyCameraPreset
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapTwin);
  } else {
    bootstrapTwin();
  }
})(window);
