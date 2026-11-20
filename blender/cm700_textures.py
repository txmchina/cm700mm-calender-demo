"""
cm700_textures.py
Procedural PBR texture synthesizer & multi-footprint floor contact-shadow baker
for the CM-700MM Multi-Roll Film-Making Equipment (pure NumPy + bpy.data.images).

Generates:
  - assets/textures/brushed_steel_normal.png     (512x512 seamless directional stainless grain)
  - assets/textures/brushed_steel_roughness.png  (512x512 directional roughness variation)
  - assets/textures/turned_radial_normal.png     (512x512 concentric CNC lathe bearing grooves)
  - assets/textures/turned_radial_roughness.png  (512x512 concentric radial sheen variation)
  - assets/textures/electrode_roughness.png      (256x256 fine pressed carbon powder grain)
  - assets/textures/hmi_screen_ui.png            (512x384 dark industrial SCADA HMI graphic)
  - assets/contact_shadow_static.png             (768x768 baked floor AO for stationary frames)
  - assets/contact_shadow_cutaway.png            (768x768 baked floor AO for sliding front housing)
"""

import os
import math
import struct
import zlib
import numpy as np
import bpy


def _write_png_rgba_uint8(filepath, rgba_u8):
    """
    Bulletproof pure-Python RGBA PNG writer (takes H x W x 4 uint8 in standard top-down row order).
    Avoids Blender bpy.data.images.new() color-management buffer clearing quirks completely!
    """
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    h, w, c = rgba_u8.shape
    assert c == 4

    def _chunk(tag, payload):
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    # Prepend filter byte 0 to each scanline
    raw = np.ascontiguousarray(rgba_u8, dtype=np.uint8)
    scanlines = np.concatenate([np.zeros((h, 1), dtype=np.uint8), raw.reshape(h, w * 4)], axis=1)
    compressed = zlib.compress(scanlines.tobytes(), level=6)

    with open(filepath, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(_chunk(b"IHDR", ihdr))
        f.write(_chunk(b"IDAT", compressed))
        f.write(_chunk(b"IEND", b""))


def _gaussian_kernel_1d(sigma):
    radius = max(1, int(math.ceil(sigma * 3.0)))
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    k = np.exp(-0.5 * (x / max(sigma, 1e-4)) ** 2)
    k /= k.sum()
    return k


def _blur_2d_separable(arr, sigma_x, sigma_y, wrap=False):
    """Fast separable 2D Gaussian blur using pure NumPy (supports periodic tiling)."""
    out = arr.astype(np.float32, copy=True)
    if sigma_x > 0.2:
        kx = _gaussian_kernel_1d(sigma_x)
        r = len(kx) // 2
        pad_mode = 'wrap' if wrap else 'edge'
        padded = np.pad(out, ((0, 0), (r, r)), mode=pad_mode)
        res = np.zeros_like(out)
        for i, w in enumerate(kx):
            res += w * padded[:, i:i + out.shape[1]]
        out = res
    if sigma_y > 0.2:
        ky = _gaussian_kernel_1d(sigma_y)
        r = len(ky) // 2
        pad_mode = 'wrap' if wrap else 'edge'
        padded = np.pad(out, ((r, r), (0, 0)), mode=pad_mode)
        res = np.zeros_like(out)
        for i, w in enumerate(ky):
            res += w * padded[i:i + out.shape[0], :]
        out = res
    return out


def _height_to_normal_rgba(height, strength=1.5, wrap=True):
    """Convert 2D heightmap [0..1] to tangent-space normal map RGBA [0..1]."""
    if wrap:
        dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
        dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    else:
        dx = np.gradient(height, axis=1)
        dy = np.gradient(height, axis=0)

    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    nx *= inv_len
    ny *= inv_len
    nz *= inv_len

    rgba = np.ones((height.shape[0], height.shape[1], 4), dtype=np.float32)
    rgba[..., 0] = np.clip(nx * 0.5 + 0.5, 0.0, 1.0)
    rgba[..., 1] = np.clip(ny * 0.5 + 0.5, 0.0, 1.0)
    rgba[..., 2] = np.clip(nz * 0.5 + 0.5, 0.0, 1.0)
    return rgba


def _save_and_load_blender_image(name, rgba_float, filepath, colorspace='sRGB'):
    """
    Write (H, W, 4) float32 array in [0..1] (bottom-to-top UV orientation, flipped to top-down PNG)
    directly to disk via pure-Python PNG writer, then load cleanly into Blender and pack.
    """
    # Flip vertically because arrays are constructed in UV bottom-to-top order (row 0 = v=0)
    top_down = np.flipud(np.clip(rgba_float, 0.0, 1.0))
    rgba_u8 = (top_down * 255.0 + 0.5).astype(np.uint8)
    _write_png_rgba_uint8(filepath, rgba_u8)

    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.load(filepath, check_existing=False)
    img.name = name
    try:
        img.colorspace_settings.name = colorspace
    except Exception:
        pass
    img.pack()
    return img


def generate_pbr_texture_pack(textures_dir):
    """Synthesize all procedural industrial PBR textures and return dict of bpy.types.Image."""
    os.makedirs(textures_dir, exist_ok=True)
    rng = np.random.default_rng(700)
    images = {}

    # -------------------------------------------------------------------------
    # 1. Brushed Stainless Steel (512x512 seamless directional micro-grain)
    # -------------------------------------------------------------------------
    s = 512
    noise_fine = rng.normal(0.0, 1.0, (s, s)).astype(np.float32)
    noise_med = rng.normal(0.0, 1.0, (s, s)).astype(np.float32)
    # Long smooth streaks along X (sigma_x=22, sigma_y=0.6) + subtle wider satin bands
    streaks_fine = _blur_2d_separable(noise_fine, sigma_x=20.0, sigma_y=0.45, wrap=True)
    streaks_broad = _blur_2d_separable(noise_med, sigma_x=44.0, sigma_y=2.2, wrap=True)
    brushed_h = 0.65 * streaks_fine / (np.std(streaks_fine) + 1e-6) + 0.35 * streaks_broad / (np.std(streaks_broad) + 1e-6)
    brushed_h = np.clip(brushed_h * 0.16 + 0.5, 0.0, 1.0)

    brushed_norm = _height_to_normal_rgba(brushed_h, strength=1.15, wrap=True)
    images["brushed_normal"] = _save_and_load_blender_image(
        "Tex_BrushedSteel_Normal",
        brushed_norm,
        os.path.join(textures_dir, "brushed_steel_normal.png"),
        colorspace='Non-Color',
    )

    # Roughness centered around 0.34 with ±0.06 subtle directional satin stainless variation
    brushed_rough = np.clip(0.28 + 0.14 * brushed_h, 0.24, 0.46)
    brushed_rough_rgba = np.ones((s, s, 4), dtype=np.float32)
    brushed_rough_rgba[..., 0] = brushed_rough
    brushed_rough_rgba[..., 1] = brushed_rough
    brushed_rough_rgba[..., 2] = brushed_rough
    images["brushed_roughness"] = _save_and_load_blender_image(
        "Tex_BrushedSteel_Roughness",
        brushed_rough_rgba,
        os.path.join(textures_dir, "brushed_steel_roughness.png"),
        colorspace='Non-Color',
    )

    # -------------------------------------------------------------------------
    # 2. Concentric CNC Lathe Turned Bearing Cover (512x512 radial grooves)
    # -------------------------------------------------------------------------
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    u = (xx + 0.5) / s - 0.5
    v = (yy + 0.5) / s - 0.5
    rad = np.sqrt(u * u + v * v) * 2.0  # 0 at center, 1 at edge
    ang = np.arctan2(v, u)

    ring_idx = np.clip((rad * 255.0).astype(np.int32), 0, 255)
    radial_profile = rng.normal(0.0, 1.0, 256).astype(np.float32)
    radial_profile = np.convolve(np.pad(radial_profile, 2, mode='edge'), [0.1, 0.2, 0.4, 0.2, 0.1], mode='valid')
    turned_rings = (
        0.52 * np.sin(rad * 160.0 * math.pi)
        + 0.28 * np.sin(rad * 64.0 * math.pi + 0.9)
        + 0.45 * radial_profile[ring_idx]
    )
    turned_h = np.clip(turned_rings * 0.15 + 0.5, 0.0, 1.0)
    turned_norm = _height_to_normal_rgba(turned_h, strength=1.25, wrap=False)
    images["turned_normal"] = _save_and_load_blender_image(
        "Tex_TurnedRadial_Normal",
        turned_norm,
        os.path.join(textures_dir, "turned_radial_normal.png"),
        colorspace='Non-Color',
    )

    # Satin CNC machined aluminum/steel roughness [0.22..0.38] with radial sheen lobes
    aniso_lobe = 0.5 + 0.5 * np.cos(2.0 * (ang - 0.55))
    turned_rough = np.clip(0.22 + 0.09 * turned_h + 0.06 * aniso_lobe, 0.20, 0.40)
    turned_rough_rgba = np.ones((s, s, 4), dtype=np.float32)
    turned_rough_rgba[..., 0] = turned_rough
    turned_rough_rgba[..., 1] = turned_rough
    turned_rough_rgba[..., 2] = turned_rough
    images["turned_roughness"] = _save_and_load_blender_image(
        "Tex_TurnedRadial_Roughness",
        turned_rough_rgba,
        os.path.join(textures_dir, "turned_radial_roughness.png"),
        colorspace='Non-Color',
    )

    # -------------------------------------------------------------------------
    # 3. Carbon-Black Dry-Electrode Fine Micro-Grain (512x512 fine calendered foil)
    # -------------------------------------------------------------------------
    es = 512
    en_fine = rng.normal(0.0, 1.0, (es, es)).astype(np.float32)
    # Very subtle horizontal calendering streaks + fine carbon-powder micro-grain (no blotches)
    en_s = 0.65 * _blur_2d_separable(en_fine, sigma_x=0.35, sigma_y=0.35, wrap=True) + \
           0.35 * _blur_2d_separable(en_fine, sigma_x=10.0, sigma_y=0.5, wrap=True)
    e_rough = np.clip(0.28 + 0.028 * (en_s / (np.std(en_s) + 1e-6)), 0.22, 0.35)
    e_rgba = np.ones((es, es, 4), dtype=np.float32)
    e_rgba[..., 0] = e_rough
    e_rgba[..., 1] = e_rough
    e_rgba[..., 2] = e_rough
    images["electrode_roughness"] = _save_and_load_blender_image(
        "Tex_Electrode_Roughness",
        e_rgba,
        os.path.join(textures_dir, "electrode_roughness.png"),
        colorspace='Non-Color',
    )

    # -------------------------------------------------------------------------
    # 4. Industrial SCADA HMI Touchscreen UI Graphic (512x384)
    # -------------------------------------------------------------------------
    hw, hh = 512, 384
    ui = np.zeros((hh, hw, 4), dtype=np.float32)
    ui[..., 3] = 1.0
    # Deep slate navy industrial background with subtle vertical gradient
    grad_y = np.linspace(0.0, 1.0, hh, dtype=np.float32)[:, None]
    ui[..., 0] = 0.035 + 0.020 * grad_y
    ui[..., 1] = 0.055 + 0.028 * grad_y
    ui[..., 2] = 0.085 + 0.035 * grad_y

    def fill_rect(x0, y0, x1, y1, col):
        # Coordinates in standard top-down UI pixels -> convert to Blender bottom-up array rows
        r0 = max(0, hh - y1)
        r1 = min(hh, hh - y0)
        c0 = max(0, x0)
        c1 = min(hw, x1)
        if r1 > r0 and c1 > c0:
            ui[r0:r1, c0:c1, 0] = col[0]
            ui[r0:r1, c0:c1, 1] = col[1]
            ui[r0:r1, c0:c1, 2] = col[2]

    # Top cyan-accent status bar
    fill_rect(0, 0, hw, 48, (0.07, 0.13, 0.21))
    fill_rect(0, 46, hw, 50, (0.15, 0.72, 0.96))
    # Header title badge & green RUN pill
    fill_rect(20, 13, 146, 35, (0.16, 0.76, 0.98))
    fill_rect(388, 13, 490, 35, (0.10, 0.68, 0.28))

    # Left card: 5-Roll Speed / Pressure Bar Chart
    fill_rect(20, 68, 290, 272, (0.06, 0.09, 0.14))
    fill_rect(20, 68, 290, 72, (0.14, 0.36, 0.56))
    bar_heights = [92, 118, 136, 162, 158]
    for bi, bh in enumerate(bar_heights):
        bx = 44 + bi * 46
        fill_rect(bx, 250 - bh, bx + 28, 250, (0.14, 0.72, 0.96) if bi < 3 else (0.22, 0.88, 0.98))
        fill_rect(bx, 256, bx + 28, 263, (0.28, 0.36, 0.46))

    # Right cards: 3 KPI readout blocks (Speed / Thickness / Temp)
    kpi_cols = [(0.16, 0.78, 0.98), (0.18, 0.78, 0.42), (0.94, 0.66, 0.16)]
    for ki in range(3):
        ky0 = 68 + ki * 72
        fill_rect(310, ky0, 492, ky0 + 60, (0.06, 0.09, 0.14))
        fill_rect(310, ky0, 316, ky0 + 60, kpi_cols[ki])
        fill_rect(330, ky0 + 14, 420, ky0 + 24, (0.25, 0.32, 0.42))
        fill_rect(330, ky0 + 34, 468, ky0 + 48, kpi_cols[ki])

    # Bottom process trend waveform strip
    fill_rect(20, 290, 492, 366, (0.055, 0.085, 0.13))
    for px in range(32, 480):
        py = int(328 + 16 * math.sin(px * 0.035) + 6 * math.cos(px * 0.09))
        fill_rect(px, py - 2, px + 2, py + 2, (0.20, 0.85, 1.0))

    images["hmi_ui"] = _save_and_load_blender_image(
        "Tex_HMI_Screen_UI",
        ui,
        os.path.join(textures_dir, "hmi_screen_ui.png"),
        colorspace='sRGB',
    )

    return images


def bake_floor_contact_shadows(all_objects, shadow_cfg, assets_dir):
    """
    Compute physically grounded soft Gaussian floor contact-shadow / ambient-occlusion
    PNG maps directly from the actual Blender mesh vertices near floor Y = 0!

    Produces TWO separate maps so the sliding front enclosure's floor shadow
    slides and fades cleanly along with it in Three.js Cutaway mode:
      - assets/contact_shadow_static.png
      - assets/contact_shadow_cutaway.png
    """
    x_min = float(shadow_cfg["xMin"])
    x_max = float(shadow_cfg["xMax"])
    z_min = float(shadow_cfg["zMin"])
    z_max = float(shadow_cfg["zMax"])
    res = int(shadow_cfg.get("resolution", 768))

    def rasterize_group(objs):
        # Accumulate height-weighted shadow density onto XZ grid:
        #   - tight contact core (Y <= 0.32 m)
        #   - mid chassis shadow (Y <= 1.35 m)
        #   - wide soft overhead ambient occlusion (all Y)
        core = np.zeros((res, res), dtype=np.float32)
        mid = np.zeros((res, res), dtype=np.float32)
        wide = np.zeros((res, res), dtype=np.float32)

        inv_dx = (res - 1) / (x_max - x_min)
        inv_dz = (res - 1) / (z_max - z_min)

        # Three.js PlaneGeometry rotated -90° around X maps UV.y=1 -> z_min, UV.y=0 -> z_max.
        # Since _save_and_load_blender_image flips vertically (row 0 = UV.y=0 -> z_max; row res-1 = UV.y=1 -> z_min):
        # row index r = (z_max - z) * inv_dz!
        for obj in objs:
            if obj.type != 'MESH' or obj.data is None:
                continue
            mw = obj.matrix_world
            mesh = obj.data
            verts_world = [mw @ v.co for v in mesh.vertices]
            for poly in mesh.polygons:
                pts = [verts_world[vi] for vi in poly.vertices]
                ys = [p.z for p in pts]
                min_y = min(ys)
                if min_y > 2.6:
                    continue
                xs = [p.x for p in pts]
                zs = [-p.y for p in pts]

                ix0 = max(0, int(math.floor((min(xs) - x_min) * inv_dx)))
                ix1 = min(res - 1, int(math.ceil((max(xs) - x_min) * inv_dx)))
                iz0 = max(0, int(math.floor((z_max - max(zs)) * inv_dz)))
                iz1 = min(res - 1, int(math.ceil((z_max - min(zs)) * inv_dz)))
                if ix1 < ix0 or iz1 < iz0:
                    continue

                wide[iz0:iz1 + 1, ix0:ix1 + 1] = 1.0
                if min_y <= 1.35:
                    w_mid = max(0.25, 1.0 - min_y / 1.45)
                    mid[iz0:iz1 + 1, ix0:ix1 + 1] = np.maximum(mid[iz0:iz1 + 1, ix0:ix1 + 1], w_mid)
                if min_y <= 0.30:
                    w_core = max(0.40, 1.0 - min_y / 0.35)
                    core[iz0:iz1 + 1, ix0:ix1 + 1] = np.maximum(core[iz0:iz1 + 1, ix0:ix1 + 1], w_core)

        # Multi-scale soft Gaussian penumbra
        s_core = _blur_2d_separable(core, sigma_x=4.5, sigma_y=4.5, wrap=False)
        s_mid = _blur_2d_separable(mid, sigma_x=15.0, sigma_y=15.0, wrap=False)
        s_wide = _blur_2d_separable(wide, sigma_x=32.0, sigma_y=32.0, wrap=False)

        alpha = np.clip(0.46 * s_core + 0.24 * s_mid + 0.14 * s_wide, 0.0, 0.68)
        # Smooth edge fadeout near quad borders so rectangle boundary is 100% invisible
        border = int(res * 0.06)
        if border > 1:
            ramp = np.linspace(0.0, 1.0, border, dtype=np.float32)
            alpha[:border, :] *= ramp[:, None]
            alpha[-border:, :] *= ramp[::-1, None]
            alpha[:, :border] *= ramp[None, :]
            alpha[:, -border:] *= ramp[None, ::-1]

        rgba = np.zeros((res, res, 4), dtype=np.float32)
        rgba[..., 0] = 0.04
        rgba[..., 1] = 0.045
        rgba[..., 2] = 0.055
        rgba[..., 3] = alpha
        return rgba

    static_objs = [o for o in all_objects if o.get("role") != "cutaway_front"]
    cutaway_objs = [o for o in all_objects if o.get("role") == "cutaway_front"]

    static_rgba = rasterize_group(static_objs)
    cutaway_rgba = rasterize_group(cutaway_objs)

    p_static = os.path.join(assets_dir, "contact_shadow_static.png")
    p_cut = os.path.join(assets_dir, "contact_shadow_cutaway.png")
    _save_and_load_blender_image("Tex_ContactShadow_Static", static_rgba, p_static, colorspace='sRGB')
    _save_and_load_blender_image("Tex_ContactShadow_Cutaway", cutaway_rgba, p_cut, colorspace='sRGB')
    return p_static, p_cut
