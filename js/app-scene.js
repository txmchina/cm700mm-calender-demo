/**
 * app-scene.js
 * Three.js WebGL interactive studio scene, procedural PMREM softbox reflections,
 * damped Orbit/Pan/Zoom camera controller, video-choreography playback, raycasting,
 * and UI binding for the CM-700MM Multi-Roll Film-Making Equipment.
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

  function bootstrapFromConfig() {
    fetch('specs/machine_config.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' loading specs/machine_config.json');
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
        initApp();
      })
      .catch(function (err) {
        console.error('Failed to load specs/machine_config.json:', err);
        var lt = $('loading-text');
        if (lt) lt.textContent = '配置加载失败：请通过本地 HTTP 服务打开本页面。';
      });
  }

  function initApp() {
    var THREE = global.THREE;
    if (!THREE || !THREE.GLTFLoader || !THREE.DRACOLoader) {
      var fb = $('webgl-fallback');
      if (fb) fb.classList.remove('hidden');
      return;
    }

    var viewport = $('viewport');
    var width = viewport.clientWidth || window.innerWidth;
    var height = viewport.clientHeight || window.innerHeight;

    // =========================================================================
    // 1. RENDERER & SCENE
    // =========================================================================
    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewport.insertBefore(renderer.domElement, viewport.firstChild);

    var scene = new THREE.Scene();
    var studioThemes = {
      studio: {
        bg: 0x8f9297,
        fog: 0x8f9297,
        floorColor: 0x9c9fa4,
        floorRoughness: 0.34,
        gridColor1: 0x767a80,
        gridColor2: 0x888c92,
        exposure: 1.08
      },
      dark: {
        bg: 0x10151d,
        fog: 0x10151d,
        floorColor: 0x161d28,
        floorRoughness: 0.38,
        gridColor1: 0x2a3b52,
        gridColor2: 0x1c2736,
        exposure: 1.18
      }
    };
    var activeTheme = 'studio';

    scene.background = new THREE.Color(studioThemes.studio.bg);
    scene.fog = new THREE.Fog(studioThemes.studio.fog, 14.0, 38.0);

    var camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);

    // =========================================================================
    // 2. PROCEDURAL STUDIO SOFTBOX ENVIRONMENT MAP (PMREM)
    // =========================================================================
    function createStudioEnvMap() {
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x55585e);

      // Soft studio dome light panels for crisp metallic reflections on brushed stainless & dark rollers
      var panelSpecs = [
        { pos: [0, 8, 0],     rot: [Math.PI / 2, 0, 0],   size: [14, 6], color: 0xffffff, mult: 2.2 },
        { pos: [9, 5, 7],     rot: [0, -Math.PI / 4, 0],  size: [8, 6],  color: 0xfff8ee, mult: 2.0 },
        { pos: [-9, 4, 6],    rot: [0, Math.PI / 4, 0],   size: [9, 5],  color: 0xe8f3ff, mult: 1.5 },
        { pos: [0, 4, -10],   rot: [0, 0, 0],             size: [12, 5], color: 0xdce8f8, mult: 1.3 },
        { pos: [0, -5, 0],    rot: [-Math.PI / 2, 0, 0],  size: [22, 22], color: 0x62656b, mult: 0.8 }
      ];
      panelSpecs.forEach(function (ps) {
        var geo = new THREE.PlaneGeometry(ps.size[0], ps.size[1]);
        var col = new THREE.Color(ps.color).multiplyScalar(ps.mult);
        var mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
        var m = new THREE.Mesh(geo, mat);
        m.position.set(ps.pos[0], ps.pos[1], ps.pos[2]);
        m.rotation.set(ps.rot[0], ps.rot[1], ps.rot[2]);
        envScene.add(m);
      });

      var rt = pmrem.fromScene(envScene, 0.035);
      pmrem.dispose();
      return rt.texture;
    }

    scene.environment = createStudioEnvMap();

    // =========================================================================
    // 3. STUDIO LIGHTS & FLOOR
    // =========================================================================
    var hemiLight = new THREE.HemisphereLight(0xf6f8fb, 0x5c6066, 0.85);
    scene.add(hemiLight);

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(6.5, 8.5, 7.2);
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

    var fillLight = new THREE.DirectionalLight(0xdcebff, 0.72);
    fillLight.position.set(-7.5, 5.2, 5.5);
    scene.add(fillLight);

    var rimLight = new THREE.DirectionalLight(0xeef5ff, 0.65);
    rimLight.position.set(-2.5, 5.0, -7.5);
    scene.add(rimLight);

    // Subtle cyan process accent point light inside the R1-R4 calender bay
    var nipLight = new THREE.PointLight(0x38d8ff, 0.9, 3.2, 1.8);
    nipLight.position.set(-0.35, 1.55, 0.55);
    scene.add(nipLight);

    // Studio seamless floor
    var floorGeo = new THREE.CircleGeometry(28, 72);
    var floorMat = new THREE.MeshStandardMaterial({
      color: studioThemes.studio.floorColor,
      roughness: studioThemes.studio.floorRoughness,
      metalness: 0.14
    });
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.002;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    var floorGrid = new THREE.GridHelper(16, 32, studioThemes.studio.gridColor1, studioThemes.studio.gridColor2);
    floorGrid.position.y = 0.0004;
    floorGrid.material.opacity = 0.18;
    floorGrid.material.transparent = true;
    scene.add(floorGrid);

    // Baked dual floor contact-shadow / AO maps (static frames + sliding cutaway front housing)
    var csCfg = DATA.CONTACT_SHADOW;
    var csWidth = csCfg.xMax - csCfg.xMin;
    var csDepth = csCfg.zMax - csCfg.zMin;
    var csCenterX = (csCfg.xMin + csCfg.xMax) * 0.5;
    var csCenterZ = (csCfg.zMin + csCfg.zMax) * 0.5;
    var texLoader = new THREE.TextureLoader();

    var staticShadowMat = new THREE.MeshBasicMaterial({
      map: texLoader.load('assets/contact_shadow_static.png'),
      transparent: true,
      opacity: 0.92,
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
      opacity: 0.92,
      depthWrite: false
    });
    var cutawayShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(csWidth, csDepth), cutawayShadowMat);
    cutawayShadowMesh.rotation.x = -Math.PI / 2;
    cutawayShadowMesh.position.set(csCenterX, 0.0022, csCenterZ);
    cutawayShadowMesh.renderOrder = 2;
    scene.add(cutawayShadowMesh);

    function updateFloorShadows() {
      var cutP = clamp(appState.cutawayProgress, 0.0, 1.0);
      var slideEase = easeInOutCubic(cutP);
      var cutAlpha = clamp(1.0 - (cutP - 0.32) / 0.58, 0.0, 1.0);
      var explodeFade = clamp(1.0 - appState.explodeAmount * 1.4, 0.0, 1.0);
      var xrayFade = (appState.viewMode === 'xray') ? 0.35 : 1.0;
      var isoFade = (machine && machine.state.isolatedPartId) ? 0.0 : 1.0;
      var baseStrength = (activeTheme === 'dark' ? 0.72 : 0.94) * explodeFade * xrayFade * isoFade;

      staticShadowMat.opacity = baseStrength;
      staticShadowMesh.visible = baseStrength > 0.01;

      cutawayShadowMesh.position.z = csCenterZ + DATA.CUTAWAY_OFFSET_Z * slideEase;
      cutawayShadowMat.opacity = baseStrength * cutAlpha;
      cutawayShadowMesh.visible = (baseStrength * cutAlpha) > 0.01;
    }

    function setTheme(themeKey) {
      activeTheme = themeKey;
      var t = studioThemes[themeKey] || studioThemes.studio;
      scene.background.setHex(t.bg);
      scene.fog.color.setHex(t.fog);
      floorMat.color.setHex(t.floorColor);
      floorMat.roughness = t.floorRoughness;
      renderer.toneMappingExposure = t.exposure;
      document.body.setAttribute('data-theme', themeKey);
      var btnTheme = $('btn-toggle-theme');
      if (btnTheme) btnTheme.textContent = (themeKey === 'studio') ? '暗场模式' : '展厅亮灰';
      if (typeof updateFloorShadows === 'function') updateFloorShadows();
    }

    // =========================================================================
    // 4. DAMPED SPHERICAL ORBIT / PAN / ZOOM CAMERA CONTROLLER
    // =========================================================================
    var camState = {
      target: new THREE.Vector3(-0.10, 1.15, -0.55),
      desiredTarget: new THREE.Vector3(-0.10, 1.15, -0.55),
      theta: 0.72,
      phi: 1.44,
      radius: 7.65,
      desiredTheta: 0.72,
      desiredPhi: 1.44,
      desiredRadius: 7.65,
      tween: null
    };

    function syncSphericalFromPos(posArr, tgtArr, immediate) {
      var p = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
      var t = new THREE.Vector3(tgtArr[0], tgtArr[1], tgtArr[2]);
      var off = p.clone().sub(t);
      var r = Math.max(0.8, off.length());
      var phi = clamp(Math.acos(clamp(off.y / r, -0.999, 0.999)), 0.12, Math.PI * 0.495);
      var theta = Math.atan2(off.x, off.z);

      camState.desiredTarget.copy(t);
      camState.desiredRadius = r;
      camState.desiredPhi = phi;
      camState.desiredTheta = theta;

      if (immediate) {
        camState.target.copy(t);
        camState.radius = r;
        camState.phi = phi;
        camState.theta = theta;
      }
    }

    function animateCameraTo(posArr, tgtArr, durationSec) {
      var startPos = camera.position.clone();
      var startTgt = camState.target.clone();
      var endPos = new THREE.Vector3(posArr[0], posArr[1], posArr[2]);
      var endTgt = new THREE.Vector3(tgtArr[0], tgtArr[1], tgtArr[2]);
      camState.tween = {
        elapsed: 0,
        duration: durationSec || 0.95,
        startPos: startPos,
        startTgt: startTgt,
        endPos: endPos,
        endTgt: endTgt
      };
    }

    function updateCamera(dt) {
      if (camState.tween) {
        var tw = camState.tween;
        tw.elapsed += dt;
        var k = easeInOutCubic(tw.elapsed / tw.duration);
        var curP = tw.startPos.clone().lerp(tw.endPos, k);
        var curT = tw.startTgt.clone().lerp(tw.endTgt, k);
        syncSphericalFromPos([curP.x, curP.y, curP.z], [curT.x, curT.y, curT.z], true);
        if (tw.elapsed >= tw.duration) {
          camState.tween = null;
        }
      } else {
        var damp = 1.0 - Math.exp(-9.0 * dt);
        camState.target.lerp(camState.desiredTarget, damp);
        camState.theta = lerp(camState.theta, camState.desiredTheta, damp);
        camState.phi = lerp(camState.phi, camState.desiredPhi, damp);
        camState.radius = lerp(camState.radius, camState.desiredRadius, damp);
      }

      var sinPhi = Math.sin(camState.phi);
      camera.position.set(
        camState.target.x + camState.radius * sinPhi * Math.sin(camState.theta),
        camState.target.y + camState.radius * Math.cos(camState.phi),
        camState.target.z + camState.radius * sinPhi * Math.cos(camState.theta)
      );
      camera.lookAt(camState.target);
    }

    // Initialize to exact hero overview angle (matches frame_01.jpg!)
    var p0 = DATA.CAMERA_PRESETS.overview;
    syncSphericalFromPos(p0.pos, p0.target, true);
    updateCamera(0.016);

    // Mouse / Touch Interaction
    var drag = { active: false, mode: 'orbit', lastX: 0, lastY: 0, moved: false };
    var domEl = renderer.domElement;

    domEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    domEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.button !== 2) return;
      camState.tween = null;
      if (appState.videoShowcasePlaying) stopVideoShowcase();
      drag.active = true;
      drag.mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.moved = false;
      domEl.setPointerCapture(e.pointerId);
    });

    domEl.addEventListener('pointermove', function (e) {
      updateHoverRaycast(e);
      if (!drag.active) return;
      var dx = e.clientX - drag.lastX;
      var dy = e.clientY - drag.lastY;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      if (drag.mode === 'orbit') {
        camState.desiredTheta -= dx * 0.0062;
        camState.desiredPhi = clamp(camState.desiredPhi - dy * 0.0055, 0.14, Math.PI * 0.49);
      } else {
        var panSpeed = camState.radius * 0.0011;
        var right = new THREE.Vector3();
        var up = new THREE.Vector3();
        camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
        camState.desiredTarget.addScaledVector(right, -dx * panSpeed);
        camState.desiredTarget.addScaledVector(up, dy * panSpeed);
        camState.desiredTarget.y = clamp(camState.desiredTarget.y, 0.1, 3.6);
      }
    });

    domEl.addEventListener('pointerup', function (e) {
      if (!drag.active) return;
      drag.active = false;
      try { domEl.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!drag.moved && e.button === 0) {
        handleCanvasClick(e);
      }
    });

    domEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      camState.tween = null;
      if (appState.videoShowcasePlaying) stopVideoShowcase();
      var factor = Math.pow(1.0012, e.deltaY);
      camState.desiredRadius = clamp(camState.desiredRadius * factor, 1.4, 18.0);
    }, { passive: false });

    // =========================================================================
    // 5. APP STATE, MACHINE LOADING & VIDEO CHOREOGRAPHY
    // =========================================================================
    var machine = null;
    var appState = {
      isPlaying: true,
      lineSpeed: DATA.MACHINE_SPECS.defaultLineSpeed,
      thicknessUm: DATA.MACHINE_SPECS.defaultThicknessUm,
      rollTempC: DATA.MACHINE_SPECS.defaultTempC,
      nipForceKn: DATA.MACHINE_SPECS.defaultForceKn,
      cutawayProgress: 0.0,
      targetCutaway: 0.0,
      explodeAmount: 0.0,
      viewMode: 'solid',
      videoShowcasePlaying: false,
      videoShowcaseT: 0.0
    };

    var raycaster = new THREE.Raycaster();
    var pointerNDC = new THREE.Vector2();
    var tooltipEl = $('hover-tooltip');
    var tooltipCat = $('tooltip-cat');
    var tooltipZh = $('tooltip-zh');
    var tooltipEn = $('tooltip-en');

    function pickPartFromEvent(e) {
      if (!machine) return null;
      var rect = domEl.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      var visibleMeshes = machine.allMeshes.filter(function (m) {
        var cur = m;
        while (cur) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      });
      var hits = raycaster.intersectObjects(visibleMeshes, false);
      if (hits.length === 0) return null;
      return hits[0].object.userData.partId || null;
    }

    function updateHoverRaycast(e) {
      if (drag.active || !machine) {
        if (tooltipEl) tooltipEl.classList.add('hidden');
        return;
      }
      var pid = pickPartFromEvent(e);
      machine.setHoveredPart(pid);
      if (pid && DATA.PARTS_BY_ID[pid]) {
        var item = DATA.PARTS_BY_ID[pid];
        domEl.style.cursor = 'pointer';
        if (tooltipEl) {
          tooltipCat.textContent = item.category === 'core' ? '核心工艺机构' : '机架与辅机系统';
          tooltipZh.textContent = item.zh;
          tooltipEn.textContent = item.en;
          tooltipEl.style.left = Math.min(window.innerWidth - 270, e.clientX + 16) + 'px';
          tooltipEl.style.top = Math.max(66, e.clientY - 12) + 'px';
          tooltipEl.classList.remove('hidden');
        }
      } else {
        domEl.style.cursor = 'grab';
        if (tooltipEl) tooltipEl.classList.add('hidden');
      }
    }

    function handleCanvasClick(e) {
      var pid = pickPartFromEvent(e);
      if (pid) {
        selectPart(pid);
      } else {
        clearSelection();
      }
    }

    // =========================================================================
    // 6. UI POPULATION & EVENT BINDINGS
    // =========================================================================
    function buildStructureTree() {
      var coreList = $('dir-core-list');
      var ancList = $('dir-ancillary-list');
      if (!coreList || !ancList) return;
      coreList.innerHTML = '';
      ancList.innerHTML = '';

      DATA.PARTS.forEach(function (part) {
        var row = document.createElement('div');
        row.className = 'tree-item';
        row.setAttribute('data-part-id', part.id);
        row.innerHTML =
          '<label class="tree-chk-wrap" title="显示/隐藏">' +
            '<input type="checkbox" class="tree-part-chk" data-part-id="' + part.id + '" checked />' +
          '</label>' +
          '<button type="button" class="tree-item-btn" data-part-id="' + part.id + '">' +
            '<span class="tree-item-zh">' + part.zh + '</span>' +
          '</button>' +
          '<button type="button" class="tree-iso-btn" data-iso-id="' + part.id + '" title="单独观察">◎</button>';

        if (part.category === 'core') coreList.appendChild(row);
        else ancList.appendChild(row);
      });

      // Bind tree events
      document.querySelectorAll('.tree-item-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pid = btn.getAttribute('data-part-id');
          selectPart(pid);
          focusOnPart(pid);
        });
      });

      document.querySelectorAll('.tree-part-chk').forEach(function (chk) {
        chk.addEventListener('change', function () {
          if (!machine) return;
          var pid = chk.getAttribute('data-part-id');
          machine.setPartHidden(pid, !chk.checked);
          refreshTreeUI();
        });
      });

      document.querySelectorAll('.tree-iso-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var pid = btn.getAttribute('data-iso-id');
          if (!machine) return;
          if (machine.state.isolatedPartId === pid) {
            machine.setIsolatedPart(null);
          } else {
            machine.setIsolatedPart(pid);
            selectPart(pid);
            focusOnPart(pid);
          }
          refreshTreeUI();
        });
      });
    }

    function refreshTreeUI() {
      if (!machine) return;
      var visibleCount = 0;
      var iso = machine.state.isolatedPartId;
      DATA.PARTS.forEach(function (p) {
        var vis = iso ? (p.id === iso) : !machine.state.hiddenParts[p.id];
        if (vis) visibleCount++;
        var row = document.querySelector('.tree-item[data-part-id="' + p.id + '"]');
        if (row) {
          row.classList.toggle('selected', machine.state.selectedPartId === p.id);
          row.classList.toggle('muted', !vis);
          var chk = row.querySelector('.tree-part-chk');
          if (chk) chk.checked = vis;
        }
      });

      var countEl = $('catalog-count');
      if (countEl) countEl.textContent = visibleCount + '/' + DATA.PARTS.length;

      var showAllBtn = $('btn-show-all-parts');
      if (showAllBtn) showAllBtn.classList.toggle('hidden', visibleCount === DATA.PARTS.length && !iso);

      var isoBanner = $('isolate-banner');
      var isoLabel = $('isolate-label');
      if (isoBanner && isoLabel) {
        if (iso && DATA.PARTS_BY_ID[iso]) {
          isoLabel.textContent = DATA.PARTS_BY_ID[iso].zh;
          isoBanner.classList.remove('hidden');
        } else {
          isoBanner.classList.add('hidden');
        }
      }
    }

    function selectPart(pid) {
      if (!machine || !DATA.PARTS_BY_ID[pid]) return;
      machine.setSelectedPart(pid);
      var p = DATA.PARTS_BY_ID[pid];
      $('detail-badge').textContent = p.category === 'core' ? '核心工艺机构' : '机架与辅机系统';
      $('detail-name-zh').textContent = p.zh;
      $('detail-name-en').textContent = p.en;
      $('detail-summary').textContent = p.summary;
      $('detail-principle').textContent = p.principle;
      $('detail-materials').textContent = p.materials;

      var specsEl = $('detail-key-specs');
      specsEl.innerHTML = '';
      (p.specs || []).forEach(function (sp) {
        var pill = document.createElement('div');
        pill.className = 'spec-pill';
        pill.innerHTML = '<span class="spec-k">' + sp.k + '</span><strong class="spec-v">' + sp.v + '</strong>';
        specsEl.appendChild(pill);
      });

      $('right-drawer').classList.remove('hidden');
      refreshTreeUI();
    }

    function clearSelection() {
      if (machine) machine.setSelectedPart(null);
      $('right-drawer').classList.add('hidden');
      refreshTreeUI();
    }

    function focusOnPart(pid) {
      var p = DATA.PARTS_BY_ID[pid];
      if (!p) return;
      // If focusing internal rollers/web, open cutaway automatically so user sees them clearly!
      if (pid === 'calender_rolls' || pid === 'guide_rollers' || pid === 'electrode_web') {
        setCutawayTarget(1.0);
      }
      if (p.focusCam && p.focusPos) {
        animateCameraTo(p.focusCam, p.focusPos, 0.9);
      }
    }

    function setCutawayTarget(val) {
      appState.targetCutaway = clamp(val, 0.0, 1.0);
      var slider = $('slider-cutaway');
      var lbl = $('val-cutaway');
      if (slider) slider.value = Math.round(appState.targetCutaway * 100);
      if (lbl) lbl.textContent = Math.round(appState.targetCutaway * 100) + '%';
      syncViewModePills();
    }

    function setViewMode(mode) {
      appState.viewMode = mode;
      if (mode === 'solid') {
        appState.targetCutaway = 0.0;
        if (machine) machine.setViewMode('solid');
      } else if (mode === 'cutaway') {
        appState.targetCutaway = 1.0;
        if (machine) machine.setViewMode('cutaway');
      } else if (mode === 'xray') {
        if (machine) machine.setViewMode('xray');
      }
      var slider = $('slider-cutaway');
      var lbl = $('val-cutaway');
      if (slider) slider.value = Math.round(appState.targetCutaway * 100);
      if (lbl) lbl.textContent = Math.round(appState.targetCutaway * 100) + '%';
      syncViewModePills();
    }

    function syncViewModePills() {
      document.querySelectorAll('.mode-btn').forEach(function (btn) {
        var m = btn.getAttribute('data-view-mode');
        var active = false;
        if (appState.viewMode === 'xray') {
          active = (m === 'xray');
        } else if (appState.targetCutaway > 0.5) {
          active = (m === 'cutaway');
        } else {
          active = (m === 'solid');
        }
        btn.classList.toggle('active', active);
      });
    }

    function applyCameraPreset(presetKey) {
      var pr = DATA.CAMERA_PRESETS[presetKey];
      if (!pr) return;
      if (appState.videoShowcasePlaying) stopVideoShowcase();
      animateCameraTo(pr.pos, pr.target, 0.95);
      if (typeof pr.cutaway === 'number') {
        if (appState.viewMode === 'xray') {
          appState.viewMode = pr.cutaway > 0.5 ? 'cutaway' : 'solid';
          if (machine) machine.setViewMode(appState.viewMode);
        }
        setCutawayTarget(pr.cutaway);
      }
      document.querySelectorAll('.preset-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-preset') === presetKey);
      });
    }

    // =========================================================================
    // 7. VIDEO-FAITHFUL 13-SECOND SHOWCASE CHOREOGRAPHY ("视频同款演示")
    // =========================================================================
    function startVideoShowcase() {
      appState.videoShowcasePlaying = true;
      appState.videoShowcaseT = 0.0;
      appState.isPlaying = true;
      appState.explodeAmount = 0.0;
      if (machine) {
        machine.setExplodeAmount(0.0);
        machine.setViewMode('solid');
      }
      var exSlider = $('slider-explode');
      if (exSlider) exSlider.value = 0;
      var exVal = $('val-explode');
      if (exVal) exVal.textContent = '0%';
      updatePlayButtons();
    }

    function stopVideoShowcase() {
      appState.videoShowcasePlaying = false;
      updatePlayButtons();
    }

    function updateVideoShowcase(dt) {
      if (!appState.videoShowcasePlaying) return;
      appState.videoShowcaseT = (appState.videoShowcaseT + dt) % 13.5;
      var t = appState.videoShowcaseT;

      var ov = DATA.CAMERA_PRESETS.overview;
      var cu = DATA.CAMERA_PRESETS.cutaway;
      var ro = DATA.CAMERA_PRESETS.rollers;

      var pos = [ov.pos[0], ov.pos[1], ov.pos[2]];
      var tgt = [ov.target[0], ov.target[1], ov.target[2]];
      var cut = 0.0;

      if (t < 2.2) {
        // Hold hero 3/4 exterior overview (0 - 2.2s)
        cut = 0.0;
      } else if (t < 4.8) {
        // Glide to front cutaway angle while sliding CM-700MM enclosure & winder shield open!
        var k1 = easeInOutCubic((t - 2.2) / 2.6);
        for (var i = 0; i < 3; i++) {
          pos[i] = lerp(ov.pos[i], cu.pos[i], k1);
          tgt[i] = lerp(ov.target[i], cu.target[i], k1);
        }
        cut = easeInOutCubic((t - 2.5) / 2.1);
      } else if (t < 10.2) {
        // Slow dolly push-in across spinning 5-roll calender stack & glowing S-wrap film web!
        var k2 = easeInOutCubic((t - 4.8) / 5.4);
        for (var j = 0; j < 3; j++) {
          pos[j] = lerp(cu.pos[j], ro.pos[j], k2);
          tgt[j] = lerp(cu.target[j], ro.target[j], k2);
        }
        cut = 1.0;
      } else {
        // Smoothly close enclosure & return to hero 3/4 exterior overview
        var k3 = easeInOutCubic((t - 10.2) / 3.0);
        for (var m = 0; m < 3; m++) {
          pos[m] = lerp(ro.pos[m], ov.pos[m], k3);
          tgt[m] = lerp(ro.target[m], ov.target[m], k3);
        }
        cut = 1.0 - easeInOutCubic((t - 10.4) / 2.2);
      }

      syncSphericalFromPos(pos, tgt, true);
      appState.cutawayProgress = cut;
      appState.targetCutaway = cut;
      if (machine) machine.setCutawayProgress(cut);
      var slider = $('slider-cutaway');
      var lbl = $('val-cutaway');
      if (slider) slider.value = Math.round(cut * 100);
      if (lbl) lbl.textContent = Math.round(cut * 100) + '%';
      syncViewModePills();
    }

    function updatePlayButtons() {
      var btnPlay = $('btn-play-pause');
      if (btnPlay) {
        btnPlay.textContent = appState.isPlaying ? '⏸ 暂停运转' : '▶ 启动运转';
        btnPlay.classList.toggle('active', appState.isPlaying);
      }
      var btnVid = $('btn-video-demo');
      if (btnVid) {
        btnVid.textContent = appState.videoShowcasePlaying ? '⏹ 停止演示' : '🎬 视频同款演示';
        btnVid.classList.toggle('active', appState.videoShowcasePlaying);
      }
    }

    function updateKPIs() {
      var spd = appState.lineSpeed;
      var kpiSpd = $('kpi-speed');
      if (kpiSpd) kpiSpd.textContent = spd.toFixed(1);
      // Compute realistic derived throughput (m²/min for 700mm width) & motor power
      var areaPerMin = spd * 0.70;
      var kpiOut = $('kpi-throughput');
      if (kpiOut) kpiOut.textContent = areaPerMin.toFixed(1);
      var kpiThick = $('kpi-thickness');
      if (kpiThick) kpiThick.textContent = appState.thicknessUm;
    }

    // Bind static UI controls
    buildStructureTree();
    updateKPIs();

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (appState.videoShowcasePlaying) stopVideoShowcase();
        setViewMode(btn.getAttribute('data-view-mode'));
      });
    });

    document.querySelectorAll('.preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyCameraPreset(btn.getAttribute('data-preset'));
      });
    });

    $('btn-play-pause').addEventListener('click', function () {
      appState.isPlaying = !appState.isPlaying;
      updatePlayButtons();
    });

    $('btn-video-demo').addEventListener('click', function () {
      if (appState.videoShowcasePlaying) stopVideoShowcase();
      else startVideoShowcase();
    });

    $('btn-reset-cam').addEventListener('click', function () {
      applyCameraPreset('overview');
    });

    $('btn-toggle-theme').addEventListener('click', function () {
      setTheme(activeTheme === 'studio' ? 'dark' : 'studio');
    });

    $('btn-toggle-left').addEventListener('click', function () {
      var lp = $('left-panel');
      lp.classList.toggle('collapsed');
    });

    $('btn-collapse-left').addEventListener('click', function () {
      $('left-panel').classList.add('collapsed');
    });

    $('btn-show-all-parts').addEventListener('click', function () {
      if (!machine) return;
      machine.showAllParts();
      refreshTreeUI();
    });

    $('btn-exit-isolate').addEventListener('click', function () {
      if (!machine) return;
      machine.setIsolatedPart(null);
      refreshTreeUI();
    });

    $('btn-close-drawer').addEventListener('click', clearSelection);

    $('btn-focus-part').addEventListener('click', function () {
      if (machine && machine.state.selectedPartId) {
        focusOnPart(machine.state.selectedPartId);
      }
    });

    $('btn-isolate-part').addEventListener('click', function () {
      if (!machine || !machine.state.selectedPartId) return;
      var pid = machine.state.selectedPartId;
      machine.setIsolatedPart(machine.state.isolatedPartId === pid ? null : pid);
      refreshTreeUI();
    });

    $('btn-hide-part').addEventListener('click', function () {
      if (!machine || !machine.state.selectedPartId) return;
      var pid = machine.state.selectedPartId;
      machine.setPartHidden(pid, true);
      clearSelection();
      refreshTreeUI();
    });

    $('slider-cutaway').addEventListener('input', function (e) {
      if (appState.videoShowcasePlaying) stopVideoShowcase();
      var v = Number(e.target.value) / 100.0;
      appState.targetCutaway = v;
      appState.cutawayProgress = v;
      if (machine) machine.setCutawayProgress(v);
      $('val-cutaway').textContent = Math.round(v * 100) + '%';
      syncViewModePills();
    });

    $('slider-explode').addEventListener('input', function (e) {
      if (appState.videoShowcasePlaying) stopVideoShowcase();
      var v = Number(e.target.value) / 100.0;
      appState.explodeAmount = v;
      if (machine) machine.setExplodeAmount(v);
      $('val-explode').textContent = Math.round(v * 100) + '%';
    });

    $('slider-speed').addEventListener('input', function (e) {
      appState.lineSpeed = Number(e.target.value);
      $('val-speed').textContent = appState.lineSpeed.toFixed(0) + ' m/min';
      updateKPIs();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        appState.isPlaying = !appState.isPlaying;
        updatePlayButtons();
      } else if (e.key === 'r' || e.key === 'R') {
        applyCameraPreset('overview');
      } else if (e.key === 'c' || e.key === 'C') {
        if (appState.videoShowcasePlaying) stopVideoShowcase();
        setCutawayTarget(appState.targetCutaway > 0.5 ? 0.0 : 1.0);
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    });

    // =========================================================================
    // 8. LOAD BLENDER GLB + WEB CENTERLINE JSON
    // =========================================================================
    var loadingOverlay = $('loading-overlay');
    var loadingText = $('loading-text');

    function finishLoad(gltf, webMeta) {
      machine = CM700.buildMachineFromGLTF(THREE, gltf, webMeta);
      scene.add(machine.root);
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      refreshTreeUI();
      updatePlayButtons();
      updateFloorShadows();
    }

    function showLoadError(err) {
      console.error('CM-700MM GLB load error:', err);
      if (loadingText) {
        loadingText.innerHTML = '模型加载失败：请通过本地 HTTP 服务打开（如 <code>python3 -m http.server</code>）以加载 <code>assets/cm700mm_calender.glb</code>。';
      }
    }

    var dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('vendor/draco/');
    var loader = new THREE.GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    fetch('assets/web_centerline.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (webMeta) {
        loader.load(
          'assets/cm700mm_calender.glb',
          function (gltf) { finishLoad(gltf, webMeta); },
          function (xhr) {
            if (loadingText && xhr.total) {
              loadingText.textContent = '正在加载 Draco 压缩 3D 模型… ' + Math.round((xhr.loaded / xhr.total) * 100) + '%';
            }
          },
          showLoadError
        );
      });

    // =========================================================================
    // 9. ANIMATION LOOP & RESIZE
    // =========================================================================
    window.addEventListener('resize', function () {
      var w = viewport.clientWidth || window.innerWidth;
      var h = viewport.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    var lastTime = performance.now();
    function tick(now) {
      requestAnimationFrame(tick);
      var dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000.0));
      lastTime = now;

      if (appState.videoShowcasePlaying) {
        updateVideoShowcase(dt);
      } else if (machine && Math.abs(appState.cutawayProgress - appState.targetCutaway) > 0.001) {
        var step = 1.0 - Math.exp(-5.5 * dt);
        appState.cutawayProgress = lerp(appState.cutawayProgress, appState.targetCutaway, step);
        if (Math.abs(appState.cutawayProgress - appState.targetCutaway) < 0.002) {
          appState.cutawayProgress = appState.targetCutaway;
        }
        machine.setCutawayProgress(appState.cutawayProgress);
      }

      if (machine) {
        machine.updateKinematics(dt, appState.lineSpeed, appState.isPlaying);
      }

      updateFloorShadows();
      updateCamera(dt);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);

    // Expose debug handle for automated verification
    CM700._debug = {
      applyCameraPreset: applyCameraPreset,
      setCutawayTarget: setCutawayTarget,
      setViewMode: setViewMode,
      selectPart: selectPart,
      setTheme: setTheme
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapFromConfig);
  } else {
    bootstrapFromConfig();
  }
})(window);
