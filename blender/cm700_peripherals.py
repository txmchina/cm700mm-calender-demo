"""
cm700_peripherals.py
Peripheral structures and auxiliary equipment of the CM-700MM Calendering Line:
  - Golden-yellow industrial safety staircase, floor truss, anti-slip treads,
    double handrails, and curved upper platform safety gates
  - Raised brushed-silver feeding platform, 4-leg frame, platform feeder enclosure,
    and lower mobile vacuum/auxiliary cart with swivel casters
  - Vertical dark-steel hopper tower, polished stainless cylinder-cone powder hopper,
    and cantilevered precision dosing table extending above R1-R2
  - Front-right louvered Thermal / Hydraulic Control Unit (with rounded black windows,
    recessed latches, and twin louver columns)
  - Tall rear 2-bay PLC / Main Electrical Power Cabinet
"""

import math
import bmesh
from cm700_lib import (
    load_machine_config,
    finish_bmesh_object,
    add_box_three,
    add_cylinder_three,
    add_cone_three,
    add_cylinder_between_three,
    add_pipe_path_three,
)

_CFG = load_machine_config()
_LAY = _CFG["layout"]


# =============================================================================
# 1. GOLDEN-YELLOW SAFETY STAIRCASE & PLATFORM GUARDRAILS
# =============================================================================

