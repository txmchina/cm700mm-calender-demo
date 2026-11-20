"""
cm700_core_rolls.py
Core mechanical assemblies of the CM-700MM Multi-Roll Film-Making Equipment:
  - 5-Roll Precision Calendering Stack (R1..R5) with stepped journals,
    beveled outer rings, recessed bearing covers, and radial socket-head cap bolts
  - 2 Upper Structural Hydraulic Tie-Rods / Cross-Beams
  - 10-Roller S-Wrap Tension & Inspection Path (G1..G10) + Recoiler Winding Drum (W1)
  - Continuous Mathematically Tangent 700mm Dry-Electrode Film Web + Luminous Process Edge
  - Translucent Dry-Powder Feed Chute & Suspended Powder Granules over the R1-R2 Nip
"""

import math
import bmesh
from cm700_lib import (
    load_machine_config,
    finish_bmesh_object,
    add_box_three,
    add_cylinder_three,
    add_lathe_z_three,
    add_sphere_three,
    compute_web_centerline,
    add_web_ribbon_three,
)


# =============================================================================
# MASTER ROLLER LAYOUT LOADED FROM SINGLE SOURCE OF TRUTH (specs/machine_config.json)
# =============================================================================

_CFG = load_machine_config()
_MACH = _CFG["machine"]
ROLL_BARREL_HALF_Z = float(_MACH["rollBarrelHalfZ"])
WEB_HALF_Z = float(_MACH["webHalfZ"])
NIP_GAP = float(_MACH["nipGap"])


def _compute_calender_layout(cfg):
    """Compute exact tangent-spaced centers for the 5 calendering rolls R1..R5 from JSON config."""
    cs = cfg["calenderStack"]
    radii = cs["radii"]
    ang = cs["anglesDeg"]
    bolts = int(cs.get("bolts", 4))

    r4_r = float(radii["R4"])
    r5_r = float(radii["R5"])
    r3_r = float(radii["R3"])
    r2_r = float(radii["R2"])
    r1_r = float(radii["R1"])

    r4_x, r4_y = float(cs["r4Center"][0]), float(cs["r4Center"][1])
    r5_x = r4_x
    r5_y = r4_y - (r4_r + r5_r + NIP_GAP)

    d34 = r3_r + r4_r + NIP_GAP
    ang34 = math.radians(float(ang["r34"]))
    r3_x = r4_x + d34 * math.cos(ang34)
    r3_y = r4_y + d34 * math.sin(ang34)

    d23 = r2_r + r3_r + NIP_GAP
    ang23 = math.radians(float(ang["r23"]))
    r2_x = r3_x + d23 * math.cos(ang23)
    r2_y = r3_y + d23 * math.sin(ang23)

    d12 = r1_r + r2_r + NIP_GAP
    ang12 = math.radians(float(ang["r12"]))
    r1_x = r2_x + d12 * math.cos(ang12)
    r1_y = r2_y + d12 * math.sin(ang12)

    return [
        {"name": "Roll_R1_Feed",     "label": "R1", "x": r1_x, "y": r1_y, "r": r1_r, "spin": -1, "bolts": bolts},
        {"name": "Roll_R2_PrePress", "label": "R2", "x": r2_x, "y": r2_y, "r": r2_r, "spin": +1, "bolts": bolts},
        {"name": "Roll_R3_MidPress", "label": "R3", "x": r3_x, "y": r3_y, "r": r3_r, "spin": -1, "bolts": bolts},
        {"name": "Roll_R4_MainTop",  "label": "R4", "x": r4_x, "y": r4_y, "r": r4_r, "spin": +1, "bolts": bolts},
        {"name": "Roll_R5_MainBot",  "label": "R5", "x": r5_x, "y": r5_y, "r": r5_r, "spin": -1, "bolts": bolts},
    ]


CALENDER_ROLLS = _compute_calender_layout(_CFG)
GUIDE_ROLLS = _CFG["guideRolls"]
WINDER_DRUM = _CFG["winderDrum"]
TIE_RODS = _CFG["tieRods"]


