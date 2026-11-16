"""Export one WOBBLE ID asset from the open .blend file to GLB.

NOT YET TESTED: written against the Blender 4.x glTF exporter, but Blender was
not available when this file was written. Run it once on a real asset and fix
any option name Blender rejects. Then check the result with:

    npm run asset:check -- <asset_id>

Run from the project root (the folder that contains assets/):

    blender -b path/to/<asset_id>.blend --python scripts/blender/export_asset.py -- <asset_id>

Rules it follows (docs/ASSET_STANDARDS.md):
  - the asset folder assets/<category>/<asset_id>/ must already exist
  - the root empty is named <asset_id>; it and its children are exported
  - Y-up export, no image textures, no cameras, lights or animation
  - metric units with unit scale 1.0 (checked, not changed)
Scale and rotation must already be applied; the checker reports it if not.
"""

import os
import sys

import bpy

CATEGORIES = ("characters", "props", "environments")


def fail(message):
    print(f"export_asset: {message}", file=sys.stderr)
    sys.exit(1)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 1:
        fail("usage: blender -b file.blend --python scripts/blender/export_asset.py -- <asset_id>")
    asset_id = args[0]

    folder = next(
        (os.path.join("assets", c, asset_id) for c in CATEGORIES
         if os.path.isdir(os.path.join("assets", c, asset_id))),
        None,
    )
    if folder is None:
        fail(f"folder assets/<category>/{asset_id}/ not found. Create it first (run from the project root).")

    units = bpy.context.scene.unit_settings
    if units.system != "METRIC" or abs(units.scale_length - 1.0) > 1e-9:
        fail("scene units must be Metric with unit scale 1.0")

    root = bpy.data.objects.get(asset_id)
    if root is None or root.type != "EMPTY":
        fail(f'no root empty named "{asset_id}" in this file')

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root

    out = os.path.join(folder, f"{asset_id}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    print(f"export_asset: wrote {out}")


main()
