"""
cm700_lib.py
Shared Blender 4.3.2 CAD geometry primitives, coordinate transforms,
PBR material library, and exact circle-to-circle web-path mathematics
for the CM-700MM Multi-Roll Dry-Electrode Film-Making Equipment (多辊制膜设备).

Coordinate convention:
  Three.js space: +X right (feeding -> calendering -> winding -> cabinets),
                  +Y up (floor at Y = 0),
                  +Z front (operator side, sliding CM-700MM housing).
  Blender space:  +X right, -Y front, +Z up.
  to_blender(xt, yt, zt) = (xt, -zt, yt)  [det = +1, pure +90 deg X rotation]
  When exported via glTF with export_yup=True, coordinates map 1:1 to Three.js!
"""

import os
import json
import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def load_machine_config():
    """Load unified Single Source of Truth specs/machine_config.json."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    cfg_path = os.path.join(project_dir, "specs", "machine_config.json")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)

DEG2RAD = math.pi / 180.0

T2B_MAT3 = Matrix((
    (1.0,  0.0,  0.0),
    (0.0,  0.0, -1.0),
    (0.0,  1.0,  0.0),
))
T2B_MAT4 = T2B_MAT3.to_4x4()


def to_blender(x_t, y_t=0.0, z_t=0.0):
    """Convert Three.js (x, y, z) to Blender (x, -z, y)."""
    if isinstance(x_t, Vector):
        return Vector((x_t.x, -x_t.z, x_t.y))
    return Vector((float(x_t), float(-z_t), float(y_t)))


def reset_scene():
    """Clear default Blender scene completely."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)
    for curve in list(bpy.data.curves):
        bpy.data.curves.remove(curve, do_unlink=True)


def get_or_create_collection(name, parent=None):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    if parent is None:
        bpy.context.scene.collection.children.link(col)
    else:
        parent.children.link(col)
    return col