def _build_single_calender_roll(spec, col, mats):
    """
    Build one high-precision calendering roll centered at its OWN origin (cx, cy, 0)
    so Three.js can spin obj.rotation.z cleanly around its shaft axis!
    Material indices:
      0 = roller_barrel (dark polished hardened steel)
      1 = machined_bearing (silver chamfered outer end flange & recessed cover)
      2 = chrome (stepped central drive/support journal shaft)
      3 = dark_steel (recessed annular seal ring & socket-head cap bolts)
    """
    r = spec["r"]
    hz = ROLL_BARREL_HALF_Z
    cx, cy = spec["x"], spec["y"]

    bm = bmesh.new()

    # 1. Dark hardened alloy steel cylindrical roll barrel (centered at local 0,0,0)
    add_cylinder_three(bm, 0.0, 0.0, 0.0, r, hz * 2.0, axis='Z', segs=64, cap_ends=True, bevel=0.008, mat_index=0)

    # 2. Front (+Z) & Rear (-Z) detailed multi-stepped bearing end-plate assemblies
    for side in (+1.0, -1.0):
        z0 = side * hz
        # Outer chamfered silver rim ring (proud of barrel)
        profile_outer = [
            (r * 0.96, z0),
            (r * 0.97, z0 + side * 0.014),
            (r * 0.92, z0 + side * 0.026),
            (r * 0.85, z0 + side * 0.026),
            (r * 0.83, z0 + side * 0.012),
            (r * 0.50, z0 + side * 0.012),
            (r * 0.48, z0 + side * 0.032),
            (r * 0.43, z0 + side * 0.032),
            (r * 0.43, z0),
        ]
        if side < 0:
            profile_outer = list(reversed(profile_outer))
        add_lathe_z_three(bm, profile_outer, 0.0, 0.0, 0.0, segs=56, mat_index=1)

        # Recessed dark seal gap between inner collar and journal shaft
        add_cylinder_three(bm, 0.0, 0.0, z0 + side * 0.016, r * 0.42, 0.024, axis='Z', segs=40, mat_index=3)

        # Stepped precision chrome/steel journal shaft protruding outward
        shaft_r1 = r * 0.37
        shaft_r2 = r * 0.32
        shaft_r3 = r * 0.27
        l1 = 0.045 + r * 0.16
        l2 = 0.040 + r * 0.14
        l3 = 0.035 + r * 0.10
        z_s = z0 + side * 0.022
        add_cylinder_three(bm, 0.0, 0.0, z_s + side * (l1 * 0.5), shaft_r1, l1, axis='Z', segs=40, bevel=0.004, mat_index=2)
        add_cylinder_three(bm, 0.0, 0.0, z_s + side * (l1 + l2 * 0.5), shaft_r2, l2, axis='Z', segs=36, bevel=0.004, mat_index=1)
        add_cylinder_three(bm, 0.0, 0.0, z_s + side * (l1 + l2 + l3 * 0.5), shaft_r3, l3, axis='Z', segs=36, bevel=0.005, mat_index=2)

        # Radial socket-head cap bolts on the bearing flange face (4 bolts matching 4K crop_rollers.jpg)
        n_bolts = spec["bolts"]
        bolt_ring_r = r * 0.72
        bolt_r = max(0.008, r * 0.052)
        for bi in range(n_bolts):
            ang = math.radians(45.0 + bi * (360.0 / n_bolts))
            bx = bolt_ring_r * math.cos(ang)
            by = bolt_ring_r * math.sin(ang)
            # Counterbore ring + bolt head
            add_cylinder_three(bm, bx, by, z0 + side * 0.020, bolt_r, 0.018, axis='Z', segs=12, mat_index=3)
            # Small outer alignment pin/key notch at 0/90/180/270
            ang2 = math.radians(bi * (360.0 / n_bolts))
            px = (r * 0.89) * math.cos(ang2)
            py = (r * 0.89) * math.sin(ang2)
            add_cylinder_three(bm, px, py, z0 + side * 0.027, bolt_r * 0.55, 0.008, axis='Z', segs=10, mat_index=3)

    roll_mats = [mats["roller_barrel"], mats["machined_bearing"], mats["chrome"], mats["dark_steel"]]
    obj = finish_bmesh_object(
        spec["name"],
        bm,
        col,
        roll_mats,
        part_id="calender_rolls",
        role="roller",
        extras={
            "rollerLabel": spec["label"],
            "rollerRadius": float(r),
            "spinDir": int(spec["spin"]),
            "centerX": float(cx),
            "centerY": float(cy),
            "rollerType": "calender",
        },
        smooth=True,
        location_three=(cx, cy, 0.0),
        uv_mode="radial",
        radial_radius=r,
    )
    return obj


