"""
cm700_enclosures.py
Main structural frames, sliding cutaway enclosures, overhead HMI pendant,
winder cheek plates, and operator control desk for the CM-700MM Calendering Line.
"""

import os
import math
import bpy
import bmesh
from mathutils import Matrix
from cm700_lib import (
    load_machine_config,
    finish_bmesh_object,
    add_box_three,
    add_cylinder_three,
    add_pipe_path_three,
    add_extruded_xy_polygon_three,
    _bm_transform_three_to_blender,
    _merge_bmesh,
)

_CFG = load_machine_config()
_LAY = _CFG["layout"]
CUTAWAY_OFFSET_Z = float(_LAY["cutawayOffsetZ"])
FONT_PATH = _CFG["machine"].get("fontPath", "")


# =============================================================================
# CRISP 3D GEOMETRIC INDUSTRIAL LETTERING FOR "CM-700MM"
# =============================================================================

# Non-overlapping crisp geometric strokes (u0, v0, u1, v1) in upright [0..1]x[0..1] glyph space
# u = left->right (0..1), v = bottom->top (0..1)
_GLYPHS = {
    'C': [
        (0.00, 0.00, 0.26, 1.00),  # left stem
        (0.26, 0.76, 1.00, 1.00),  # top bar
        (0.26, 0.00, 1.00, 0.24),  # bottom bar
    ],
    'M': [
        (0.00, 0.00, 0.22, 1.00),  # left leg
        (0.78, 0.00, 1.00, 1.00),  # right leg
        (0.22, 0.76, 0.78, 1.00),  # top bridge
        (0.41, 0.24, 0.59, 0.76),  # center stem
    ],
    '-': [
        (0.18, 0.39, 0.82, 0.61),
    ],
    '7': [
        (0.00, 0.76, 1.00, 1.00),  # top bar
        (0.74, 0.00, 1.00, 0.76),  # right stem
    ],
    '0': [
        (0.00, 0.00, 0.24, 1.00),  # left stem
        (0.76, 0.00, 1.00, 1.00),  # right stem
        (0.24, 0.76, 0.76, 1.00),  # top bar
        (0.24, 0.00, 0.76, 0.24),  # bottom bar
    ],
}


def _add_vertical_brand_text(bm, text, x_face, z_center, y_top, char_w=0.145, char_h=0.180, gap=0.052, depth=0.007, mat_index=0):
    """
    Place crisp vertical 3D block letters reading CM-700MM top-to-bottom on the +X face at x = x_face.
    Rotated 90 deg CW looking at the +X face (matching crop_left.jpg exactly):
      - glyph left-to-right (u: 0->1) runs TOP-to-BOTTOM (-Y)
      - glyph bottom-to-top (v: 0->1) runs LEFT-to-RIGHT (+Z -> -Z), so letter tops point toward -Z!
    """
    y_cursor = y_top
    for ch in text:
        strokes = _GLYPHS.get(ch, [])
        ch_len = char_h * (0.60 if ch == '-' else 1.0)
        for (u0, v0, u1, v1) in strokes:
            y0 = y_cursor - u1 * ch_len
            y1 = y_cursor - u0 * ch_len
            # v=0 at +Z, v=1 at -Z => z = z_center + (0.5 - v) * char_w
            za = z_center + (0.5 - v1) * char_w
            zb = z_center + (0.5 - v0) * char_w
            cy = 0.5 * (y0 + y1)
            cz = 0.5 * (za + zb)
            sy = max(0.006, y1 - y0)
            sz = max(0.006, zb - za)
            # Sit cleanly proud of x_face (+0.001 clearance prevents z-fighting!)
            add_box_three(bm, x_face + 0.001 + depth * 0.5, cy, cz, depth, sy, sz, bevel=0.0, segments=1, mat_index=mat_index)
        y_cursor -= (ch_len + gap)