def _set_bsdf(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def make_pbr_material(
    name,
    base_color=(0.75, 0.75, 0.75, 1.0),
    metallic=0.0,
    roughness=0.4,
    alpha=1.0,
    coat=0.0,
    emission=(0.0, 0.0, 0.0, 1.0),
    emission_strength=0.0,
    base_color_image=None,
    roughness_image=None,
    normal_image=None,
    normal_strength=0.22,
    emission_image=None,
):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

    if len(base_color) == 3:
        base_color = (base_color[0], base_color[1], base_color[2], 1.0)
    if len(emission) == 3:
        emission = (emission[0], emission[1], emission[2], 1.0)

    _set_bsdf(bsdf, "Base Color", base_color)
    _set_bsdf(bsdf, "Metallic", float(metallic))
    _set_bsdf(bsdf, "Roughness", float(roughness))
    _set_bsdf(bsdf, "Alpha", float(alpha))
    _set_bsdf(bsdf, "Coat Weight", float(coat))
    _set_bsdf(bsdf, "Emission Color", emission)
    _set_bsdf(bsdf, "Emission Strength", float(emission_strength))

    if base_color_image is not None:
        tex_col = nt.nodes.new("ShaderNodeTexImage")
        tex_col.image = base_color_image
        tex_col.location = (-420, 260)
        nt.links.new(tex_col.outputs["Color"], bsdf.inputs["Base Color"])

    if emission_image is not None and "Emission Color" in bsdf.inputs:
        tex_em = nt.nodes.new("ShaderNodeTexImage")
        tex_em.image = emission_image
        tex_em.location = (-420, 40)
        nt.links.new(tex_em.outputs["Color"], bsdf.inputs["Emission Color"])

    if roughness_image is not None and "Roughness" in bsdf.inputs:
        tex_r = nt.nodes.new("ShaderNodeTexImage")
        tex_r.image = roughness_image
        tex_r.location = (-420, -180)
        nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_image is not None and "Normal" in bsdf.inputs:
        tex_n = nt.nodes.new("ShaderNodeTexImage")
        tex_n.image = normal_image
        tex_n.location = (-560, -420)
        norm_map = nt.nodes.new("ShaderNodeNormalMap")
        norm_map.inputs["Strength"].default_value = float(normal_strength)
        norm_map.location = (-260, -420)
        nt.links.new(tex_n.outputs["Color"], norm_map.inputs["Color"])
        nt.links.new(norm_map.outputs["Normal"], bsdf.inputs["Normal"])

    if alpha < 0.999:
        mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else 'OPAQUE'
    return mat


def create_material_library(tex_pack=None):
    """Industrial PBR materials with procedural brushed stainless, radial CNC grooves & HMI UI."""
    tp = tex_pack or {}
    return {
        # Main cabinets & sheet metal: directional brushed cool satin stainless steel
        "brushed_steel": make_pbr_material(
            "Mat_BrushedSteel", (0.64, 0.66, 0.68, 1.0), metallic=0.78, roughness=0.33,
            roughness_image=tp.get("brushed_roughness"),
            normal_image=tp.get("brushed_normal"),
            normal_strength=0.22,
        ),
        # Slightly brighter panel trim / platform edges
        "bright_steel": make_pbr_material(
            "Mat_BrightSteel", (0.78, 0.80, 0.82, 1.0), metallic=0.86, roughness=0.22,
            normal_image=tp.get("brushed_normal"),
            normal_strength=0.14,
        ),
        # Darker satin stainless for recessed grooves, base frames, rear cabinets
        "satin_steel_mid": make_pbr_material(
            "Mat_SatinSteelMid", (0.48, 0.50, 0.53, 1.0), metallic=0.78, roughness=0.38,
            roughness_image=tp.get("brushed_roughness"),
            normal_image=tp.get("brushed_normal"),
            normal_strength=0.20,
        ),
        # Machined aluminum / cast steel bearing housing covers with CNC concentric turning rings!
        "machined_bearing": make_pbr_material(
            "Mat_MachinedBearing", (0.72, 0.74, 0.76, 1.0), metallic=0.88, roughness=0.26,
            roughness_image=tp.get("turned_roughness"),
            normal_image=tp.get("turned_normal"),
            normal_strength=0.34,
        ),
        # Mirror chrome shafts, guide roll caps, HMI grab rails
        "chrome": make_pbr_material(
            "Mat_Chrome", (0.88, 0.90, 0.93, 1.0), metallic=0.96, roughness=0.10
        ),
        # Hardened polished alloy steel calender roll barrels (dark reflective gunmetal)
        "roller_barrel": make_pbr_material(
            "Mat_RollerBarrel", (0.09, 0.10, 0.115, 1.0), metallic=0.88, roughness=0.20, coat=0.25,
            normal_image=tp.get("brushed_normal"),
            normal_strength=0.08,
        ),
        # Guide roller body (matte-satin dark graphite alloy)
        "guide_roller": make_pbr_material(
            "Mat_GuideRoller", (0.12, 0.13, 0.145, 1.0), metallic=0.76, roughness=0.28
        ),
        # Dark charcoal steel (hopper gantry tower, tie-rods, fasteners, vents)
        "dark_steel": make_pbr_material(
            "Mat_DarkSteel", (0.055, 0.06, 0.068, 1.0), metallic=0.60, roughness=0.36
        ),
        # Deep tinted glossy observation glass windows (rich obsidian-black)
        "dark_glass": make_pbr_material(
            "Mat_DarkGlass", (0.014, 0.016, 0.020, 1.0), metallic=0.06, roughness=0.07, coat=0.65
        ),
        # HMI recessed LCD touchscreen with crisp live SCADA UI graphic
        "hmi_screen": make_pbr_material(
            "Mat_HMIScreen", (0.10, 0.12, 0.15, 1.0), metallic=0.05, roughness=0.10, coat=0.55,
            base_color_image=tp.get("hmi_ui"),
            emission_image=tp.get("hmi_ui"),
            emission_strength=0.65 if tp.get("hmi_ui") is not None else 0.0,
        ),
        # Clean industrial off-white enamel (HMI enclosure, cantilever gantry arm, console deck)
        "enamel_white": make_pbr_material(
            "Mat_EnamelWhite", (0.88, 0.89, 0.91, 1.0), metallic=0.08, roughness=0.26, coat=0.18
        ),
        # Powder-coated safety yellow-gold (staircase & guardrails)
        "safety_gold": make_pbr_material(
            "Mat_SafetyGold", (0.64, 0.43, 0.055, 1.0), metallic=0.68, roughness=0.27, coat=0.22
        ),
        # Dry-electrode carbon film web (deep satin carbon-black with fine pressed powder micro-grain)
        "electrode_film": make_pbr_material(
            "Mat_ElectrodeFilm", (0.032, 0.036, 0.042, 1.0), metallic=0.26, roughness=0.28, coat=0.32,
            roughness_image=tp.get("electrode_roughness"),
        ),
        # Luminous cyan process glow (powder box edges, active calender nip)
        "glow_cyan": make_pbr_material(
            "Mat_GlowCyan",
            (0.18, 0.82, 1.0, 1.0),
            metallic=0.0,
            roughness=0.2,
            emission=(0.14, 0.80, 1.0, 1.0),
            emission_strength=4.0,
        ),
        # Luminous cool-white edge trace along finished film web
        "glow_web_edge": make_pbr_material(
            "Mat_GlowWebEdge",
            (0.86, 0.95, 1.0, 1.0),
            metallic=0.0,
            roughness=0.2,
            emission=(0.75, 0.92, 1.0, 1.0),
            emission_strength=3.0,
        ),
        # Translucent cyan powder feed chute box
        "powder_box_glass": make_pbr_material(
            "Mat_PowderBoxGlass",
            (0.16, 0.76, 1.0, 1.0),
            metallic=0.0,
            roughness=0.12,
            alpha=0.20,
            emission=(0.10, 0.65, 1.0, 1.0),
            emission_strength=0.65,
        ),
        # Brand lettering CM-700MM (high-contrast matte anodized dark slate)
        "brand_text": make_pbr_material(
            "Mat_BrandText", (0.11, 0.12, 0.14, 1.0), metallic=0.12, roughness=0.68
        ),
        # Industrial push buttons
        "btn_green": make_pbr_material(
            "Mat_BtnGreen", (0.10, 0.68, 0.20, 1.0), metallic=0.04, roughness=0.25,
            emission=(0.06, 0.55, 0.14, 1.0), emission_strength=0.45
        ),
        "btn_red": make_pbr_material(
            "Mat_BtnRed", (0.85, 0.20, 0.12, 1.0), metallic=0.04, roughness=0.25,
            emission=(0.72, 0.14, 0.06, 1.0), emission_strength=0.40
        ),
        "btn_yellow": make_pbr_material(
            "Mat_BtnYellow", (0.94, 0.64, 0.06, 1.0), metallic=0.06, roughness=0.28
        ),
        "rubber_black": make_pbr_material(
            "Mat_RubberBlack", (0.04, 0.04, 0.045, 1.0), metallic=0.02, roughness=0.75
        ),
    }


def _apply_smooth_and_normals(bm, smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = smooth


def _assign_bmesh_uvs(bm, uv_mode="box", uv_scale=1.15, radial_radius=0.265):
    """
    Generate clean distortion-free UVs on every bmesh before mesh export so
    brushed stainless streaks, concentric CNC radial turning grooves, and
    electrode micro-grain render crisply in both Blender Cycles and Three.js!

    Note: bm vertices are already in Blender coordinates (xb=x_t, yb=-z_t, zb=y_t).
    """
    uv_layer = bm.loops.layers.uv.verify()
    bm.faces.ensure_lookup_table()
    inv_2r = 0.5 / max(radial_radius, 0.02)

    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        if uv_mode == "radial":
            # In Blender local roller space, shaft axis is Y (Three.js Z), roller disk is XZ!
            if ay >= 0.45:
                # End cap / bearing cover face: center concentric turning map at (0.5, 0.5)!
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_layer].uv = (0.5 + co.x * inv_2r, 0.5 + co.z * inv_2r)
            else:
                # Cylindrical barrel surface: wrap around circumference (U) & shaft length (V)
                for loop in f.loops:
                    co = loop.vert.co
                    ang = math.atan2(co.z, co.x)
                    u = (ang / (2.0 * math.pi) + 0.5) * (2.0 * math.pi * radial_radius * uv_scale)
                    v = co.y * uv_scale
                    loop[uv_layer].uv = (u, v)
        else:
            # Clean world-metric triplanar box projection (horizontal brushed grain runs along U!)
            if ax >= ay and ax >= az:
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_layer].uv = (co.y * uv_scale, co.z * uv_scale)
            elif ay >= ax and ay >= az:
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_layer].uv = (co.x * uv_scale, co.z * uv_scale)
            else:
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_layer].uv = (co.x * uv_scale, co.y * uv_scale)