def build_safety_staircase(col, mats):
    """
    Golden-yellow powder-coated tubular steel staircase climbing from (-3.45, 0)
    up to the raised feeding platform (-2.18, 1.24), complete with 6 grooved metallic treads,
    diagonal truss cross-bracing, double stair handrails, and curved upper safety gates.
    """
    bm = bmesh.new()

    z_rear = 0.24
    z_front = 1.06
    z_mid = 0.5 * (z_rear + z_front)
    stair_w = z_front - z_rear

    x_bot = -3.48
    x_top = -2.18
    y_bot = 0.04
    y_top = 1.24

    r_frame = 0.022
    r_rail = 0.021
    r_sub = 0.014

    # 1. Rectangular golden base frame on floor (mat 0 = safety_gold)
    add_cylinder_between_three(bm, (x_bot, 0.025, z_rear),  (x_top, 0.025, z_rear),  r_frame, segs=12, mat_index=0)
    add_cylinder_between_three(bm, (x_bot, 0.025, z_front), (x_top, 0.025, z_front), r_frame, segs=12, mat_index=0)
    add_cylinder_between_three(bm, (x_bot, 0.025, z_rear),  (x_bot, 0.025, z_front), r_frame, segs=12, mat_index=0)
    add_cylinder_between_three(bm, (x_top, 0.025, z_rear),  (x_top, 0.025, z_front), r_frame, segs=12, mat_index=0)
    # Mid floor cross-tie
    x_mid = 0.5 * (x_bot + x_top)
    add_cylinder_between_three(bm, (x_mid, 0.025, z_rear), (x_mid, 0.025, z_front), r_sub, segs=10, mat_index=0)

    # 2. Inclined side stringers, vertical support posts & diagonal truss bracing
    for z_s in (z_rear, z_front):
        # Main inclined stringer beam
        add_cylinder_between_three(bm, (x_bot, y_bot, z_s), (x_top, y_top, z_s), r_frame * 1.15, segs=12, mat_index=0)
        # Secondary lower stringer flange
        add_cylinder_between_three(bm, (x_bot + 0.08, y_bot, z_s), (x_top, y_top - 0.14, z_s), r_sub, segs=10, mat_index=0)
        # Rear vertical support post under platform landing
        add_cylinder_between_three(bm, (x_top, 0.025, z_s), (x_top, y_top, z_s), r_frame, segs=12, mat_index=0)
        # Diagonal truss braces matching crop_left.jpg
        add_cylinder_between_three(bm, (x_bot + 0.06, 0.025, z_s), (x_mid + 0.12, 0.62, z_s), r_sub, segs=10, mat_index=0)
        add_cylinder_between_three(bm, (x_top, 0.025, z_s), (x_mid, 0.60, z_s), r_sub, segs=10, mat_index=0)

    # Back-side X bracing between z_rear and z_front under stairs
    add_cylinder_between_three(bm, (x_top, 0.04, z_rear), (x_top, y_top - 0.10, z_front), r_sub, segs=10, mat_index=0)
    add_cylinder_between_three(bm, (x_top, 0.04, z_front), (x_top, y_top - 0.10, z_rear), r_sub, segs=10, mat_index=0)

    # 3. 6 Anti-slip metallic stair treads (mat 1 = bright_steel, golden side brackets)
    n_steps = 6
    for i in range(n_steps):
        frac = (i + 0.5) / n_steps
        sx = x_bot + (x_top - x_bot) * frac
        sy = y_bot + (y_top - y_bot) * frac
        # Main tread plate
        add_box_three(bm, sx, sy, z_mid, 0.21, 0.022, stair_w - 0.03, bevel=0.003, mat_index=1)
        # Anti-slip grip strips on tread top
        for r_off in (-0.055, 0.0, 0.055):
            add_box_three(bm, sx + r_off, sy + 0.013, z_mid, 0.014, 0.006, stair_w - 0.08, mat_index=2)

    # 4. Inclined Golden Handrails (Top rail + Knee rail + Vertical stanchions) on BOTH sides
    rail_h = 0.96
    mid_h = 0.52
    for z_s in (z_rear, z_front):
        # Continuous rounded top handrail from floor stanchion up stairs to platform landing
        pts_top = [
            (x_bot, y_bot, z_s),
            (x_bot, y_bot + rail_h, z_s),
            (x_top, y_top + rail_h, z_s),
            (x_top + 0.18, y_top + rail_h, z_s),
        ]
        add_pipe_path_three(bm, pts_top, radius=r_rail, segs=14, corner_radius=0.05, corner_segs=5, mat_index=0)

        # Parallel mid knee-rail
        add_cylinder_between_three(bm, (x_bot, y_bot + mid_h, z_s), (x_top, y_top + mid_h, z_s), r_sub, segs=10, mat_index=0)

        # Vertical handrail stanchions along stair run
        for k in range(1, 6):
            f = k / 5.0
            px = x_bot + (x_top - x_bot) * f
            py = y_bot + (y_top - y_bot) * f
            add_cylinder_between_three(bm, (px, py, z_s), (px, py + rail_h, z_s), r_sub * 1.1, segs=10, mat_index=0)

    # 5. Distinctive Upper Platform Curved U-Loop Safety Guardrail Gates (visible in trans_02.jpg & trans_04.jpg!)
    # Front-left loop along Z = z_front from X = -2.18 to -1.78
    gate_y0 = 1.24
    gate_y1 = 2.18
    gate_y_mid = 1.70
    # Left front gate panel (X = -2.16 to -1.80, Z = z_front)
    add_pipe_path_three(
        bm,
        [
            (-2.16, gate_y0, z_front),
            (-2.16, gate_y1, z_front),
            (-1.82, gate_y1, z_front),
            (-1.82, gate_y0, z_front),
        ],
        radius=r_rail * 1.1, segs=14, corner_radius=0.08, corner_segs=6, mat_index=0,
    )
    add_cylinder_between_three(bm, (-2.16, gate_y_mid, z_front), (-1.82, gate_y_mid, z_front), r_sub * 1.1, segs=10, mat_index=0)
    add_cylinder_between_three(bm, (-1.99, gate_y0, z_front), (-1.99, gate_y1, z_front), r_sub, segs=10, mat_index=0)

    # Right front safety gate panel (X = -1.74 to -1.36, Z = z_front)
    add_pipe_path_three(
        bm,
        [
            (-1.74, gate_y0, z_front),
            (-1.74, gate_y1, z_front),
            (-1.38, gate_y1, z_front),
            (-1.38, gate_y0, z_front),
        ],
        radius=r_rail * 1.1, segs=14, corner_radius=0.08, corner_segs=6, mat_index=0,
    )
    add_cylinder_between_three(bm, (-1.74, gate_y_mid, z_front), (-1.38, gate_y_mid, z_front), r_sub * 1.1, segs=10, mat_index=0)
    add_cylinder_between_three(bm, (-1.56, gate_y0, z_front), (-1.56, gate_y1, z_front), r_sub, segs=10, mat_index=0)

    # Return railing on the -X edge of landing (closing rear side from Z = z_rear to Z = -0.52)
    add_pipe_path_three(
        bm,
        [
            (-2.16, gate_y0, z_rear),
            (-2.16, gate_y1, z_rear),
            (-2.16, gate_y1, -0.52),
            (-2.16, gate_y0, -0.52),
        ],
        radius=r_rail, segs=14, corner_radius=0.07, corner_segs=5, mat_index=0,
    )
    add_cylinder_between_three(bm, (-2.16, gate_y_mid, z_rear), (-2.16, gate_y_mid, -0.52), r_sub, segs=10, mat_index=0)

    # Rear platform guardrail along Z = -0.52
    add_pipe_path_three(
        bm,
        [
            (-2.16, gate_y1, -0.52),
            (-1.32, gate_y1, -0.52),
            (-1.32, gate_y0, -0.52),
        ],
        radius=r_rail, segs=14, corner_radius=0.07, corner_segs=5, mat_index=0,
    )
    add_cylinder_between_three(bm, (-2.16, gate_y_mid, -0.52), (-1.32, gate_y_mid, -0.52), r_sub, segs=10, mat_index=0)

    return finish_bmesh_object(
        "Safety_Staircase_And_Guardrails",
        bm,
        col,
        [mats["safety_gold"], mats["bright_steel"], mats["dark_steel"]],
        part_id="safety_stairs",
        role="static",
        smooth=True,
    )