def _build_single_guide_or_winder_roll(spec, col, mats, is_winder=False):
    """
    Build one guide/tension roller or the winding drum centered at (cx, cy, 0)
    so Three.js spins it cleanly around its Z shaft axis!
    """
    r = spec["r"]
    cx, cy = spec["x"], spec["y"]
    hz = ROLL_BARREL_HALF_Z * (0.94 if not is_winder else 0.90)

    bm = bmesh.new()

    if is_winder:
        # Wound carbon-black electrode coil + inner steel core + chrome winding shaft
        add_cylinder_three(bm, 0.0, 0.0, 0.0, r, WEB_HALF_Z * 2.02, axis='Z', segs=56, bevel=0.008, mat_index=3)
        # Inner machined steel core protruding past film edges
        add_cylinder_three(bm, 0.0, 0.0, 0.0, r * 0.42, hz * 2.0 + 0.06, axis='Z', segs=36, bevel=0.005, mat_index=1)
        # Chrome expanding air-shaft ends
        add_cylinder_three(bm, 0.0, 0.0, 0.0, r * 0.25, hz * 2.0 + 0.20, axis='Z', segs=28, bevel=0.004, mat_index=2)
    else:
        # Dark satin roller body
        add_cylinder_three(bm, 0.0, 0.0, 0.0, r, hz * 2.0, axis='Z', segs=40, bevel=0.005, mat_index=0)
        # Bright machined aluminum end caps & stepped chrome journal stubs
        for side in (+1.0, -1.0):
            z0 = side * hz
            add_cylinder_three(bm, 0.0, 0.0, z0 + side * 0.012, r * 0.88, 0.024, axis='Z', segs=32, bevel=0.003, mat_index=1)
            add_cylinder_three(bm, 0.0, 0.0, z0 + side * 0.048, r * 0.52, 0.056, axis='Z', segs=28, bevel=0.003, mat_index=2)
            # Subtle radial mark pin so rotation is visually crisp in 3D view
            add_cylinder_three(bm, r * 0.68, 0.0, z0 + side * 0.025, r * 0.09, 0.006, axis='Z', segs=10, mat_index=3)

    roll_mats = [mats["guide_roller"], mats["bright_steel"], mats["chrome"], mats["electrode_film"]]
    obj = finish_bmesh_object(
        spec["name"],
        bm,
        col,
        roll_mats,
        part_id=spec["partId"],
        role="roller",
        extras={
            "rollerRadius": float(r),
            "spinDir": int(spec["spin"]),
            "centerX": float(cx),
            "centerY": float(cy),
            "rollerType": "winder" if is_winder else "guide",
        },
        smooth=True,
        location_three=(cx, cy, 0.0),
        uv_mode="radial",
        radial_radius=r,
    )
    return obj


def build_tie_rods(col, mats):
    """Build the 2 heavy dark upper horizontal structural tie-rods with front & rear flanges."""
    bm = bmesh.new()
    for rod in TIE_RODS:
        x, y, r = rod["x"], rod["y"], rod["r"]
        # Main bar spanning from rear frame (Z=-0.46) to front frame face (Z=+0.50)
        add_cylinder_three(bm, x, y, 0.02, r, 0.98, axis='Z', segs=36, bevel=0.004, mat_index=0)
        # Rear mounting flange collar at Z = -0.45
        add_cylinder_three(bm, x, y, -0.44, r * 1.65, 0.055, axis='Z', segs=36, bevel=0.006, mat_index=0)
        # Front large circular end-cap disc (visible in cutaway & overview!)
        add_cylinder_three(bm, x, y, 0.50, r * 1.62, 0.045, axis='Z', segs=36, bevel=0.006, mat_index=0)
        # Recessed inner bolt ring on front end-cap
        add_cylinder_three(bm, x, y, 0.525, r * 0.55, 0.015, axis='Z', segs=24, mat_index=1)
        # Rear end-cap on back wall (+X side of rear frame visibility)
        add_cylinder_three(bm, x, y, -0.50, r * 1.55, 0.04, axis='Z', segs=32, bevel=0.005, mat_index=0)

    return finish_bmesh_object(
        "Calender_Upper_TieRods",
        bm,
        col,
        [mats["dark_steel"], mats["satin_steel_mid"]],
        part_id="calender_rolls",
        role="static",
        smooth=True,
    )