def finish_bmesh_object(
    name,
    bm,
    col,
    mat,
    part_id,
    role="static",
    extras=None,
    smooth=False,
    location_three=(0.0, 0.0, 0.0),
    uv_mode="box",
    uv_scale=1.15,
    radial_radius=0.265,
):
    """Convert bmesh (authored in Blender local space) to a Blender Mesh Object with UVs."""
    _apply_smooth_and_normals(bm, smooth=smooth)
    _assign_bmesh_uvs(bm, uv_mode=uv_mode, uv_scale=uv_scale, radial_radius=radial_radius)
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = to_blender(*location_three)
    col.objects.link(obj)
    if mat is not None:
        if isinstance(mat, (list, tuple)):
            for m in mat:
                obj.data.materials.append(m)
        else:
            obj.data.materials.append(mat)

    obj["partId"] = part_id
    obj["role"] = role
    if extras:
        for k, v in extras.items():
            obj[k] = v
    return obj


def _bm_transform_three_to_blender(bm):
    """Transform all vertices of a bmesh built in Three.js coordinates into Blender coordinates."""
    bmesh.ops.transform(bm, matrix=T2B_MAT4, verts=bm.verts)


def add_box_three(bm, cx, cy, cz, sx, sy, sz, bevel=0.0, segments=2, mat_index=0):
    """Append an axis-aligned box in Three.js coords (converted to Blender space) to bm."""
    sub = bmesh.new()
    bmesh.ops.create_cube(sub, size=1.0)
    scale_m = Matrix.Diagonal((sx, sy, sz, 1.0))
    trans_m = Matrix.Translation((cx, cy, cz))
    bmesh.ops.transform(sub, matrix=trans_m @ scale_m, verts=sub.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            sub,
            geom=list(sub.edges),
            offset=min(bevel, min(sx, sy, sz) * 0.45),
            offset_type='OFFSET',
            segments=segments,
            profile=0.5,
            affect='EDGES',
            clamp_overlap=True,
        )
    _bm_transform_three_to_blender(sub)
    for f in sub.faces:
        f.material_index = mat_index
    _merge_bmesh(bm, sub)
    sub.free()