# =============================================================================
# 2. RAISED FEEDING PLATFORM & LOWER MOBILE FEEDER SUB-UNIT
# =============================================================================

def build_feeding_platform(col, mats):
    """
    Brushed-silver raised operator/feeding platform (X=-2.22..-1.26, Y=1.12..1.26, Z=-0.56..+1.10),
    structural square-tube support frame underneath, sloped platform feeder box with twin dark panels,
    and lower mobile auxiliary cart on swivel casters (clearly seen in trans_02.jpg & trans_03.jpg!).
    """
    bm = bmesh.new()

    # 1. Thick brushed-silver platform landing deck slab (mat 0 = brushed_steel)
    add_box_three(bm, -1.74, 1.19, 0.27, 0.98, 0.14, 1.68, bevel=0.010, mat_index=0)
    # Recessed lower apron skirt under landing front edge
    add_box_three(bm, -1.74, 1.07, 0.27, 0.88, 0.12, 1.56, bevel=0.006, mat_index=1)

    # 2. 6 Heavy vertical square-tube legs supporting platform down to floor Y = 0
    leg_xs = (-2.12, -1.36)
    leg_zs = (-0.48, 0.30, 0.98)
    for lx in leg_xs:
        for lz in leg_zs:
            add_box_three(bm, lx, 0.56, lz, 0.075, 1.12, 0.075, bevel=0.004, mat_index=1)

    # Horizontal structural frame tie-beams at Y = 0.38 and Y = 0.98
    for by in (0.38, 0.98):
        for lx in leg_xs:
            add_box_three(bm, lx, by, 0.25, 0.06, 0.06, 1.52, bevel=0.003, mat_index=1)
        for lz in leg_zs:
            add_box_three(bm, -1.74, by, lz, 0.80, 0.06, 0.06, bevel=0.003, mat_index=1)

    # 3. Platform-mounted feeder housing box with twin dark panels (visible behind yellow gate in trans_02.jpg & trans_04.jpg)
    add_box_three(bm, -1.74, 1.56, 0.42, 0.56, 0.58, 0.72, bevel=0.015, mat_index=0)
    # Twin dark recessed observation/access panels facing +Z
    for px in (-1.86, -1.62):
        add_box_three(bm, px, 1.56, 0.785, 0.18, 0.36, 0.012, bevel=0.003, mat_index=2)
    # Angled silver trim side cheek on +X face
    add_box_three(bm, -1.44, 1.56, 0.42, 0.05, 0.54, 0.68, bevel=0.008, mat_index=3)

    # 4. Lower mobile feeder / dust-collector sub-cabinet on caster wheels under platform (trans_03.jpg)
    add_box_three(bm, -1.74, 0.68, -0.02, 0.64, 0.62, 0.92, bevel=0.012, mat_index=1)
    # Swivel caster wheels at bottom of sub-cabinet (mat 4 = rubber_black)
    for wx in (-1.98, -1.50):
        for wz in (-0.38, 0.34):
            add_box_three(bm, wx, 0.34, wz, 0.05, 0.06, 0.05, mat_index=2)
            add_cylinder_three(bm, wx, 0.28, wz, 0.042, 0.032, axis='Z', segs=16, mat_index=4)

    # 5. Rear background auxiliary service unit tucked behind platform (visible in crop_rollers.jpg left background)
    add_box_three(bm, -1.52, 0.48, -0.96, 0.68, 0.84, 0.64, bevel=0.010, mat_index=1)
    # Top ventilation riser blocks
    for rx in (-1.72, -1.52, -1.32):
        add_box_three(bm, rx, 0.96, -0.96, 0.14, 0.14, 0.52, bevel=0.005, mat_index=0)
    # Lower dark intake louver grilles on +Z face
    for gx in (-1.68, -1.36):
        add_box_three(bm, gx, 0.18, -0.635, 0.18, 0.09, 0.012, mat_index=2)
    # Caster wheels under rear service unit
    for wx in (-1.76, -1.28):
        for wz in (-1.18, -0.74):
            add_cylinder_three(bm, wx, 0.04, wz, 0.04, 0.03, axis='Z', segs=14, mat_index=4)

    return finish_bmesh_object(
        "Feeding_Platform_And_SubFrame",
        bm,
        col,
        [mats["brushed_steel"], mats["satin_steel_mid"], mats["dark_steel"], mats["bright_steel"], mats["rubber_black"]],
        part_id="feeding_platform",
        role="static",
        smooth=False,
    )


