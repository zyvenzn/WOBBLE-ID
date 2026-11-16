// Test helper (no tests in this file): builds small GLB files in memory.

const pad4 = (buffer, fill) => {
  const extra = (4 - (buffer.length % 4)) % 4;
  return Buffer.concat([buffer, Buffer.alloc(extra, fill)]);
};

export function makeGlb(gltf, bin = null) {
  const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
  const chunks = [chunk(0x4e4f534a, json)];
  if (bin) chunks.push(chunk(0x004e4942, pad4(Buffer.from(bin), 0)));

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
}

// A box 0.4 m wide (x), 0.6 m tall (y), 0.2 m deep (z), standing on y=0,
// centered over the origin, on the 0.1 m grid. 12 triangles, one material.
export function boxAsset(id = "voxel_box", { x = 0.4, h = 0.6, z = 0.2 } = {}) {
  const hx = x / 2;
  const hz = z / 2;
  const positions = new Float32Array([
    -hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz,
    -hx, h, -hz, hx, h, -hz, hx, h, hz, -hx, h, hz
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 3, 2, 6, 3, 6, 7,
    0, 1, 5, 0, 5, 4, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
  ]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);

  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: id, children: [1] },
      { name: `${id}_body`, mesh: 0 }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [
      {
        name: "mat_purple",
        pbrMetallicRoughness: { baseColorFactor: [0.4, 0.2, 0.7, 1], metallicFactor: 0, roughnessFactor: 1 }
      }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-hx, 0, -hz], max: [hx, h, hz] },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
    ],
    buffers: [{ byteLength: bin.length }]
  };

  // Metadata axes are Blender's: x width, y depth, z height.
  const meta = {
    version: 1,
    id,
    category: "props",
    assetVersion: 1,
    status: "draft",
    voxelSizeM: 0.1,
    originRule: "bottom-center",
    boundsM: { x, y: z, z: h },
    triangles: 12,
    materials: ["mat_purple"],
    textures: [],
    notes: ""
  };

  return { gltf, bin, meta };
}