def add_cylinder_three(bm, cx, cy, cz, radius, length, axis='Z', segs=48, cap_ends=True, bevel=0.0, mat_index=0):
    """Append a cylinder along Three.js 'X', 'Y', or 'Z' axis to bm."""
    sub = bmesh.new()
    bmesh.ops.create_cone(
        sub,
        cap_ends=cap_ends,
        cap_tris=False,
        segments=segs,
        radius1=radius,
        radius2=radius,
        depth=length,
    )
    # Default create_cone is along local Z.
    if axis == 'X':
        rot = Matrix.Rotation(math.pi * 0.5, 4, 'Y')
    elif axis == 'Y':
        rot = Matrix.Rotation(math.pi * 0.5, 4, 'X')
    else:
        rot = Matrix.Identity(4)
    trans = Matrix.Translation((cx, cy, cz))
    bmesh.ops.transform(sub, matrix=trans @ rot, verts=sub.verts)
    if bevel > 0.0 and cap_ends:
        # Bevel end cap boundary edges only
        end_edges = [e for e in sub.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.2]
        if end_edges:
            bmesh.ops.bevel(
                sub,
                geom=end_edges,
                offset=min(bevel, radius * 0.4, length * 0.4),
                offset_type='OFFSET',
                segments=2,
                profile=0.5,
                affect='EDGES',
                clamp_overlap=True,
            )
    _bm_transform_three_to_blender(sub)
    for f in sub.faces:
        f.material_index = mat_index
    _merge_bmesh(bm, sub)
    sub.free()


def add_cone_three(bm, cx, cy, cz, r_bottom, r_top, height, segs=48, cap_ends=True, mat_index=0):
    """Append a vertical frustum/cone along Three.js +Y (r_bottom at cy-h/2, r_top at cy+h/2)."""
    sub = bmesh.new()
    bmesh.ops.create_cone(
        sub,
        cap_ends=cap_ends,
        cap_tris=False,
        segments=segs,
        radius1=r_bottom,
        radius2=r_top,
        depth=height,
    )
    # Local +Z -> Three.js +Y via -90 deg X rotation
    rot = Matrix.Rotation(-math.pi * 0.5, 4, 'X')
    trans = Matrix.Translation((cx, cy, cz))
    bmesh.ops.transform(sub, matrix=trans @ rot, verts=sub.verts)
    _bm_transform_three_to_blender(sub)
    for f in sub.faces:
        f.material_index = mat_index
    _merge_bmesh(bm, sub)
    sub.free()