# =============================================================================
# 3. VERTICAL POWDER HOPPER TOWER & CANTILEVERED DOSING TABLE
# =============================================================================

def build_powder_hopper_assembly(col, mats):
    """
    Dark charcoal steel hopper gantry tower, mirror-polished stainless cylindrical-to-conical
    dry-electrode powder hopper, and cantilevered horizontal precision dosing tray extending
    directly over the R1-R2 feed nip.
    """
    bm = bmesh.new()

    hx, hz = -1.74, 0.0

    # 1. Dark Charcoal Structural Gantry Tower framing the hopper (Y=1.82..3.18, mat 0 = dark_steel)
    col_xs = (hx - 0.30, hx + 0.30)
    col_zs = (hz - 0.34, hz + 0.34)
    for cx in col_xs:
        for cz in col_zs:
            add_box_three(bm, cx, 2.50, cz, 0.085, 1.36, 0.085, bevel=0.006, mat_index=0)

    # Top dark header frame beams (Y = 3.14)
    add_box_three(bm, hx, 3.14, hz - 0.34, 0.68, 0.09, 0.09, bevel=0.006, mat_index=0)
    add_box_three(bm, hx, 3.14, hz + 0.34, 0.68, 0.09, 0.09, bevel=0.006, mat_index=0)
    add_box_three(bm, hx - 0.30, 3.14, hz, 0.09, 0.09, 0.76, bevel=0.006, mat_index=0)
    add_box_three(bm, hx + 0.30, 3.14, hz, 0.09, 0.09, 0.76, bevel=0.006, mat_index=0)
    # Mid support cross-collar beams at Y = 2.30
    add_box_three(bm, hx - 0.30, 2.30, hz, 0.07, 0.07, 0.72, bevel=0.004, mat_index=0)
    add_box_three(bm, hx + 0.30, 2.30, hz, 0.07, 0.07, 0.72, bevel=0.004, mat_index=0)

    # 2. Polished Stainless Steel Powder Hopper (mat 1 = bright_steel, mat 2 = chrome)
    # Upper cylindrical feed inlet pipe (Y = 2.86..3.12)
    add_cylinder_three(bm, hx, 2.99, hz, 0.12, 0.26, axis='Y', segs=40, bevel=0.004, mat_index=2)
    # Upper bolted flange ring
    add_cylinder_three(bm, hx, 2.84, hz, 0.285, 0.035, axis='Y', segs=48, bevel=0.005, mat_index=1)
    # Main cylindrical hopper drum (Y = 2.26..2.84)
    add_cylinder_three(bm, hx, 2.55, hz, 0.265, 0.58, axis='Y', segs=48, mat_index=2)
    # Conical tapering funnel (Y = 1.84..2.26)
    add_cone_three(bm, hx, 2.05, hz, r_bottom=0.095, r_top=0.265, height=0.42, segs=48, mat_index=1)
    # Lower dosing discharge collar
    add_cylinder_three(bm, hx, 1.80, hz, 0.105, 0.09, axis='Y', segs=32, mat_index=0)

    # 3. Cantilevered Precision Horizontal Feeding / Dosing Table extending right toward R1-R2
    # Main silver table carriage (X = -1.74..-0.98, Y = 1.76..1.84, Z = -0.44..+0.44)
    add_box_three(bm, -1.36, 1.80, 0.0, 0.78, 0.08, 0.88, bevel=0.006, mat_index=3)
    # Dark machined flat dosing plate protruding directly over R1-R2 feed box (X = -1.42..-0.90)
    add_box_three(bm, -1.16, 1.855, 0.0, 0.56, 0.035, 0.80, bevel=0.004, mat_index=0)
    # Twin upper side guide rails along table sides (visible in trans_03.jpg & crop_rollers.jpg!)
    for gz in (-0.41, +0.41):
        add_box_three(bm, -1.38, 1.94, gz, 0.72, 0.12, 0.045, bevel=0.005, mat_index=3)
        add_box_three(bm, -1.38, 2.01, gz, 0.72, 0.025, 0.055, bevel=0.003, mat_index=0)
    # Under-table reinforcement bracket beam connecting back to platform frame
    add_box_three(bm, -1.38, 1.66, 0.0, 0.62, 0.18, 0.76, bevel=0.008, mat_index=3)

    return finish_bmesh_object(
        "Powder_Hopper_And_Dosing_Tower",
        bm,
        col,
        [mats["dark_steel"], mats["bright_steel"], mats["chrome"], mats["brushed_steel"]],
        part_id="powder_hopper",
        role="static",
        smooth=True,
    )


