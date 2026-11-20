"""
build_cm700_all.py
Master Blender 4.3.2 build script for the CM-700MM Multi-Roll Film-Making Equipment.

Upgraded v2 Engineering Pipeline:
  - Single Source of Truth: reads specs/machine_config.json
  - Synthesizes procedural brushed-stainless, CNC radial-turned bearing, carbon-film,
    and SCADA HMI UI textures (packed into .blend & embedded into GLB)
  - Bakes dual dynamic floor contact-shadow AO maps (static + sliding cutaway)
  - Runs automated geometry & web-clearance verification (verify_geometry)
  - Exports Draco-compressed glTF 2.0 binary (assets/cm700mm_calender.glb)
  - Uses Apple Metal GPU Cycles acceleration (with automatic CPU fallback)

CLI options (after --):
  --preview          Fast 640x360 @ 12-sample geometry/layout QA preview
  --only <shot>      Render only one view: overview | cutaway | closeup | rear
  --skip-renders     Export .blend + Draco .glb + contact shadows without rendering
"""

import os
import sys
import json
import math
import bpy
import bmesh

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from cm700_lib import (
    load_machine_config,
    reset_scene,
    get_or_create_collection,
    create_material_library,
    make_pbr_material,
    to_blender,
)
from cm700_textures import generate_pbr_texture_pack, bake_floor_contact_shadows
from cm700_core_rolls import build_all_core_rolls, CALENDER_ROLLS, GUIDE_ROLLS, WINDER_DRUM
from cm700_enclosures import build_all_enclosures
from cm700_peripherals import build_all_peripherals


def _aim_object_at(obj, target_three):
    target_b = to_blender(*target_three)
    direction = target_b - obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    obj.rotation_euler = rot_quat.to_euler()


def verify_geometry(all_objs, centerline, cfg):
    """
    Automated CAD geometry & web-clearance QA check executed prior to export:
      1. Every mesh has >0 polygons, valid UV layer, >=1 material, zero NaN vertices
      2. Every point on the 390-pt film centerline maintains non-penetration (d >= R - 1.5mm)
         across all 16 rollers (R1..R5, G1..G10, W1)
      3. Brand text mesh sits cleanly proud of the +X front cabinet wall
    """
    issues = []
    mesh_objs = [o for o in all_objs if o.type == 'MESH']
    for obj in mesh_objs:
        me = obj.data
        if len(me.polygons) == 0:
            issues.append(f"Empty mesh: {obj.name}")
        if len(me.uv_layers) == 0:
            issues.append(f"Missing UV layer: {obj.name}")
        if len(me.materials) == 0:
            issues.append(f"Missing material: {obj.name}")
        for v in me.vertices:
            if not (math.isfinite(v.co.x) and math.isfinite(v.co.y) and math.isfinite(v.co.z)):
                issues.append(f"NaN vertex in {obj.name}")
                break

    # Verify film web non-penetration across all 16 rollers
    all_rolls = list(CALENDER_ROLLS) + list(GUIDE_ROLLS) + [WINDER_DRUM]
    min_clearance = 999.0
    worst_roll = ""
    for roll in all_rolls:
        rx, ry, rr = float(roll["x"]), float(roll["y"]), float(roll["r"])
        for (px, py, _nx, _ny, _s) in centerline:
            clr = math.hypot(px - rx, py - ry) - rr
            if clr < min_clearance:
                min_clearance = clr
                worst_roll = roll["name"]
            if clr < -0.0015:
                issues.append(f"Web penetration on {roll['name']}: {clr*1000:.2f} mm")
                break

    # Verify brand text sits proud of front cabinet +X face
    x_wall = float(cfg["layout"]["frontCabinet"]["x"][1])
    for obj in mesh_objs:
        if obj.get("isBrandText"):
            min_x = min((obj.matrix_world @ v.co).x for v in obj.data.vertices)
            if min_x < x_wall - 0.001:
                issues.append(f"BrandText {obj.name} submerged inside cabinet wall ({min_x:.4f} < {x_wall:.4f})")

    if issues:
        print("=== GEOMETRY QA WARNINGS ===")
        for msg in issues:
            print("  !", msg)
    else:
        print(
            f"=== GEOMETRY QA PASSED === "
            f"({len(mesh_objs)} meshes validated, all UVs/materials valid, "
            f"min web-to-roller clearance = +{min_clearance*1000:.2f} mm at {worst_roll})"
        )
    return len(issues) == 0


def _configure_cycles_device(scene):
    """Enable Apple Metal GPU acceleration if available; fall back smoothly to CPU."""
    scene.render.engine = 'CYCLES'
    used_gpu = False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        gpu_found = False
        for d in prefs.devices:
            if d.type == 'METAL':
                d.use = True
                gpu_found = True
            else:
                d.use = False
        if gpu_found:
            scene.cycles.device = 'GPU'
            used_gpu = True
    except Exception:
        used_gpu = False

    if not used_gpu:
        scene.cycles.device = 'CPU'
    print(f"CYCLES_COMPUTE_DEVICE: {'METAL_GPU' if used_gpu else 'CPU'}")
    return used_gpu