def add_cylinder_between_three(bm, p0, p1, radius, segs=20, cap_ends=True, mat_index=0):
    """Append a round rod/tube from Three.js point p0 to p1."""
    v0 = Vector(p0)
    v1 = Vector(p1)
    dv = v1 - v0
    length = dv.length
    if length < 1e-6:
        return
    mid = (v0 + v1) * 0.5
    z_axis = Vector((0.0, 0.0, 1.0))
    quat = z_axis.rotation_difference(dv.normalized())
    sub = bmesh.new()
    bmesh.ops.create_cone(
        sub,
        cap_ends=cap_ends,
        cap_tris=False,
        segments=segs,
        radius1=radius,
        radius2=radius,
        depth=length,
    )
    m = Matrix.Translation(mid) @ quat.to_matrix().to_4x4()
    bmesh.ops.transform(sub, matrix=m, verts=sub.verts)
    _bm_transform_three_to_blender(sub)
    for f in sub.faces:
        f.material_index = mat_index
    _merge_bmesh(bm, sub)
    sub.free()


def add_sphere_three(bm, cx, cy, cz, radius, segs=16, rings=10, mat_index=0):
    sub = bmesh.new()
    bmesh.ops.create_uvsphere(sub, u_segments=segs, v_segments=rings, radius=radius)
    bmesh.ops.transform(sub, matrix=Matrix.Translation((cx, cy, cz)), verts=sub.verts)
    _bm_transform_three_to_blender(sub)
    for f in sub.faces:
        f.material_index = mat_index
    _merge_bmesh(bm, sub)
    sub.free()