def build_electrode_web_and_powder_zone(col, mats):
    """
    Build:
      1. Exact mathematically tangent 700mm dry-electrode film web from R2 through W1
      2. Crisp glowing cyan/white process edge strip on the front (+Z) edge of the film
         (matching the signature glowing edge in the 4K video!)
      3. Translucent cyan powder feed box & suspended dry-electrode granules over R1-R2 nip
    """
    r_map = {r["label"]: r for r in CALENDER_ROLLS}
    web_t = 0.006
    pad = web_t * 0.5 + 0.002

    # Build exact wrap sequence: R2(+1) -> R3(-1) -> R4(+1) -> G1..G10 -> W1(+1)
    wrap_seq = [
        (r_map["R2"]["x"], r_map["R2"]["y"], r_map["R2"]["r"] + pad, +1),
        (r_map["R3"]["x"], r_map["R3"]["y"], r_map["R3"]["r"] + pad, -1),
        (r_map["R4"]["x"], r_map["R4"]["y"], r_map["R4"]["r"] + pad, +1),
    ]
    for g in GUIDE_ROLLS:
        wrap_seq.append((g["x"], g["y"], g["r"] + pad, g["spin"]))
    wrap_seq.append((WINDER_DRUM["x"], WINDER_DRUM["y"], WINDER_DRUM["r"] + pad, WINDER_DRUM["spin"]))

    centerline = compute_web_centerline(wrap_seq, arc_step_deg=5.0)

    # 1. Main dark carbon-black 700mm film web
    bm_web = bmesh.new()
    add_web_ribbon_three(bm_web, centerline, z_half_width=WEB_HALF_Z, thickness=web_t, mat_index=0)
    web_obj = finish_bmesh_object(
        "Electrode_Film_Web",
        bm_web,
        col,
        [mats["electrode_film"]],
        part_id="electrode_web",
        role="film_web",
        smooth=True,
    )

    # 2. Luminous glowing edge trace on front (+Z) edge of the film (two color zones:
    #    cyan glow in calendering/peel zone, cool-white glow in transport/winding zone)
    split_idx = int(len(centerline) * 0.50)
    bm_edge = bmesh.new()
    # Offset narrow glowing trim along front face Z = +WEB_HALF_Z + 0.003
    edge_sub1 = bmesh.new()
    edge_sub2 = bmesh.new()

    def _add_edge_strip(target_bm, pts_slice, z_center, z_half, thick, m_idx):
        if len(pts_slice) < 2:
            return
        # Build ribbon centered at z_center
        sub = bmesh.new()
        ht = thick * 0.5
        rings = []
        for (x, y, nx, ny, _s) in pts_slice:
            v0 = sub.verts.new((x + nx * ht, y + ny * ht, z_center + z_half))
            v1 = sub.verts.new((x + nx * ht, y + ny * ht, z_center - z_half))
            v2 = sub.verts.new((x - nx * ht, y - ny * ht, z_center - z_half))
            v3 = sub.verts.new((x - nx * ht, y - ny * ht, z_center + z_half))
            rings.append((v0, v1, v2, v3))
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(4):
                kn = (k + 1) % 4
                f = sub.faces.new((a[k], a[kn], b[kn], b[k]))
                f.material_index = m_idx
        from cm700_lib import _bm_transform_three_to_blender, _merge_bmesh
        _bm_transform_three_to_blender(sub)
        _merge_bmesh(target_bm, sub)
        sub.free()

    _add_edge_strip(bm_edge, centerline[:split_idx + 1], WEB_HALF_Z + 0.004, 0.005, 0.011, 0)
    _add_edge_strip(bm_edge, centerline[split_idx:], WEB_HALF_Z + 0.004, 0.005, 0.011, 1)

    edge_obj = finish_bmesh_object(
        "Electrode_Film_GlowEdge",
        bm_edge,
        col,
        [mats["glow_cyan"], mats["glow_web_edge"]],
        part_id="electrode_web",
        role="film_glow",
        smooth=True,
    )

    # 3. Translucent cyan powder feed zone box & glowing wireframe edges above R1-R2 nip
    r1 = r_map["R1"]
    r2 = r_map["R2"]
    box_x0 = r1["x"] - 0.03
    box_x1 = r2["x"] + 0.08
    box_y0 = max(r1["y"], r2["y"]) + 0.05
    box_y1 = box_y0 + 0.30
    box_cx = 0.5 * (box_x0 + box_x1)
    box_cy = 0.5 * (box_y0 + box_y1)
    box_sx = box_x1 - box_x0
    box_sy = box_y1 - box_y0
    box_sz = WEB_HALF_Z * 1.85

    bm_box = bmesh.new()
    add_box_three(bm_box, box_cx, box_cy, 0.0, box_sx, box_sy, box_sz, bevel=0.004, mat_index=0)
    box_obj = finish_bmesh_object(
        "Powder_Feed_Zone_Glass",
        bm_box,
        col,
        [mats["powder_box_glass"]],
        part_id="electrode_web",
        role="powder_box",
        smooth=False,
    )

    # Glowing wireframe border & dry-powder particles inside feed zone
    bm_frame = bmesh.new()
    t_edge = 0.007
    # 12 box outline bars
    for sx_s in (-0.5, 0.5):
        for sz_s in (-0.5, 0.5):
            add_box_three(bm_frame, box_cx + sx_s * box_sx, box_cy, sz_s * box_sz, t_edge, box_sy, t_edge, mat_index=0)
    for sy_s in (-0.5, 0.5):
        for sz_s in (-0.5, 0.5):
            add_box_three(bm_frame, box_cx, box_cy + sy_s * box_sy, sz_s * box_sz, box_sx, t_edge, t_edge, mat_index=0)
    for sx_s in (-0.5, 0.5):
        for sy_s in (-0.5, 0.5):
            add_box_three(bm_frame, box_cx + sx_s * box_sx, box_cy + sy_s * box_sy, 0.0, t_edge, t_edge, box_sz, mat_index=0)

    # Suspended dry-electrode powder granules (deterministic organic cluster)
    for idx in range(36):
        fx = ((idx * 37) % 100) / 100.0
        fy = ((idx * 53 + 17) % 100) / 100.0
        fz = ((idx * 71 + 29) % 100) / 100.0
        px = box_x0 + 0.03 + fx * (box_sx - 0.06)
        py = box_y0 + 0.02 + (fy ** 1.25) * (box_sy - 0.05)
        pz = (fz - 0.5) * (box_sz - 0.06)
        pr = 0.007 + (idx % 4) * 0.0025
        add_sphere_three(bm_frame, px, py, pz, pr, segs=10, rings=6, mat_index=0)

    frame_obj = finish_bmesh_object(
        "Powder_Feed_Particles",
        bm_frame,
        col,
        [mats["glow_cyan"]],
        part_id="electrode_web",
        role="powder_particles",
        smooth=True,
    )

    return [web_obj, edge_obj, box_obj, frame_obj], centerline


def build_all_core_rolls(col, mats):
    """Build all rollers, tie-rods, and the electrode film web."""
    objs = []
    for spec in CALENDER_ROLLS:
        objs.append(_build_single_calender_roll(spec, col, mats))
    objs.append(build_tie_rods(col, mats))
    for spec in GUIDE_ROLLS:
        objs.append(_build_single_guide_or_winder_roll(spec, col, mats, is_winder=False))
    objs.append(_build_single_guide_or_winder_roll(WINDER_DRUM, col, mats, is_winder=True))
    web_objs, centerline = build_electrode_web_and_powder_zone(col, mats)
    objs.extend(web_objs)
    return objs, centerline