# =============================================================================
# 4. AUXILIARY THERMAL / HYDRAULIC CABINET & TALL REAR PLC CABINET
# =============================================================================

def _add_rounded_window_box(bm, cx, cy, cz, w, h, d, face_axis='X', corner_r=0.045, mat_index=1):
    """
    Create a crisp rounded-corner dark glass observation window flush on a cabinet face
    (matching the iconic rounded-rectangle black windows on the right-hand unit in crop_right.jpg!).
    """
    # Build rounded rectangle polygon in local XY, then orient along face_axis
    pts = []
    hw = w * 0.5
    hh = h * 0.5
    cr = min(corner_r, hw * 0.45, hh * 0.45)
    corners = [
        ( hw - cr,  hh - cr,   0.0,  90.0),
        (-hw + cr,  hh - cr,  90.0, 180.0),
        (-hw + cr, -hh + cr, 180.0, 270.0),
        ( hw - cr, -hh + cr, 270.0, 360.0),
    ]
    for (kx, ky, a0, a1) in corners:
        for s in range(5):
            ang = math.radians(a0 + (a1 - a0) * (s / 4.0))
            pts.append((kx + cr * math.cos(ang), ky + cr * math.sin(ang)))

    sub = bmesh.new()
    if face_axis == 'Z':
        v0 = [sub.verts.new((cx + px, cy + py, cz - d * 0.5)) for (px, py) in pts]
        v1 = [sub.verts.new((cx + px, cy + py, cz + d * 0.5)) for (px, py) in pts]
    else:  # face_axis == 'X' (width spans Z, height spans Y)
        v0 = [sub.verts.new((cx - d * 0.5, cy + py, cz + px)) for (px, py) in pts]
        v1 = [sub.verts.new((cx + d * 0.5, cy + py, cz + px)) for (px, py) in pts]

    n = len(pts)
    sub.faces.new(v1)
    sub.faces.new(list(reversed(v0)))
    for i in range(n):
        j = (i + 1) % n
        sub.faces.new((v0[i], v0[j], v1[j], v1[i]))

    from cm700_lib import _bm_transform_three_to_blender, _merge_bmesh
    _bm_transform_three_to_blender(sub)
    for f in sub.faces:
        f.material_index = mat_index
    _merge_bmesh(bm, sub)
    sub.free()