def _build_real_font_brand_text(text, x_face, z_center, y_center, col, mat, cutaway_offset_z):
    """
    Create crisp 3D extruded DIN Alternate Bold industrial lettering ('CM-700MM')
    converted directly to a clean Blender Mesh (with exact orthonormal +X face basis).
    Returns the mesh Object or None if system font unavailable.
    """
    if not FONT_PATH or not os.path.exists(FONT_PATH):
        return None

    curve = bpy.data.curves.new(name="BrandText_Curve", type='FONT')
    curve.body = text
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = 0.255
    curve.space_character = 1.12
    curve.extrude = 0.0045
    curve.bevel_depth = 0.0012
    curve.bevel_resolution = 1
    curve.resolution_u = 6
    try:
        curve.font = bpy.data.fonts.load(FONT_PATH, check_existing=True)
    except Exception:
        bpy.data.curves.remove(curve)
        return None

    tmp_obj = bpy.data.objects.new("BrandText_Tmp", curve)
    col.objects.link(tmp_obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = tmp_obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(eval_obj)

    # Clean up temporary curve object
    col.objects.unlink(tmp_obj)
    bpy.data.objects.remove(tmp_obj)
    bpy.data.curves.remove(curve)

    # Transform mesh vertices directly into Blender world space on the +X front cabinet wall:
    # X_text -> (0,0,-1) [top-to-bottom], Y_text -> (0,+1,0) [tops toward -Z_three], Z_text -> (+1,0,0) [+X outward]
    basis = Matrix((
        (0.0,  0.0, 1.0, x_face + 0.005),
        (0.0,  1.0, 0.0, -z_center),
        (-1.0, 0.0, 0.0, y_center),
        (0.0,  0.0, 0.0, 1.0),
    ))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    bmesh.ops.transform(bm, matrix=basis, verts=bm.verts)

    obj = finish_bmesh_object(
        "Front_CM700MM_BrandText",
        bm,
        col,
        [mat],
        part_id="front_enclosure",
        role="cutaway_front",
        extras={"cutawayOffsetZ": float(cutaway_offset_z), "isBrandText": True},
        smooth=False,
    )
    return obj


# =============================================================================
# 1. FRONT SLIDING MAIN ENCLOSURE ("CM-700MM" CABINET)
# =============================================================================

def build_front_main_enclosure(col, mats):
    """
    Front (+Z) brushed-stainless enclosure with chamfered frame, twin vertical dark glass
    windows on +Z face, crisp DIN Bold 3D CM-700MM lettering on +X face, and top tie-rod cap.
    Slides forward (+Z) in Cutaway mode just like the video!
    """
    bm = bmesh.new()

    fc = _LAY["frontCabinet"]
    x0, x1 = float(fc["x"][0]), float(fc["x"][1])
    y0, y1 = float(fc["y"][0]), float(fc["y"][1])
    z0, z1 = float(fc["z"][0]), float(fc["z"][1])
    cx = 0.5 * (x0 + x1)
    cy = 0.5 * (y0 + y1)
    cz = 0.5 * (z0 + z1)
    sx, sy, sz = x1 - x0, y1 - y0, z1 - z0

    # Main chamfered stainless cabinet body (mat 0 = brushed_steel)
    add_box_three(bm, cx, cy, cz, sx, sy, sz, bevel=0.065, segments=2, mat_index=0)

    # Crisp recessed vertical door seam down the +Z double-door face & +X face (mat 2 = dark_steel)
    add_box_three(bm, cx, cy, z1 + 0.001, 0.008, sy - 0.16, 0.006, mat_index=2)
    add_box_three(bm, x1 + 0.001, cy, cz - 0.06, 0.006, sy - 0.14, 0.008, mat_index=2)
    # Recessed door perimeter trim frame on +Z face
    add_box_three(bm, cx, y0 + 0.09, z1 + 0.001, sx - 0.16, 0.008, 0.005, mat_index=2)
    add_box_three(bm, cx, y1 - 0.09, z1 + 0.001, sx - 0.16, 0.008, 0.005, mat_index=2)

    # Two tall vertical tinted observation glass windows on +Z face (mat 1 = dark_glass)
    win_w = 0.46
    win_h = 1.66
    win_y = 1.18
    for wx in (cx - 0.36, cx + 0.36):
        add_box_three(bm, wx, win_y, z1 + 0.004, win_w, win_h, 0.014, bevel=0.003, mat_index=1)
        add_box_three(bm, wx, win_y + win_h * 0.5 + 0.01, z1 + 0.002, win_w + 0.025, 0.018, 0.010, mat_index=3)
        add_box_three(bm, wx, win_y - win_h * 0.5 - 0.01, z1 + 0.002, win_w + 0.025, 0.018, 0.010, mat_index=3)

    # Try real DIN Alternate Bold 3D mesh; fall back to geometric glyphs if font unavailable
    brand_obj = _build_real_font_brand_text(
        _CFG["machine"]["model"],
        x_face=x1,
        z_center=z1 - 0.28,
        y_center=1.34,
        col=col,
        mat=mats["brand_text"],
        cutaway_offset_z=CUTAWAY_OFFSET_Z,
    )
    if brand_obj is None:
        _add_vertical_brand_text(
            bm,
            _CFG["machine"]["model"],
            x_face=x1,
            z_center=z1 - 0.28,
            y_top=y1 - 0.16,
            char_w=0.145,
            char_h=0.175,
            gap=0.048,
            depth=0.009,
            mat_index=4,
        )

    # Dark circular tie-rod clamp boss protruding on +X upper-back corner
    add_cylinder_three(bm, x1 + 0.045, 2.18, z0 + 0.08, 0.115, 0.11, axis='X', segs=36, bevel=0.008, mat_index=2)
    add_cylinder_three(bm, x1 + 0.102, 2.18, z0 + 0.08, 0.042, 0.018, axis='X', segs=24, mat_index=3)

    # Internal dark inspection backing on inner -Z face
    add_box_three(bm, cx, cy, z0 + 0.02, sx - 0.16, sy - 0.16, 0.04, mat_index=3)

    obj = finish_bmesh_object(
        "Front_CM700MM_Cabinet",
        bm,
        col,
        [mats["brushed_steel"], mats["dark_glass"], mats["dark_steel"], mats["satin_steel_mid"], mats["brand_text"]],
        part_id="front_enclosure",
        role="cutaway_front",
        extras={"cutawayOffsetZ": CUTAWAY_OFFSET_Z},
        smooth=False,
    )
    return [obj, brand_obj] if brand_obj is not None else [obj]


# =============================================================================
# 2. OVERHEAD WHITE CANTILEVER GANTRY & HMI PENDANT
# =============================================================================

def build_hmi_pendant_assembly(col, mats):
    """
    White overhead cantilever arm mounted atop the Front CM-700MM cabinet,
    descending to the chamfered white HMI touchscreen pendant with side grab handles,
    3 colored push-buttons, and yellow/red E-stop.
    """
    bm = bmesh.new()

    # Overhead square-tube cantilever gantry (mat 0 = enamel_white)
    # 1. Rear vertical riser from cabinet top (X=+0.22, Y=2.44..2.98, Z=+0.92)
    add_box_three(bm, 0.22, 2.71, 0.92, 0.11, 0.56, 0.11, bevel=0.008, mat_index=0)
    # Mounting flange plate on top of front cabinet
    add_box_three(bm, 0.22, 2.47, 0.92, 0.20, 0.03, 0.20, bevel=0.004, mat_index=1)
    # 2. Long horizontal cross-beam spanning left across top of cabinet
    add_box_three(bm, -0.52, 2.96, 0.92, 1.59, 0.11, 0.11, bevel=0.008, mat_index=0)
    # 3. Forward cantilever arm extending toward +Z above HMI station
    add_box_three(bm, -1.26, 2.96, 1.24, 0.12, 0.12, 0.74, bevel=0.008, mat_index=0)
    # Corner elbow cap joint
    add_box_three(bm, -1.26, 2.96, 1.56, 0.15, 0.15, 0.15, bevel=0.012, mat_index=0)
    # 4. Vertical pendant drop mast down to HMI enclosure top
    add_box_three(bm, -1.26, 2.22, 1.56, 0.13, 1.46, 0.13, bevel=0.008, mat_index=0)
    # Stepped swivel collar connecting mast to HMI box
    add_box_three(bm, -1.26, 1.49, 1.56, 0.18, 0.12, 0.18, bevel=0.010, mat_index=0)

    # HMI Pendant Enclosure Box centered at (-1.26, 1.15, 1.56)
    hx, hy, hz = -1.26, 1.15, 1.56
    hw, hh, hd = 0.56, 0.58, 0.22
    # Main chamfered white housing
    add_box_three(bm, hx, hy, hz, hw, hh, hd, bevel=0.035, segments=2, mat_index=0)
    # Front recessed inner bezel panel
    add_box_three(bm, hx, hy, hz + hd * 0.5 + 0.003, hw - 0.09, hh - 0.09, 0.010, bevel=0.004, mat_index=1)

    # Recessed dark touchscreen LCD display (upper half, mat 2 = hmi_screen)
    add_box_three(bm, hx, hy + 0.095, hz + hd * 0.5 + 0.008, 0.29, 0.21, 0.012, bevel=0.003, mat_index=2)
    # Slim outer screen frame
    add_box_three(bm, hx, hy + 0.095, hz + hd * 0.5 + 0.005, 0.315, 0.235, 0.008, mat_index=3)

    # 3 Round push-buttons below screen (Left Red, Center Green, Right Red)
    btn_z = hz + hd * 0.5 + 0.018
    btn_y = hy - 0.095
    add_cylinder_three(bm, hx - 0.12, btn_y, btn_z, 0.026, 0.024, axis='Z', segs=24, bevel=0.005, mat_index=4)  # Red
    add_cylinder_three(bm, hx,        btn_y, btn_z, 0.026, 0.024, axis='Z', segs=24, bevel=0.005, mat_index=5)  # Green
    add_cylinder_three(bm, hx + 0.12, btn_y, btn_z, 0.026, 0.024, axis='Z', segs=24, bevel=0.005, mat_index=4)  # Red

    # Bottom-right Emergency Stop button (Yellow shroud + Red mushroom cap)
    es_x, es_y = hx + 0.12, hy - 0.185
    add_box_three(bm, es_x, es_y, hz + hd * 0.5 + 0.014, 0.068, 0.068, 0.022, bevel=0.006, mat_index=6)  # Yellow
    add_cylinder_three(bm, es_x, es_y, hz + hd * 0.5 + 0.032, 0.024, 0.022, axis='Z', segs=24, bevel=0.006, mat_index=4)  # Red

    # Left & Right Chrome U-shaped Side Grab Handles (mat 7 = chrome)
    for side in (-1.0, +1.0):
        x_wall = hx + side * (hw * 0.5 - 0.01)
        x_rail = hx + side * (hw * 0.5 + 0.048)
        pts = [
            (x_wall, hy + 0.17, hz + 0.02),
            (x_rail, hy + 0.17, hz + 0.02),
            (x_rail, hy - 0.17, hz + 0.02),
            (x_wall, hy - 0.17, hz + 0.02),
        ]
        add_pipe_path_three(bm, pts, radius=0.011, segs=14, corner_radius=0.02, corner_segs=4, mat_index=7)

    obj = finish_bmesh_object(
        "HMI_Cantilever_Pendant",
        bm,
        col,
        [
            mats["enamel_white"],
            mats["bright_steel"],
            mats["hmi_screen"],
            mats["dark_steel"],
            mats["btn_red"],
            mats["btn_green"],
            mats["btn_yellow"],
            mats["chrome"],
        ],
        part_id="hmi_pendant",
        role="cutaway_front",
        extras={"cutawayOffsetZ": CUTAWAY_OFFSET_Z},
        smooth=True,
    )
    # Remap exact [0..1]x[0..1] planar UVs onto the HMI LCD touchscreen front face (mat_index == 2)
    # so the SCADA HMI UI graphic fills the recessed display crisply right-side-up!
    uv_layer = obj.data.uv_layers.active
    if uv_layer is not None:
        scr_x0, scr_x1 = hx - 0.145, hx + 0.145
        scr_y0, scr_y1 = (hy + 0.095) - 0.105, (hy + 0.095) + 0.105
        for poly in obj.data.polygons:
            if poly.material_index == 2:
                for li in poly.loop_indices:
                    v = obj.data.vertices[obj.data.loops[li].vertex_index].co
                    # Blender co: (x_t, -z_t, y_t)
                    u = max(0.0, min(1.0, (v.x - scr_x0) / (scr_x1 - scr_x0)))
                    w = max(0.0, min(1.0, (v.z - scr_y0) / (scr_y1 - scr_y0)))
                    uv_layer.data[li].uv = (u, w)
    return obj


# =============================================================================
# 3. FRONT & REAR WINDER CHEEK PLATES (STEPPED + C-CUTOUT PROFILE)
# =============================================================================

def _make_winder_cheek_polygon():
    """
    2D counter-clockwise polygon (XY plane) of the stepped winder cheek plate with
    the iconic semicircular C-cutout framing G10 & W1 (matches crop_right.jpg & trans_02.jpg!).
    """
    pts = [
        (0.38, 0.0),
        (2.04, 0.0),
        (2.04, 0.12),
        (1.88, 0.12),
    ]
    # Semicircular C-cutout centered at (1.92, 0.44), radius = 0.35
    # Tracing CCW along the INNER wall of the C-cutout: from bottom (-95 deg) around the LEFT (-180 deg) to top (+95 deg)
    cx, cy, r_cut = 1.92, 0.44, 0.35
    n_arc = 28
    a_start = math.radians(-105.0)
    a_end = math.radians(-262.0)  # sweeping clockwise on circle => going up along the left inner arc!
    for i in range(n_arc + 1):
        ang = a_start + (a_end - a_start) * (i / n_arc)
        pts.append((cx + r_cut * math.cos(ang), cy + r_cut * math.sin(ang)))

    pts.extend([
        (2.04, 0.79),
        (2.04, 0.98),
        (0.84, 0.98),
        (0.84, 1.24),
        (0.38, 1.24),
    ])
    return pts


def build_front_winder_shield(col, mats):
    """
    Front (+Z) stepped cheek plate with C-shaped winder cutout and heavy floor anchor block.
    Slides forward along +Z with the front cabinet during Cutaway mode (visible in trans_02.jpg!).
    """
    bm = bmesh.new()
    pts = _make_winder_cheek_polygon()
    add_extruded_xy_polygon_three(bm, pts, z0=0.45, z1=0.60, bevel=0.008, mat_index=0)

    # Heavy protruding floor anchor block at the front-right corner (X=1.96..2.18, Y=0..0.14)
    add_box_three(bm, 2.06, 0.07, 0.525, 0.24, 0.14, 0.17, bevel=0.006, mat_index=1)
    # Recessed lower floor tie rail running back toward rear cheek plate
    add_box_three(bm, 1.92, 0.03, 0.42, 0.20, 0.06, 0.12, bevel=0.004, mat_index=1)

    return finish_bmesh_object(
        "Front_Winder_CheekPlate",
        bm,
        col,
        [mats["brushed_steel"], mats["bright_steel"]],
        part_id="front_enclosure",
        role="cutaway_front",
        extras={"cutawayOffsetZ": CUTAWAY_OFFSET_Z},
        smooth=False,
    )


# =============================================================================
# 4. REAR STATIONARY MAIN FRAME, DRIVE CABINET & WINDER BACKPLATE
# =============================================================================

def build_rear_main_frame(col, mats):
    """
    Heavy stationary rear (-Z) structural wall supporting all 5 calender rolls,
    plus the rear drive cabinet (with twin vertical dark observation windows on +X face),
    the stationary rear winder backplate behind G1..G10 & W1, and the lower machine bed.
    """
    bm = bmesh.new()

    # 1. Heavy solid brushed-steel main roller mounting wall (X=-1.16..+0.38, Y=0..2.46, Z=-0.56..-0.45)
    add_box_three(bm, -0.39, 1.23, -0.505, 1.54, 2.46, 0.11, bevel=0.015, mat_index=0)

    # 2. Rear main drive cabinet behind roller wall (X=-1.16..+0.38, Y=0..2.46, Z=-1.40..-0.54)
    add_box_three(bm, -0.39, 1.23, -0.97, 1.54, 2.46, 0.86, bevel=0.030, mat_index=0)

    # Twin tall vertical dark observation windows on +X face of rear cabinet (clearly visible in crop_right.jpg & crop_rollers.jpg!)
    win_y = 1.22
    win_h = 1.68
    win_z_w = 0.26
    for wz in (-0.78, -1.14):
        add_box_three(bm, 0.38 + 0.004, win_y, wz, 0.014, win_h, win_z_w, bevel=0.003, mat_index=1)
    # Center vertical door seam on +X face of rear cabinet
    add_box_three(bm, 0.38 + 0.002, win_y, -0.96, 0.006, 2.26, 0.008, mat_index=2)

    # Dark circular tie-rod clamp boss on +X upper-front corner of rear cabinet (matches crop_right.jpg!)
    add_cylinder_three(bm, 0.38 + 0.045, 2.18, -0.52, 0.115, 0.11, axis='X', segs=36, bevel=0.008, mat_index=2)
    add_cylinder_three(bm, 0.38 + 0.102, 2.18, -0.52, 0.042, 0.018, axis='X', segs=24, mat_index=3)

    # Rear (-Z) service doors & cooling vents so rear 360-degree view is richly detailed
    add_box_three(bm, -0.39, 1.23, -1.402, 0.010, 2.22, 0.008, mat_index=2)
    for rx in (-0.78, 0.0):
        # Recessed louver panel
        for lv in range(10):
            add_box_three(bm, rx, 0.28 + lv * 0.042, -1.405, 0.42, 0.014, 0.012, mat_index=2)
        # Door handle
        add_box_three(bm, rx + (0.24 if rx < -0.39 else -0.24), 1.18, -1.415, 0.025, 0.14, 0.025, bevel=0.004, mat_index=4)

    # 3. Stationary Rear Winder & Guide-Roll Backplate (X=+0.38..+2.06, Z=-0.58..-0.45)
    # Left high step behind G1..G5 (X=0.38..0.88, Y=0..1.20)
    add_box_three(bm, 0.63, 0.60, -0.515, 0.50, 1.20, 0.13, bevel=0.012, mat_index=0)
    # Mid step behind G6..G10 & W1 (X=0.88..2.04, Y=0..0.98)
    add_box_three(bm, 1.46, 0.49, -0.515, 1.16, 0.98, 0.13, bevel=0.012, mat_index=0)
    # Top recessed horizontal deck cover between G6 & G7 inspection bridge
    add_box_three(bm, 1.24, 0.72, -0.74, 0.74, 0.56, 0.36, bevel=0.012, mat_index=3)
    # Vertical seam separating main calender bed from winder pedestal (visible in crop_rollers.jpg)
    add_box_three(bm, 0.38, 0.62, -0.448, 0.008, 1.24, 0.008, mat_index=2)

    # 4. Lower machine floor bed / drip pan spanning under the guide rolls & winder
    add_box_three(bm, 1.16, 0.04, 0.0, 1.62, 0.08, 0.94, bevel=0.008, mat_index=3)
    # Heavy rear floor anchor block at (+X, -Z) corner of winder
    add_box_three(bm, 2.06, 0.07, -0.515, 0.24, 0.14, 0.17, bevel=0.006, mat_index=4)
    # Structural floor cross-tie bar under winder drum
    add_box_three(bm, 2.04, 0.03, 0.0, 0.14, 0.06, 0.94, bevel=0.004, mat_index=3)

    return finish_bmesh_object(
        "Rear_Main_Frame_And_Drive",
        bm,
        col,
        [mats["brushed_steel"], mats["dark_glass"], mats["dark_steel"], mats["satin_steel_mid"], mats["bright_steel"]],
        part_id="main_frame",
        role="static",
        smooth=False,
    )


# =============================================================================
# 5. RIGHT-SIDE OPERATOR CONTROL DESK (SLANTED PUSH-BUTTON CONSOLE)
# =============================================================================

def build_operator_control_desk(col, mats):
    """
    Operator control desk integrated at the rear-right of the winder bay (crop_right.jpg):
      - Vertical brushed-steel console column
      - 35-degree slanted white enameled button deck with 3x3 green/red illuminated buttons + E-stop
      - Adjacent slim utility unit with horizontal dark panel & tilted monitor
    """
    bm = bmesh.new()

    # Main console pedestal (X=1.74..2.22, Y=0..0.94, Z=-1.00..-0.48)
    add_box_three(bm, 1.98, 0.47, -0.74, 0.48, 0.94, 0.52, bevel=0.015, mat_index=0)
    # Floor base plinth
    add_box_three(bm, 2.04, 0.07, -0.74, 0.56, 0.14, 0.56, bevel=0.008, mat_index=1)

    # Slanted top console housing (built via extruded XY wedge polygon)
    wedge_pts = [
        (1.66, 0.94),
        (2.24, 0.94),
        (2.24, 1.01),
        (1.94, 1.18),
        (1.66, 1.18),
    ]
    add_extruded_xy_polygon_three(bm, wedge_pts, z0=-1.00, z1=-0.48, bevel=0.010, mat_index=0)

    # White slanted control plate resting on the angled face from (1.94, 1.18) to (2.24, 1.01)
    dx = 2.24 - 1.94
    dy = 1.01 - 1.18
    slope_len = math.hypot(dx, dy)
    slope_ang = math.atan2(dy, dx)  # approx -29.5 deg
    mid_x = 0.5 * (1.94 + 2.24)
    mid_y = 0.5 * (1.18 + 1.01)
    nx = -dy / slope_len
    ny = dx / slope_len

    def _add_slanted_item(sub_bm, u_along, v_z, normal_h, m_idx):
        """Place sub_bm authored in local (u_along, normal_y, v_z) onto the slanted console plane."""
        rot = Matrix.Rotation(slope_ang, 4, 'Z')
        pos = (mid_x + u_along * (dx / slope_len) + normal_h * nx,
               mid_y + u_along * (dy / slope_len) + normal_h * ny,
               -0.74 + v_z)
        bmesh.ops.transform(sub_bm, matrix=Matrix.Translation(pos) @ rot, verts=sub_bm.verts)
        _bm_transform_three_to_blender(sub_bm)
        for f in sub_bm.faces:
            f.material_index = m_idx
        _merge_bmesh(bm, sub_bm)
        sub_bm.free()

    # White button bezel plate
    sub_plate = bmesh.new()
    bmesh.ops.create_cube(sub_plate, size=1.0)
    bmesh.ops.transform(sub_plate, matrix=Matrix.Diagonal((slope_len * 0.86, 0.014, 0.42, 1.0)), verts=sub_plate.verts)
    _add_slanted_item(sub_plate, 0.0, 0.0, 0.008, 2)

    # 3x3 Push-button array matching crop_right.jpg (top/mid green, bottom red, plus corner E-stop!)
    # Rows along u (top to bottom): u = -0.09, 0.0, +0.09
    # Cols along Z: v = -0.11, -0.02, +0.07
    button_grid = [
        (-0.08, -0.10, 4), (-0.08, -0.01, 4), (-0.08, +0.08, 4),  # Green row
        ( 0.00, -0.10, 4), ( 0.00, -0.01, 4), ( 0.00, +0.08, 5),  # Green, Green, Red
        (+0.08, -0.10, 5), (+0.08, -0.01, 4),                     # Red, Green
    ]
    for (u_b, v_b, m_idx) in button_grid:
        sb = bmesh.new()
        bmesh.ops.create_cone(sb, cap_ends=True, cap_tris=False, segments=16, radius1=0.019, radius2=0.017, depth=0.020)
        bmesh.ops.transform(sb, matrix=Matrix.Rotation(math.pi * 0.5, 4, 'X'), verts=sb.verts)
        _add_slanted_item(sb, u_b, v_b, 0.022, m_idx)

    # Corner E-Stop button (yellow base + red cap) at (+0.08, +0.09)
    sb_y = bmesh.new()
    bmesh.ops.create_cube(sb_y, size=1.0)
    bmesh.ops.transform(sb_y, matrix=Matrix.Diagonal((0.052, 0.020, 0.052, 1.0)), verts=sb_y.verts)
    _add_slanted_item(sb_y, +0.08, +0.09, 0.020, 6)

    sb_r = bmesh.new()
    bmesh.ops.create_cone(sb_r, cap_ends=True, cap_tris=False, segments=18, radius1=0.021, radius2=0.021, depth=0.022)
    bmesh.ops.transform(sb_r, matrix=Matrix.Rotation(math.pi * 0.5, 4, 'X'), verts=sb_r.verts)
    _add_slanted_item(sb_r, +0.08, +0.09, 0.036, 5)

    # Rear-adjacent control sub-cabinet & small upright dark display monitor (visible behind console in crop_right.jpg)
    add_box_three(bm, 2.02, 0.45, -1.24, 0.48, 0.90, 0.48, bevel=0.012, mat_index=0)
    # Recessed dark meter & louver bay on +X face
    add_box_three(bm, 2.262, 0.72, -1.24, 0.014, 0.18, 0.36, mat_index=3)
    # Slim upright dark monitor perched atop rear sub-cabinet
    add_box_three(bm, 1.94, 1.12, -1.16, 0.05, 0.32, 0.44, bevel=0.008, mat_index=3)
    add_box_three(bm, 1.968, 1.12, -1.16, 0.010, 0.27, 0.39, mat_index=7)

    obj = finish_bmesh_object(
        "Operator_Control_Desk",
        bm,
        col,
        [
            mats["brushed_steel"],
            mats["bright_steel"],
            mats["enamel_white"],
            mats["dark_steel"],
            mats["btn_green"],
            mats["btn_red"],
            mats["btn_yellow"],
            mats["hmi_screen"],
        ],
        part_id="control_desk",
        role="static",
        smooth=False,
    )
    # Remap exact [0..1]x[0..1] planar UVs onto the upright +X-facing secondary monitor (mat_index == 7)
    uv_layer = obj.data.uv_layers.active
    if uv_layer is not None:
        # Three.js Z in [-1.355, -0.965] => Blender Y = -Z in [0.965, 1.355]; Three.js Y in [0.985, 1.255] => Blender Z
        by0, by1 = 1.16 - 0.195, 1.16 + 0.195
        bz0, bz1 = 1.12 - 0.135, 1.12 + 0.135
        for poly in obj.data.polygons:
            if poly.material_index == 7:
                for li in poly.loop_indices:
                    v = obj.data.vertices[obj.data.loops[li].vertex_index].co
                    u = max(0.0, min(1.0, (v.y - by0) / (by1 - by0)))
                    w = max(0.0, min(1.0, (v.z - bz0) / (bz1 - bz0)))
                    uv_layer.data[li].uv = (u, w)
    return obj


def build_all_enclosures(col, mats):
    objs = []
    objs.extend(build_front_main_enclosure(col, mats))
    objs.extend([
        build_hmi_pendant_assembly(col, mats),
        build_front_winder_shield(col, mats),
        build_rear_main_frame(col, mats),
        build_operator_control_desk(col, mats),
    ])
    return objs
