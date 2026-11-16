# WOBBLE ID — Voxel Asset Standards v1

Status: **proposed**. Values marked *(proposed)* are starting points. Confirm or adjust them when the first real asset (`wobble_character`) is built, then bump the version of this document.

This document covers Phase 3, items 1 and 2 of the roadmap: naming and folders, and the Blender scene standards (scale, origin, orientation, materials). GLB export and validation (item 3) build on these rules.

## 1. Asset id

An asset id is the single name that connects a brief, a folder, a Blender file and a GLB file.

- Format: `snake_case`, lowercase ASCII letters and digits, parts joined by `_`. This is exactly the rule `ASSET_ID` in `src/brief.js` (`/^[a-z0-9]+(?:_[a-z0-9]+)*$/`), so every id the AI Director may produce is a valid asset id.
- Unique across all categories. `voxel_earth` can exist only once.
- Stable. Never rename an id after a brief or scene uses it. Changes to an asset are tracked by `version` in its metadata, not by a suffix such as `_v2`.
- The prefix `wobble` is reserved for Wobble himself and his parts (`wobble_character`, `wobble_crown`). The brief validator warns when no asset in a brief starts with `wobble`.
- Name the thing, not the scene: `voxel_earth`, not `scene3_earth`.

## 2. Categories and folders

```
assets/
  palette.json                      shared color palette (see section 6)
  characters/<asset_id>/
  props/<asset_id>/
  environments/<asset_id>/
```

| Category | Use | Examples |
| --- | --- | --- |
| `characters` | Anything with a face or a rig | `wobble_character` |
| `props` | Objects that a character holds or that sit in a scene | `voxel_flask`, `voxel_planet` |
| `environments` | Backgrounds and sets | `voxel_classroom`, `voxel_sky_scene` |

Each asset folder holds the same four files:

| File | Purpose | In Git |
| --- | --- | --- |
| `<asset_id>.blend` | Editable source | No *(proposed, see open decisions)* |
| `<asset_id>.glb` | Exported asset used by later phases | No *(proposed)* |
| `<asset_id>.json` | Metadata (section 7) | **Yes** |
| `preview.png` | Small turnaround or front preview for review | Yes, if under 200 KB |

Rules:

- File and folder names: lowercase ASCII, no spaces, no accents.
- The folder name, the `.blend` name, the `.glb` name and the `id` field in the metadata must all be identical.
- Animation clips (Phase 4) are stored next to the asset in `animations/<clip_name>.glb`, with `clip_name` also in `snake_case`. They are out of scope here.

## 3. Names inside Blender

- One collection per asset, named `<asset_id>`.
- One root empty named `<asset_id>`. All meshes are its children, so the GLB has a single root node with the asset id as its name.
- Mesh objects: `<asset_id>_<part>`, for example `wobble_character_head`, `wobble_character_sweater`.
- Armature (Phase 4): `<asset_id>_rig`.
- No default names (`Cube`, `Cube.001`, `Sphere`) in a finished asset.

## 4. Scale and units

- Blender scene units: **metric, unit scale 1.0**. 1 Blender unit = 1 meter. glTF is also in meters, so no conversion is needed on export.
- **One voxel = 0.1 m** *(proposed)*. Voxel geometry must sit on a 0.1 m grid. A character such as Wobble is about 1.6 m tall (16 voxels) *(proposed)*.
- Model objects at their own believable size on that grid. Do not shrink or enlarge an asset to fit a shot. Scale to the shot is done in the scene or sequence, never baked into the asset. A planet may be a stylised 10 m ball, but it is still modelled at 10 m with scale 1.
- **Apply scale and rotation** (`Ctrl+A`) on every object before export. Object scale must be (1, 1, 1) and rotation (0, 0, 0). Only the root empty may carry location.
- No negative scale, no shear.

## 5. Origin and orientation

- **Up axis:** Z-up in Blender. The exporter is set to **+Y Up**, so the GLB is Y-up as glTF requires.
- **Front of the asset:** faces **−Y in Blender** (the side you see in Front view, `Numpad 1`). After export this is **+Z** in glTF, the glTF convention for the front of a model.
- **Origin (root empty) placement:**

| Category | Origin |
| --- | --- |
| Characters and grounded props | Bottom center, between the feet, at ground level (Z = 0) |
| Environments | Center of the floor, at ground level (Z = 0) |
| Floating objects (`voxel_earth`, clouds) | Center of the object |
| Held items | Where the hand holds it, documented in the metadata `notes` field |

- The root empty is placed at world origin (0, 0, 0) in the saved file.
- Characters stand in a neutral T-pose or relaxed A-pose with the rig at rest *(proposed)*. The pose must be the same for every character, so clips can be reused.

## 6. Materials and palette

The voxel look is flat color, so materials stay simple and cheap to render.

- One material type only: **Principled BSDF** with a flat Base Color. Metallic 0, roughness 1.0 by default. Emission only for lights, screens and glowing parts.
- **No image textures** by default. Color comes from the material or from vertex colors. If a texture is ever needed, use nearest-neighbor (Closest) filtering and a power-of-two size, and record it in the metadata.
- Material names: `mat_<name>` for shared palette colors (`mat_purple`, `mat_skin`), or `mat_<asset_id>_<part>` for colors that belong to only one asset.
- Reuse palette materials instead of creating near-duplicates. `assets/palette.json` lists each palette color by name and hex value and is the single source of truth. It is created together with the first asset.
- **Wobble's fixed design** (see `src/director.js`): white skin, black hair, purple sweater with the text WOBBLE, black jeans, red sneakers, crown. These map to palette names `skin`, `hair`, `purple`, `jeans`, `red`, and the crown color. The crown color is not specified anywhere yet, so decide it when modelling *(open decision)*. No extra accessories: the validator already warns about glasses, hats, capes and similar items.
- Fewer than **8 materials** per asset *(proposed)*.