def build_auxiliary_cabinets(col, mats):
    """
    Build the two auxiliary industrial cabinets visible on the right/rear-right of frame_01.jpg:
      1. Front-right Medium Thermal/Hydraulic Unit (brushed steel, rounded-corner black
         windows, recessed chrome door latches, and twin columns of 11 horizontal louver slots!)
      2. Tall Rear 2-Bay PLC / Main Electrical Power Cabinet
    """
    # --- Unit A: Thermal / Mold-Temperature / Hydraulic Unit ---
    bm_therm = bmesh.new()
    tu = _LAY["thermalUnit"]
    tx0, tx1 = float(tu["x"][0]), float(tu["x"][1])
    ty0, ty1 = float(tu["y"][0]), float(tu["y"][1])
    tz0, tz1 = float(tu["z"][0]), float(tu["z"][1])
    tcx, tcy, tcz = 0.5 * (tx0 + tx1), 0.5 * (ty0 + ty1), 0.5 * (tz0 + tz1)
    tsx, tsy, tsz = tx1 - tx0, ty1 - ty0, tz1 - tz0

    # Main brushed-steel enclosure (mat 0 = brushed_steel)
    add_box_three(bm_therm, tcx, tcy, tcz, tsx, tsy, tsz, bevel=0.018, mat_index=0)

    # +Z Face (facing left-front in crop_right.jpg): 2 panel bays — left narrow bay + right door with broad rounded window & 2 louver columns
    # Door seam lines on +Z face (mat 2 = dark_steel)
    add_box_three(bm_therm, tx0 + 0.38, tcy, tz1 + 0.002, 0.006, tsy - 0.10, 0.006, mat_index=2)
    add_box_three(bm_therm, tx1 - 0.05, tcy, tz1 + 0.002, 0.006, tsy - 0.10, 0.006, mat_index=2)
    add_box_three(bm_therm, tcx + 0.16, ty0 + 0.05, tz1 + 0.002, tsx - 0.44, 0.006, 0.006, mat_index=2)
    add_box_three(bm_therm, tcx + 0.16, ty1 - 0.05, tz1 + 0.002, tsx - 0.44, 0.006, 0.006, mat_index=2)
    # Broad rounded black window on +Z door
    _add_rounded_window_box(bm_therm, tx0 + 0.78, 0.80, tz1 + 0.004, w=0.38, h=0.28, d=0.014, face_axis='Z', corner_r=0.055, mat_index=1)
    # Recessed chrome latch handle on +Z door
    add_box_three(bm_therm, tx0 + 0.45, 0.50, tz1 + 0.008, 0.022, 0.085, 0.016, bevel=0.003, mat_index=3)
    # Two columns of 11 horizontal louver slots on +Z door
    for col_x in (tx0 + 0.62, tx0 + 0.94):
        for li in range(11):
            ly = 0.14 + li * 0.029
            add_box_three(bm_therm, col_x, ly, tz1 + 0.004, 0.13, 0.011, 0.010, mat_index=2)

    # +X Face (facing right-front in crop_right.jpg): TWO symmetric doors, each with a rounded black window + 2 louver columns!
    add_box_three(bm_therm, tx1 + 0.002, tcy, tcz, 0.006, tsy - 0.10, 0.006, mat_index=2)
    for door_z in (tz0 + 0.30, tz1 - 0.30):
        # Perimeter seam around each door
        add_box_three(bm_therm, tx1 + 0.002, ty1 - 0.05, door_z, 0.006, 0.006, 0.52, mat_index=2)
        add_box_three(bm_therm, tx1 + 0.002, ty0 + 0.05, door_z, 0.006, 0.006, 0.52, mat_index=2)
        # Rounded black observation window
        _add_rounded_window_box(bm_therm, tx1 + 0.004, 0.80, door_z, w=0.24, h=0.27, d=0.014, face_axis='X', corner_r=0.05, mat_index=1)
        # Recessed vertical latch handle
        add_box_three(bm_therm, tx1 + 0.008, 0.50, door_z + 0.22, 0.016, 0.085, 0.020, bevel=0.003, mat_index=3)
        # Two columns of 11 horizontal louver slots per door
        for lz_off in (-0.12, +0.12):
            for li in range(11):
                ly = 0.14 + li * 0.029
                add_box_three(bm_therm, tx1 + 0.004, ly, door_z + lz_off, 0.010, 0.011, 0.12, mat_index=2)

    therm_obj = finish_bmesh_object(
        "Auxiliary_Thermal_Hydraulic_Unit",
        bm_therm,
        col,
        [mats["brushed_steel"], mats["dark_glass"], mats["dark_steel"], mats["chrome"]],
        part_id="aux_thermal_unit",
        role="static",
        smooth=False,
    )

    # --- Unit B: Tall Rear 2-Bay PLC / Main Electrical Power Cabinet ---
    bm_elec = bmesh.new()
    ec = _LAY["electricalCabinet"]
    ex0, ex1 = float(ec["x"][0]), float(ec["x"][1])
    ey0, ey1 = float(ec["y"][0]), float(ec["y"][1])
    ez0, ez1 = float(ec["z"][0]), float(ec["z"][1])
    ecx, ecy, ecz = 0.5 * (ex0 + ex1), 0.5 * (ey0 + ey1), 0.5 * (ez0 + ez1)
    esx, esy, esz = ex1 - ex0, ey1 - ey0, ez1 - ez0

    # Two distinct brushed-steel cabinet bays side-by-side along X (matching the tall twin block behind the rear cabinet in frame_01.jpg!)
    bay1_w = 0.78
    bay2_w = 0.86
    add_box_three(bm_elec, ex0 + bay1_w * 0.5, ecy, ecz, bay1_w, esy, esz, bevel=0.015, mat_index=0)
    add_box_three(bm_elec, ex0 + bay1_w + 0.02 + bay2_w * 0.5, ecy, ecz, bay2_w, esy, esz, bevel=0.015, mat_index=0)
    # Recessed dark vertical seam channel between the two electrical bays
    add_box_three(bm_elec, ex0 + bay1_w + 0.01, ecy, ecz, 0.022, esy - 0.06, esz - 0.04, mat_index=1)
    # Subtle rear ventilation grilles & cable busway conduit bridge connecting to main rear drive cabinet
    add_box_three(bm_elec, 0.15, 1.72, -1.54, 0.65, 0.18, 0.30, bevel=0.008, mat_index=2)
    for lv in range(8):
        add_box_three(bm_elec, ex1 + 0.003, 0.25 + lv * 0.04, ecz, 0.008, 0.014, 0.52, mat_index=1)

    elec_obj = finish_bmesh_object(
        "Rear_Electrical_PLC_Cabinet",
        bm_elec,
        col,
        [mats["brushed_steel"], mats["dark_steel"], mats["satin_steel_mid"]],
        part_id="electrical_cabinet",
        role="static",
        smooth=False,
    )

    return [therm_obj, elec_obj]


def build_all_peripherals(col, mats):
    objs = [
        build_safety_staircase(col, mats),
        build_feeding_platform(col, mats),
        build_powder_hopper_assembly(col, mats),
    ]
    objs.extend(build_auxiliary_cabinets(col, mats))
    return objs
