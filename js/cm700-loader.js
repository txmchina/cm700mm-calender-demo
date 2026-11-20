/**
 * cm700-loader.js
 * Loads Blender 4.3.2 exported GLB (assets/cm700mm_calender.glb) via THREE.GLTFLoader,
 * binds all 13 canonical subsystem groups, drives exact synchronized roller kinematics
 * (omega = spinDir * v / R across R1..R5, G1..G10, W1), handles video-faithful front
 * cutaway slide-open + fade, X-Ray transparency, exploded assembly, and real-time
 * glowing dry-powder feed & electrode-web process flow FX.
 */
(function (global) {
  'use strict';

  global.CM700App = global.CM700App || {};

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function makeGlowSpriteTexture(THREE) {
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(220, 252, 255, 1.0)');
    grad.addColorStop(0.32, 'rgba(56, 210, 255, 0.85)');
    grad.addColorStop(0.70, 'rgba(20, 140, 255, 0.25)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function cloneMaterialSafely(mat) {
    if (!mat) return mat;
    var c = mat.clone();
    c.userData = c.userData || {};
    c.userData.origOpacity = (typeof mat.opacity === 'number') ? mat.opacity : 1.0;
    c.userData.origTransparent = !!mat.transparent;
    c.userData.origDepthWrite = (typeof mat.depthWrite === 'boolean') ? mat.depthWrite : true;
    c.userData.origEmissive = mat.emissive ? mat.emissive.clone() : null;
    c.userData.origEmissiveIntensity = (typeof mat.emissiveIntensity === 'number') ? mat.emissiveIntensity : 0.0;
    return c;
  }

  function buildMachineFromGLTF(THREE, gltf, webMeta) {
    var DATA = global.CM700App.DATA;
    var partsById = DATA.PARTS_BY_ID;

    var root = new THREE.Group();
    root.name = 'cm700mm_machine_root';

    var partGroups = {};
    DATA.PARTS.forEach(function (p) {
      var g = new THREE.Group();
      g.name = 'part_' + p.id;
      g.userData.partId = p.id;
      g.userData.basePos = new THREE.Vector3(0, 0, 0);
      var ev = p.explodeVector || [0, 0, 0];
      g.userData.explodeVec = new THREE.Vector3(ev[0], ev[1], ev[2]);
      root.add(g);
      partGroups[p.id] = g;
    });

    var rollers = [];
    var cutawayObjs = [];
    var allMeshes = [];
    var filmGlowMats = [];

    // Collect top-level children from GLTF scene
    var sourceChildren = gltf.scene.children.slice();
    sourceChildren.forEach(function (node) {
      var ud = node.userData || {};
      var pid = ud.partId || 'main_frame';
      var role = ud.role || 'static';
      var targetGroup = partGroups[pid] || partGroups.main_frame;

      // Reparent node into canonical subsystem group
      targetGroup.add(node);

      node.userData.baseLocalPos = node.position.clone();
      node.userData.partId = pid;
      node.userData.role = role;

      // Prepare unique per-mesh materials for clean hover/highlight/X-ray/cutaway fade
      var nodeMaterials = [];
      node.traverse(function (child) {
        child.userData.partId = pid;
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (Array.isArray(child.material)) {
            child.material = child.material.map(function (m) {
              var cm = cloneMaterialSafely(m);
              nodeMaterials.push(cm);
              return cm;
            });
          } else if (child.material) {
            child.material = cloneMaterialSafely(child.material);
            nodeMaterials.push(child.material);
          }

          // Enhance crisp industrial PBR reflections & handle translucent/emissive maps
          nodeMaterials.forEach(function (m) {
            if (!m) return;
            if (typeof m.metalness === 'number' && m.metalness > 0.5) {
              m.envMapIntensity = 1.22;
            }
            if (m.name && m.name.indexOf('PowderBoxGlass') !== -1) {
              m.transparent = true;
              m.opacity = 0.20;
              m.depthWrite = false;
              m.side = THREE.DoubleSide;
              m.userData.origOpacity = 0.20;
              m.userData.origTransparent = true;
              m.userData.origDepthWrite = false;
            }
            if (m.name && (m.name.indexOf('GlowCyan') !== -1 || m.name.indexOf('GlowWebEdge') !== -1)) {
              filmGlowMats.push(m);
            }
          });

          allMeshes.push(child);
        }
      });

      if (role === 'roller') {
        rollers.push({
          obj: node,
          radius: Math.max(0.03, Number(ud.rollerRadius) || 0.08),
          spinDir: Number(ud.spinDir) || 1,
          type: ud.rollerType || 'guide',
          label: ud.rollerLabel || node.name
        });
      }

      if (role === 'cutaway_front') {
        cutawayObjs.push({
          obj: node,
          basePos: node.position.clone(),
          offsetZ: Number(ud.cutawayOffsetZ) || DATA.CUTAWAY_OFFSET_Z || 2.35,
          materials: nodeMaterials
        });
      }
    });

    // =========================================================================
    // LIVE FX 1: Dynamic Falling Dry-Electrode Powder Particles (over R1-R2 nip)
    // =========================================================================
    var glowTex = makeGlowSpriteTexture(THREE);
    var powderCount = 96;
    var powderGeo = new THREE.BufferGeometry();
    var powderPos = new Float32Array(powderCount * 3);
    var powderVel = new Float32Array(powderCount);
    var bx0 = -1.03, bx1 = -0.68, by0 = 1.56, by1 = 1.88, bzHalf = 0.30;

    for (var i = 0; i < powderCount; i++) {
      powderPos[i * 3 + 0] = bx0 + Math.random() * (bx1 - bx0);
      powderPos[i * 3 + 1] = by0 + Math.random() * (by1 - by0);
      powderPos[i * 3 + 2] = (Math.random() - 0.5) * 2.0 * bzHalf;
      powderVel[i] = 0.14 + Math.random() * 0.20;
    }
    powderGeo.setAttribute('position', new THREE.BufferAttribute(powderPos, 3));
    var powderMat = new THREE.PointsMaterial({
      size: 0.034,
      map: glowTex,
      color: new THREE.Color(0x4be4ff),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var powderPoints = new THREE.Points(powderGeo, powderMat);
    powderPoints.name = 'FX_Powder_Stream';
    powderPoints.userData.partId = 'electrode_web';
    partGroups.electrode_web.add(powderPoints);

    // =========================================================================
    // LIVE FX 2: Luminous Energy Pulses Gliding Along Exact Electrode Web Path
    // =========================================================================
    var centerline = (webMeta && webMeta.centerline) ? webMeta.centerline : [];
    var totalPathLen = centerline.length > 0 ? centerline[centerline.length - 1].s : 1.0;
    var pulseCount = 42;
    var pulseGeo = new THREE.BufferGeometry();
    var pulsePos = new Float32Array(pulseCount * 3);
    var pulseColors = new Float32Array(pulseCount * 3);
    var pulseS = new Float32Array(pulseCount);

    for (var pIdx = 0; pIdx < pulseCount; pIdx++) {
      pulseS[pIdx] = (pIdx / pulseCount) * totalPathLen;
      pulsePos[pIdx * 3 + 0] = 0;
      pulsePos[pIdx * 3 + 1] = 1;
      pulsePos[pIdx * 3 + 2] = 0.356;
    }
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
    pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));

    var pulseMat = new THREE.PointsMaterial({
      size: 0.068,
      map: glowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var pulsePoints = new THREE.Points(pulseGeo, pulseMat);
    pulsePoints.name = 'FX_Web_Energy_Pulses';
    pulsePoints.userData.partId = 'electrode_web';
    partGroups.electrode_web.add(pulsePoints);

    function sampleCenterlineAtS(sVal) {
      if (centerline.length < 2) return { x: 0, y: 1 };
      var s = ((sVal % totalPathLen) + totalPathLen) % totalPathLen;
      var lo = 0, hi = centerline.length - 1;
      while (lo + 1 < hi) {
        var mid = (lo + hi) >> 1;
        if (centerline[mid].s <= s) lo = mid;
        else hi = mid;
      }
      var a = centerline[lo], b = centerline[hi];
      var denom = Math.max(1e-6, b.s - a.s);
      var t = (s - a.s) / denom;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        frac: s / Math.max(1e-6, totalPathLen)
      };
    }

    // State caches
    var state = {
      cutawayProgress: 0.0,
      explodeAmount: 0.0,
      viewMode: 'solid', // solid | cutaway | xray
      selectedPartId: null,
      hoveredPartId: null,
      isolatedPartId: null,
      hiddenParts: {}
    };

    function applyVisualStates() {
      var isXray = (state.viewMode === 'xray');
      var cutP = clamp(state.cutawayProgress, 0.0, 1.0);
      // Smooth ease-in-out cubic for front enclosure slide
      var slideEase = cutP < 0.5 ? 4 * cutP * cutP * cutP : 1 - Math.pow(-2 * cutP + 2, 3) / 2;
      // Opacity starts fading at 35% slide and reaches 0 at 92%
      var cutAlpha = clamp(1.0 - (cutP - 0.32) / 0.58, 0.0, 1.0);

      // 1. Update partGroup visibility and explode offsets
      Object.keys(partGroups).forEach(function (pid) {
        var g = partGroups[pid];
        var isHidden = !!state.hiddenParts[pid];
        if (state.isolatedPartId) {
          isHidden = (pid !== state.isolatedPartId);
        }
        g.visible = !isHidden;

        var ev = g.userData.explodeVec;
        g.position.set(
          ev.x * state.explodeAmount,
          ev.y * state.explodeAmount,
          ev.z * state.explodeAmount
        );
      });

      // 2. Update cutaway front enclosure slide & hide when fully opened
      cutawayObjs.forEach(function (co) {
        co.obj.position.set(
          co.basePos.x,
          co.basePos.y,
          co.basePos.z + co.offsetZ * slideEase
        );
        co.obj.visible = cutAlpha > 0.015;
      });

      // 3. Apply X-ray, Cutaway fade, Hover & Selection highlight across meshes
      allMeshes.forEach(function (mesh) {
        var pid = mesh.userData.partId;
        var isSel = (state.selectedPartId && pid === state.selectedPartId);
        var isHov = (state.hoveredPartId && pid === state.hoveredPartId);

        // Check if mesh belongs to cutaway_front
        var isCutFront = false;
        for (var ci = 0; ci < cutawayObjs.length; ci++) {
          if (cutawayObjs[ci].obj === mesh || cutawayObjs[ci].obj === mesh.parent) {
            isCutFront = true;
            break;
          }
        }

        var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(function (m) {
          if (!m) return;
          var origOp = (m.userData && typeof m.userData.origOpacity === 'number') ? m.userData.origOpacity : 1.0;
          var origTrans = !!(m.userData && m.userData.origTransparent);
          var origDW = (m.userData && typeof m.userData.origDepthWrite === 'boolean') ? m.userData.origDepthWrite : true;

          var targetOp = origOp;
          var targetTrans = origTrans;
          var targetDW = origDW;

          if (isXray) {
            var isCoreHighlight = (pid === 'calender_rolls' || pid === 'guide_rollers' || pid === 'winder_unit' || pid === 'electrode_web');
            if (!isCoreHighlight && !isSel) {
              targetOp = Math.min(origOp, 0.22);
              targetTrans = true;
              targetDW = false;
            }
          }

          if (isCutFront && cutP > 0.01) {
            targetOp = Math.min(targetOp, origOp * cutAlpha);
            if (cutAlpha < 0.99) {
              targetTrans = true;
              targetDW = false;
            }
          }

          m.opacity = targetOp;
          m.transparent = targetTrans;
          m.depthWrite = targetDW;

          // Selection / Hover tint
          if (m.emissive && m.userData && m.userData.origEmissive) {
            if (isSel) {
              m.emissive.setHex(0x0c7ec8);
              m.emissiveIntensity = Math.max(m.userData.origEmissiveIntensity, 0.18);
            } else if (isHov) {
              m.emissive.setHex(0x1f9ce6);
              m.emissiveIntensity = Math.max(m.userData.origEmissiveIntensity, 0.11);
            } else {
              m.emissive.copy(m.userData.origEmissive);
              m.emissiveIntensity = m.userData.origEmissiveIntensity;
            }
          }
        });
      });
    }

    var simTime = 0.0;

    function updateKinematics(dt, lineSpeedMPerMin, isPlaying) {
      if (!isPlaying) return;
      simTime += dt;

      // Convert m/min -> m/s (boost visual clarity slightly at nominal speeds so rotation is unmistakably smooth)
      var vLinear = (lineSpeedMPerMin / 60.0) * 1.45;

      // 1. Spin all 16 rollers (R1..R5, G1..G10, W1) at exact omega = spinDir * v / R
      for (var i = 0; i < rollers.length; i++) {
        var r = rollers[i];
        r.obj.rotation.z += r.spinDir * (vLinear / r.radius) * dt;
      }

      // 2. Animate falling dry-powder granules into R1-R2 nip
      var pArr = powderGeo.attributes.position.array;
      var fallScale = clamp(lineSpeedMPerMin / 24.0, 0.25, 2.5);
      for (var k = 0; k < powderCount; k++) {
        var y = pArr[k * 3 + 1] - powderVel[k] * fallScale * dt;
        // Subtle inward funnel drift toward R1-R2 nip (X = -0.84)
        var x = pArr[k * 3 + 0];
        x += (-0.84 - x) * 0.45 * dt;
        if (y < by0) {
          y = by1 - Math.random() * 0.03;
          x = bx0 + Math.random() * (bx1 - bx0);
        }
        pArr[k * 3 + 0] = x;
        pArr[k * 3 + 1] = y;
      }
      powderGeo.attributes.position.needsUpdate = true;

      // 3. Animate luminous cyan-to-white process pulses gliding along exact film web path
      if (centerline.length >= 2) {
        var posAttr = pulseGeo.attributes.position.array;
        var colAttr = pulseGeo.attributes.color.array;
        for (var j = 0; j < pulseCount; j++) {
          pulseS[j] = (pulseS[j] + vLinear * dt) % totalPathLen;
          var pt = sampleCenterlineAtS(pulseS[j]);
          // Alternate slightly between front edge (+0.358) and slightly inset (+0.348)
          posAttr[j * 3 + 0] = pt.x;
          posAttr[j * 3 + 1] = pt.y;
          posAttr[j * 3 + 2] = 0.358;

          // Color transitions from vivid cyan in calendering zone -> crisp cool-white in winding zone
          var wMix = clamp((pt.frac - 0.35) / 0.35, 0.0, 1.0);
          var shimmer = 0.72 + 0.28 * Math.sin(simTime * 5.0 + j * 0.9);
          colAttr[j * 3 + 0] = (0.18 + 0.78 * wMix) * shimmer;
          colAttr[j * 3 + 1] = (0.82 + 0.16 * wMix) * shimmer;
          colAttr[j * 3 + 2] = 1.0 * shimmer;
        }
        pulseGeo.attributes.position.needsUpdate = true;
        pulseGeo.attributes.color.needsUpdate = true;
      }

      // Subtle breathing pulse on static glowing edge material
      var glowPulse = 0.85 + 0.20 * Math.sin(simTime * 3.2);
      for (var gIdx = 0; gIdx < filmGlowMats.length; gIdx++) {
        var gm = filmGlowMats[gIdx];
        if (gm && typeof gm.emissiveIntensity === 'number') {
          gm.emissiveIntensity = Math.max(1.0, (gm.userData.origEmissiveIntensity || 2.0) * glowPulse);
        }
      }
    }

    // Initialize pulse positions once at t=0
    updateKinematics(0.016, 24.0, true);
    applyVisualStates();

    return {
      root: root,
      partGroups: partGroups,
      allMeshes: allMeshes,
      rollers: rollers,
      cutawayObjs: cutawayObjs,
      state: state,
      setCutawayProgress: function (p) {
        state.cutawayProgress = clamp(p, 0.0, 1.0);
        applyVisualStates();
      },
      setExplodeAmount: function (e) {
        state.explodeAmount = clamp(e, 0.0, 1.0);
        applyVisualStates();
      },
      setViewMode: function (mode) {
        state.viewMode = mode;
        applyVisualStates();
      },
      setSelectedPart: function (pid) {
        state.selectedPartId = pid || null;
        applyVisualStates();
      },
      setHoveredPart: function (pid) {
        if (state.hoveredPartId === (pid || null)) return;
        state.hoveredPartId = pid || null;
        applyVisualStates();
      },
      setIsolatedPart: function (pid) {
        state.isolatedPartId = pid || null;
        applyVisualStates();
      },
      setPartHidden: function (pid, hidden) {
        state.hiddenParts[pid] = !!hidden;
        applyVisualStates();
      },
      showAllParts: function () {
        state.isolatedPartId = null;
        state.hiddenParts = {};
        applyVisualStates();
      },
      updateKinematics: updateKinematics,
      applyVisualStates: applyVisualStates
    };
  }

  global.CM700App.buildMachineFromGLTF = buildMachineFromGLTF;
})(window);