### Polygon budgets *(proposed)*

| Category | Triangles per asset |
| --- | --- |
| Characters | up to 15,000 |
| Props | up to 5,000 |
| Environments | up to 50,000 |

Merge hidden faces between touching voxels and remove interior faces, because voxel models grow very fast otherwise.

## 7. Metadata file

`<asset_id>.json` is written by hand or by a later tool. Example:

```json
{
  "version": 1,
  "id": "wobble_character",
  "category": "characters",
  "assetVersion": 1,
  "status": "draft",
  "voxelSizeM": 0.1,
  "originRule": "bottom-center",
  "boundsM": { "x": 0.8, "y": 0.5, "z": 1.6 },
  "triangles": 0,
  "materials": ["mat_skin", "mat_hair", "mat_purple", "mat_jeans", "mat_red"],
  "textures": [],
  "notes": ""
}
```

| Field | Rule |
| --- | --- |
| `version` | Format version of this file. Always `1` for now. |
| `id` | Same as the folder name and asset id. |
| `category` | `characters`, `props` or `environments`, matching the parent folder. |
| `assetVersion` | Whole number, starts at 1. Increase when the asset changes in a way scenes can notice. |
| `status` | `draft`, `review` or `approved`. Only `approved` assets go into production, the same gate idea as the brief. |
| `voxelSizeM` | Always `0.1` for now. |
| `boundsM` | Size of the bounding box in meters (width x, depth y, height z in Blender axes). |
| `triangles`, `materials`, `textures` | Filled in at export time. They are used by the validator in the next step. |

## 8. How a brief uses assets

For every asset id in an approved brief, look for `assets/<category>/<id>/<id>.glb`:

- Found and `status: approved` → use it.
- Missing → it goes on the to-build list for the asset designer. The id is already valid and final, so scenes can refer to it before the file exists.

Because ids are unique across categories, the lookup never needs the category from the brief.

## 9. Checklist before export

- [ ] Id matches the rules in section 1 and is unique.
- [ ] Collection, root empty and mesh names follow section 3.
- [ ] Scene units are metric with scale 1.0, and geometry is on the 0.1 m grid.
- [ ] Scale and rotation applied; root at world origin; origin placed per section 5.
- [ ] Front faces −Y in Blender; exporter set to +Y Up.
- [ ] Only Principled BSDF materials, named per section 6, no unused materials.
- [ ] Triangle count within budget.
- [ ] Metadata file filled in and matching the model.

## 10. Exporting and checking

**Export** (inside Blender, from the project root):

```
blender -b path/to/<asset_id>.blend --python scripts/blender/export_asset.py -- <asset_id>
```

The script exports the root empty and its children to `assets/<category>/<asset_id>/<asset_id>.glb` with Y-up, no image textures, and no cameras, lights or animation. The asset folder must already exist. The script has **not been run against real Blender yet**; expect to fix an option name on the first run.

**Check** (plain Node.js, free, no network):

```
npm run asset:check -- <asset_id>      one asset
npm run asset:check -- --all           every asset in assets/
npm run asset:check -- --brief [file]  which assets a brief can use, and which are still to build
```

An asset with errors makes the command exit with code 1. Warnings are for the reviewer and do not fail the run.

| Rule | Result |
| --- | --- |
| Metadata id, category, status, voxel size, origin rule, bounds | error |
| GLB is missing | warning while `draft`, error otherwise |
| Exactly one root node named `<asset_id>`, at the world origin | error |
| Default Blender names (`Cube.001`); missing names | error |
| Child names not of the form `<asset_id>_<part>` | warning |
| Scale not 1 (also negative), rotation not zero, matrix on a node | error |
| Material name not starting with `mat_`; more than 8 materials | error |
| Image textures that the metadata does not list | error |
| Metallic factor above 0 or unset; material not used by any mesh | warning |
| Triangles over the category budget; points or lines instead of triangles | error |
| Compressed geometry (Draco, meshopt) | error |
| Lowest point not at y = 0 or not centered over the origin (`bottom-center`) | error |
| Center not near the origin (`center`) | warning |
| Vertices off the 0.1 m grid | warning |
| Metadata triangles, bounds or materials differ from the GLB | warning |

Not checked automatically: which way the front faces (±Z), palette colors, and that the asset looks right. Those stay with the human review before `status` becomes `approved`.

## Open decisions

1. **Where binaries live.** `.blend` and `.glb` files are large and development happens on Android Termux with limited storage. Proposed: keep them out of Git for now and share through the render worker's storage; revisit Git LFS when a worker exists (Phase 5). Metadata and previews stay in Git.
2. **Voxel size.** 0.1 m with a 1.6 m Wobble is a guess. A smaller voxel gives a finer look but raises the triangle count.
3. **Crown color** and the exact hex values of the palette.
4. **Neutral pose:** T-pose or A-pose.
5. **Front direction and palette** are not checked by `asset:check` yet. A palette check needs `assets/palette.json`, which does not exist until the first asset is modelled.