def setup_studio_preview(col_studio, cfg):
    """Build studio reflective cyclorama floor, softbox lights, and camera from JSON config."""
    scene = bpy.context.scene

    world = bpy.data.worlds.new("Studio_World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.24, 0.25, 0.27, 1.0)
        bg.inputs["Strength"].default_value = 0.90

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=28.0)
    mesh = bpy.data.meshes.new("Studio_Floor_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    floor_obj = bpy.data.objects.new("Studio_Floor", mesh)
    floor_obj.location = to_blender(0.0, -0.002, 0.0)
    floor_mat = make_pbr_material(
        "Mat_StudioFloor", (0.52, 0.53, 0.55, 1.0), metallic=0.10, roughness=0.26, coat=0.14
    )
    floor_obj.data.materials.append(floor_mat)
    col_studio.objects.link(floor_obj)

    def add_area_light(name, pos_three, target_three, energy, size_x, size_y, color=(1.0, 1.0, 1.0)):
        ldata = bpy.data.lights.new(name=name, type='AREA')
        ldata.energy = energy
        ldata.shape = 'RECTANGLE'
        ldata.size = size_x
        ldata.size_y = size_y
        ldata.color = color
        lobj = bpy.data.objects.new(name=name, object_data=ldata)
        lobj.location = to_blender(*pos_three)
        _aim_object_at(lobj, target_three)
        col_studio.objects.link(lobj)
        return lobj

    add_area_light("Key_Softbox",   (5.8, 6.4, 6.2),   (0.0, 1.2, -0.3), 1250.0, 5.5, 3.8, (1.0, 0.99, 0.98))
    add_area_light("Fill_Softbox",  (-6.5, 4.5, 5.5),  (0.0, 1.2, -0.3),  680.0, 6.0, 4.0, (0.94, 0.97, 1.0))
    add_area_light("Top_StripLight", (0.0, 7.2, 0.2),  (0.0, 1.2, -0.4),  920.0, 8.5, 2.2, (1.0, 1.0, 1.0))
    add_area_light("Rim_BackLight", (-3.0, 4.5, -6.5), (0.0, 1.3, -0.5),  720.0, 5.5, 3.2, (0.95, 0.97, 1.0))

    ov = cfg["cameraPresets"]["overview"]
    cam_data = bpy.data.cameras.new(name="Studio_Cam")
    cam_data.lens = float(ov.get("lensMm", 42.0))
    cam_data.clip_start = 0.05
    cam_data.clip_end = 120.0
    cam_obj = bpy.data.objects.new(name="Studio_Camera", object_data=cam_data)
    cam_obj.location = to_blender(*ov["pos"])
    _aim_object_at(cam_obj, ov["target"])
    col_studio.objects.link(cam_obj)
    scene.camera = cam_obj
    return cam_obj


def render_verification_views(cam_obj, col_enc, renders_dir, cfg, preview=False, only=""):
    """Render studio verification views from unified JSON cameraPresets."""
    os.makedirs(renders_dir, exist_ok=True)
    scene = bpy.context.scene
    _configure_cycles_device(scene)

    scene.cycles.samples = 12 if preview else 36
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4 if preview else 6
    scene.cycles.diffuse_bounces = 2 if preview else 3
    scene.cycles.glossy_bounces = 2 if preview else 3
    scene.render.resolution_x = 640 if preview else 1280
    scene.render.resolution_y = 360 if preview else 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = (
        'AgX'
        if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items]
        else 'Filmic'
    )

    cutaway_objs = [o for o in col_enc.objects if o.get("role") == "cutaway_front"]

    def set_cutaway_hidden(hidden):
        for o in cutaway_objs:
            o.hide_render = hidden
            o.hide_viewport = hidden

    presets = cfg["cameraPresets"]
    shots = [
        ("overview", "overview", "01_overview.png", False),
        ("cutaway",  "cutaway",  "02_cutaway.png",  True),
        ("closeup",  "rollers",  "03_rollers_closeup.png", True),
        ("rear",     "rear",     "04_rear_34.png",  False),
    ]

    for key, preset_name, fname, hide_front in shots:
        if only and only != key:
            continue
        pr = presets[preset_name]
        set_cutaway_hidden(hide_front)
        cam_obj.data.lens = float(pr.get("lensMm", 42.0))
        cam_obj.location = to_blender(*pr["pos"])
        _aim_object_at(cam_obj, pr["target"])
        scene.render.filepath = os.path.join(renders_dir, fname)
        bpy.ops.render.render(write_still=True)

    # Restore overview camera & assembled state
    set_cutaway_hidden(False)
    ov = presets["overview"]
    cam_obj.data.lens = float(ov.get("lensMm", 42.0))
    cam_obj.location = to_blender(*ov["pos"])
    _aim_object_at(cam_obj, ov["target"])