def add_pipe_path_three(bm, points, radius, segs=18, corner_radius=0.05, corner_segs=6, mat_index=0):
    """Create a smooth rounded tubular rail along a 3D polyline in Three.js space."""
    pts = [Vector(p) for p in points]
    if len(pts) < 2:
        return
    # Fillet sharp corners with circular arc points
    smooth_pts = [pts[0]]
    for i in range(1, len(pts) - 1):
        p_prev = pts[i - 1]
        p_curr = pts[i]
        p_next = pts[i + 1]
        v_in = p_prev - p_curr
        v_out = p_next - p_curr
        l_in = v_in.length
        l_out = v_out.length
        if l_in < 1e-5 or l_out < 1e-5:
            continue
        u_in = v_in.normalized()
        u_out = v_out.normalized()
        dot = max(-0.999, min(0.999, u_in.dot(u_out)))
        if dot < -0.995:
            smooth_pts.append(p_curr)
            continue
        half_ang = 0.5 * math.acos(dot)
        tan_len = min(corner_radius / max(0.05, math.tan(half_ang)), l_in * 0.42, l_out * 0.42)
        p_start = p_curr + u_in * tan_len
        p_end = p_curr + u_out * tan_len
        # Quadratic Bezier arc through corner
        for s in range(corner_segs + 1):
            t = s / corner_segs
            omt = 1.0 - t
            p_arc = (omt * omt) * p_start + (2.0 * omt * t) * p_curr + (t * t) * p_end
            smooth_pts.append(p_arc)
    smooth_pts.append(pts[-1])

    # Sweep circular rings along smooth_pts using parallel transport frame
    sub = bmesh.new()
    rings = []
    tangents = []
    for i in range(len(smooth_pts)):
        if i == 0:
            t = (smooth_pts[1] - smooth_pts[0]).normalized()
        elif i == len(smooth_pts) - 1:
            t = (smooth_pts[-1] - smooth_pts[-2]).normalized()
        else:
            t = (smooth_pts[i + 1] - smooth_pts[i - 1]).normalized()
        tangents.append(t)

    # Initial normal
    t0 = tangents[0]
    ref = Vector((0.0, 1.0, 0.0)) if abs(t0.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    n = (ref - t0 * ref.dot(t0)).normalized()
    b = t0.cross(n).normalized()

    for i, p in enumerate(smooth_pts):
        if i > 0:
            q = tangents[i - 1].rotation_difference(tangents[i])
            n = (q @ n).normalized()
            n = (n - tangents[i] * n.dot(tangents[i])).normalized()
            b = tangents[i].cross(n).normalized()
        ring = []
        for s in range(segs):
            ang = 2.0 * math.pi * s / segs
            v_pos = p + (n * math.cos(ang) + b * math.sin(ang)) * radius
            ring.append(sub.verts.new(v_pos))
        rings.append(ring)

    for i in range(len(rings) - 1):
        r0 = rings[i]
        r1 = rings[i + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            f = sub.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
            f.material_index = mat_index

    # End caps
    f_start = sub.faces.new(list(reversed(rings[0])))
    f_start.material_index = mat_index
    f_end = sub.faces.new(rings[-1])
    f_end.material_index = mat_index

    _bm_transform_three_to_blender(sub)
    _merge_bmesh(bm, sub)
    sub.free()


def add_extruded_xy_polygon_three(bm, pts_xy, z0, z1, bevel=0.0, mat_index=0):
    """
    Extrude a 2D polygon in the Three.js X-Y plane from Z=z0 to Z=z1 (z1 > z0).
    pts_xy must be ordered counter-clockwise in the XY plane.
    """
    sub = bmesh.new()
    v_back = [sub.verts.new((x, y, z0)) for (x, y) in pts_xy]
    v_front = [sub.verts.new((x, y, z1)) for (x, y) in pts_xy]
    n = len(pts_xy)
    f_front = sub.faces.new(v_front)
    f_front.material_index = mat_index
    f_back = sub.faces.new(list(reversed(v_back)))
    f_back.material_index = mat_index
    for i in range(n):
        j = (i + 1) % n
        f_side = sub.faces.new((v_back[i], v_back[j], v_front[j], v_front[i]))
        f_side.material_index = mat_index

    if bevel > 0.0:
        bmesh.ops.bevel(
            sub,
            geom=list(sub.edges),
            offset=bevel,
            offset_type='OFFSET',
            segments=2,
            profile=0.5,
            affect='EDGES',
            clamp_overlap=True,
        )
    _bm_transform_three_to_blender(sub)
    _merge_bmesh(bm, sub)
    sub.free()


def add_lathe_z_three(bm, profile_rz, cx, cy, cz, segs=48, mat_index=0):
    """
    Revolve a 2D profile [(r, z_offset), ...] around an axis parallel to Three.js Z
    passing through (cx, cy, cz). Closes ends if first/last r > 0.
    """
    sub = bmesh.new()
    rings = []
    for r, z_off in profile_rz:
        if r <= 1e-6:
            v = sub.verts.new((cx, cy, cz + z_off))
            rings.append([v])
        else:
            ring = []
            for s in range(segs):
                ang = 2.0 * math.pi * s / segs
                ring.append(sub.verts.new((cx + r * math.cos(ang), cy + r * math.sin(ang), cz + z_off)))
            rings.append(ring)

    for i in range(len(rings) - 1):
        r0 = rings[i]
        r1 = rings[i + 1]
        if len(r0) == 1 and len(r1) == 1:
            continue
        elif len(r0) == 1:
            v_c = r0[0]
            for s in range(segs):
                sn = (s + 1) % segs
                f = sub.faces.new((v_c, r1[sn], r1[s]))
                f.material_index = mat_index
        elif len(r1) == 1:
            v_c = r1[0]
            for s in range(segs):
                sn = (s + 1) % segs
                f = sub.faces.new((r0[s], r0[sn], v_c))
                f.material_index = mat_index
        else:
            for s in range(segs):
                sn = (s + 1) % segs
                f = sub.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
                f.material_index = mat_index

    _bm_transform_three_to_blender(sub)
    _merge_bmesh(bm, sub)
    sub.free()


def _merge_bmesh(dst, src):
    """Copy geometry (verts, faces, material_index) from src bmesh into dst bmesh."""
    vert_map = {}
    for v in src.verts:
        vert_map[v] = dst.verts.new(v.co)
    dst.verts.ensure_lookup_table()
    for f in src.faces:
        try:
            nf = dst.faces.new([vert_map[v] for v in f.verts])
            nf.material_index = f.material_index
            nf.smooth = f.smooth
        except ValueError:
            pass


# =============================================================================
# EXACT CIRCLE-TO-CIRCLE WEB TANGENT SOLVER (XY plane)
# =============================================================================

def circle_tangent_points(c1, r1, s1, c2, r2, s2):
    """
    Compute exact tangent departure point on circle 1 and arrival point on circle 2
    for a taut belt/web traveling from circle 1 to circle 2.

    c1, c2: (x, y) tuples
    r1, r2: effective wrap radii (roller_radius + web_half_thickness)
    s1, s2: +1 for CCW wrap (web travels CCW around circle),
            -1 for CW wrap (web travels CW around circle).

    Returns ((p1x, p1y), ang1, (p2x, p2y), ang2) where ang1, ang2 are polar angles
    on circles 1 and 2 respectively.
    """
    dx = c2[0] - c1[0]
    dy = c2[1] - c1[1]
    dist = math.hypot(dx, dy)
    base_ang = math.atan2(dy, dx)

    # For a belt departing circle 1 with sense s1 (+1=CCW, -1=CW):
    # Tangent vector T makes angle alpha = ang1 + s1 * pi/2, so outward normal at p1 is:
    # n1 = (cos(ang1), sin(ang1)) with n1 . T = 0, and s1 * (n1 x T) > 0.
    # For circle 2, outward normal n2 satisfies n2 = (s2 / s1) * n1.
    # Projecting (p2 - p1) onto n1 gives: (c2 - c1) . n1 = r1 - (s2 / s1) * r2.
    # Let phi = ang1 - base_ang => dist * cos(phi) = r1 - (s1 * s2) * r2.
    # Also since T points generally from c1 toward c2, we need:
    # (c2 - c1) . T > 0 => sin(ang1 - base_ang) has sign -s1!
    # Wait: T = (-s1 * sin(ang1), s1 * cos(ang1))
    # (c2-c1)/dist = (cos(base), sin(base))
    # dot = -s1 * sin(ang1 - base) = -s1 * sin(phi) > 0  => sin(phi) has sign -s1!
    rhs = (r1 - (s1 * s2) * r2) / max(dist, 1e-6)
    rhs = max(-0.998, min(0.998, rhs))
    phi_mag = math.acos(rhs)  # in [0, pi]
    phi = -s1 * phi_mag
    ang1 = base_ang + phi
    ang2 = ang1 if (s1 == s2) else (ang1 + math.pi)

    p1 = (c1[0] + r1 * math.cos(ang1), c1[1] + r1 * math.sin(ang1))
    p2 = (c2[0] + r2 * math.cos(ang2), c2[1] + r2 * math.sin(ang2))
    return p1, ang1, p2, ang2


def compute_web_centerline(wrap_sequence, arc_step_deg=6.0):
    """
    Given wrap_sequence = [(cx, cy, r_wrap, sense), ...] where sense is +1 (CCW) or -1 (CW),
    compute a smooth continuous list of (x, y, nx, ny, s_dist) points along the entire
    electrode web path with exact tangent lines and circular roller wraps!
    """
    n = len(wrap_sequence)
    if n < 2:
        return []

    # Precompute all inter-roller tangent segments
    tangents = []
    for i in range(n - 1):
        c1x, c1y, r1, s1 = wrap_sequence[i]
        c2x, c2y, r2, s2 = wrap_sequence[i + 1]
        p1, a1, p2, a2 = circle_tangent_points((c1x, c1y), r1, s1, (c2x, c2y), r2, s2)
        tangents.append((p1, a1, p2, a2))

    pts = []  # (x, y, nx, ny)

    def _add_pt(x, y, nx, ny):
        if pts:
            lx, ly, _, _ = pts[-1]
            if math.hypot(x - lx, y - ly) < 1e-4:
                return
        pts.append((x, y, nx, ny))

    # Optional lead-in wrap on first roller (90 deg before departure)
    c0x, c0y, r0, s0 = wrap_sequence[0]
    _, a_dep0, _, _ = tangents[0]
    lead_span = math.radians(75.0)
    steps0 = max(4, int(math.degrees(lead_span) / arc_step_deg))
    for k in range(steps0 + 1):
        ang = a_dep0 - s0 * lead_span * (1.0 - k / steps0)
        ca, sa = math.cos(ang), math.sin(ang)
        _add_pt(c0x + r0 * ca, c0y + r0 * sa, ca, sa)

    for i in range(n - 1):
        p1, a1, p2, a2 = tangents[i]
        # Straight tangent span from p1 to p2 (subdivide slightly for smooth shading & pulse)
        seg_len = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        # Outward normal along straight span = normal at p1 (pointing away from circle 1 center)
        # Wait: ensure normal flips smoothly? Actually web thickness uses symmetric ±half_t along normal!
        # Let's define consistent "left of travel" normal so ribbons never twist!
        tx = (p2[0] - p1[0]) / max(seg_len, 1e-6)
        ty = (p2[1] - p1[1]) / max(seg_len, 1e-6)
        # Left normal = (-ty, tx)
        lnx, lny = -ty, tx
        span_steps = max(2, int(seg_len / 0.04))
        for k in range(span_steps + 1):
            t = k / span_steps
            _add_pt(p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t, lnx, lny)

        # Arc wrap around roller i+1 from arrival angle a2 to next departure angle (or tail wrap)
        cx, cy, r, s = wrap_sequence[i + 1]
        if i + 1 < n - 1:
            _, a_next_dep, _, _ = tangents[i + 1]
            # Travel in direction `s` from a2 to a_next_dep
            delta = (a_next_dep - a2) % (2.0 * math.pi)
            if s < 0:
                delta = delta - 2.0 * math.pi if delta > 1e-5 else 0.0
                if abs(delta) < 1e-5:
                    delta = 0.0
            else:
                if abs(delta) > 2.0 * math.pi - 1e-5:
                    delta = 0.0
            # Guard against accidental >330 deg full loop if departure nearly coincides with arrival
            if abs(delta) > math.radians(315.0):
                delta = 0.0
        else:
            # Final winding drum: wrap 140 deg onto the roll!
            delta = s * math.radians(140.0)

        arc_steps = max(2, int(abs(math.degrees(delta)) / arc_step_deg))
        for k in range(1, arc_steps + 1):
            ang = a2 + delta * (k / arc_steps)
            ca, sa = math.cos(ang), math.sin(ang)
            # Travel direction on circle: (-s*sa, s*ca) -> left normal = (-s*ca, -s*sa)
            _add_pt(cx + r * ca, cy + r * sa, -s * ca, -s * sa)

    # Recompute clean consistent mitered left-normals + cumulative arc length
    out = []
    cum_s = 0.0
    m = len(pts)
    for i in range(m):
        x, y, _, _ = pts[i]
        if i > 0:
            cum_s += math.hypot(x - pts[i - 1][0], y - pts[i - 1][1])
        if i == 0:
            dx = pts[1][0] - x
            dy = pts[1][1] - y
        elif i == m - 1:
            dx = x - pts[i - 1][0]
            dy = y - pts[i - 1][1]
        else:
            dx = pts[i + 1][0] - pts[i - 1][0]
            dy = pts[i + 1][1] - pts[i - 1][1]
        l = math.hypot(dx, dy)
        if l < 1e-7:
            nx, ny = 0.0, 1.0
        else:
            nx, ny = -dy / l, dx / l
        out.append((x, y, nx, ny, cum_s))
    return out


def add_web_ribbon_three(bm, centerline_pts, z_half_width, thickness=0.008, mat_index=0):
    """
    Build a solid 3D thin sheet along centerline_pts [(x, y, nx, ny, s), ...],
    spanning Z = [-z_half_width, +z_half_width] with thickness `thickness`.
    """
    sub = bmesh.new()
    ht = thickness * 0.5
    rings = []
    for (x, y, nx, ny, _s) in centerline_pts:
        # 4 corner verts of ribbon cross-section:
        # 0: (+ht, +zw), 1: (+ht, -zw), 2: (-ht, -zw), 3: (-ht, +zw)
        v0 = sub.verts.new((x + nx * ht, y + ny * ht, +z_half_width))
        v1 = sub.verts.new((x + nx * ht, y + ny * ht, -z_half_width))
        v2 = sub.verts.new((x - nx * ht, y - ny * ht, -z_half_width))
        v3 = sub.verts.new((x - nx * ht, y - ny * ht, +z_half_width))
        rings.append((v0, v1, v2, v3))

    for i in range(len(rings) - 1):
        a = rings[i]
        b = rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            f = sub.faces.new((a[k], a[kn], b[kn], b[k]))
            f.material_index = mat_index

    # Cap ends
    f0 = sub.faces.new(list(reversed(rings[0])))
    f0.material_index = mat_index
    f1 = sub.faces.new(rings[-1])
    f1.material_index = mat_index

    _bm_transform_three_to_blender(sub)
    _merge_bmesh(bm, sub)
    sub.free()