def main():
    args = sys.argv
    preview = "--preview" in args
    skip_renders = ("--skip-renders" in args) or (os.environ.get("SKIP_RENDERS", "0") == "1")
    only = os.environ.get("RENDER_ONLY", "").strip().lower()
    if "--only" in args:
        idx = args.index("--only")
        if idx + 1 < len(args):
            only = args[idx + 1].strip().lower()

    cfg = load_machine_config()
    reset_scene()

    assets_dir = os.path.join(PROJECT_DIR, "assets")
    textures_dir = os.path.join(assets_dir, "textures")
    os.makedirs(textures_dir, exist_ok=True)

    # 1. Synthesize brushed stainless, CNC radial turning, electrode & HMI UI PBR textures
    tex_pack = generate_pbr_texture_pack(textures_dir)
    mats = create_material_library(tex_pack)

    col_core = get_or_create_collection("CM700_Core_Rolls")
    col_enc = get_or_create_collection("CM700_Enclosures")
    col_peri = get_or_create_collection("CM700_Peripherals")
    col_studio = get_or_create_collection("Studio_Preview")

    core_objs, centerline = build_all_core_rolls(col_core, mats)
    enc_objs = build_all_enclosures(col_enc, mats)
    peri_objs = build_all_peripherals(col_peri, mats)
    cam_obj = setup_studio_preview(col_studio, cfg)

    bpy.context.view_layer.update()
    all_equipment = list(core_objs) + list(enc_objs) + list(peri_objs)

    # 2. Automated CAD geometry & clearance QA
    verify_geometry(all_equipment, centerline, cfg)

    # 3. Bake dual floor contact-shadow AO maps (static + cutaway_front)
    p_shadow_static, p_shadow_cut = bake_floor_contact_shadows(
        all_equipment, cfg["contactShadow"], assets_dir
    )

    # 4. Save self-contained .blend with all generated textures packed
    blend_path = os.path.join(SCRIPT_DIR, "cm700mm_calender.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    # 5. Export Draco-compressed GLB (excluding Studio_Preview lights/floor/camera)
    bpy.ops.object.select_all(action='DESELECT')
    part_ids = set()
    roles = {}
    mesh_count = 0
    poly_count = 0

    for col in (col_core, col_enc, col_peri):
        for obj in col.objects:
            obj.select_set(True)
            if obj.type == 'MESH':
                mesh_count += 1
                poly_count += len(obj.data.polygons)
                pid = obj.get("partId", "UNKNOWN")
                role = obj.get("role", "static")
                part_ids.add(pid)
                roles[role] = roles.get(role, 0) + 1

    glb_path = os.path.join(assets_dir, "cm700mm_calender.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_normals=True,
        export_texcoords=True,
        export_animations=False,
        export_lights=False,
        export_cameras=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )

    # 6. Export exact web centerline & computed roller kinematics JSON
    meta_path = os.path.join(assets_dir, "web_centerline.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "calenderRolls": CALENDER_ROLLS,
                "guideRolls": GUIDE_ROLLS,
                "winderDrum": WINDER_DRUM,
                "centerline": [
                    {
                        "x": round(p[0], 5),
                        "y": round(p[1], 5),
                        "nx": round(p[2], 5),
                        "ny": round(p[3], 5),
                        "s": round(p[4], 5),
                    }
                    for p in centerline
                ],
            },
            f,
            indent=2,
        )

    if not skip_renders:
        renders_dir = os.path.join(PROJECT_DIR, "renders")
        render_verification_views(cam_obj, col_enc, renders_dir, cfg, preview=preview, only=only)
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    print("=== BLENDER CM-700MM V2 BUILD SUMMARY ===")
    print(f"BLEND_FILE:          {blend_path} ({os.path.getsize(blend_path)} bytes)")
    print(f"GLB_DRACO_FILE:      {glb_path} ({os.path.getsize(glb_path)} bytes)")
    print(f"SHADOW_STATIC:       {p_shadow_static} ({os.path.getsize(p_shadow_static)} bytes)")
    print(f"SHADOW_CUTAWAY:      {p_shadow_cut} ({os.path.getsize(p_shadow_cut)} bytes)")
    print(f"MESH_OBJECTS:        {mesh_count}, BASE_POLYGONS: {poly_count}")
    print(f"PART_IDS ({len(part_ids)}): {sorted(part_ids)}")
    print(f"ROLES:               {roles}")
    print(f"WEB_CENTERLINE:      {len(centerline)} pts, {centerline[-1][4]:.3f} m")


if __name__ == "__main__":
    main()
