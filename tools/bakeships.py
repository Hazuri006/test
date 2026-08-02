"""Bake the five purchasable ship .glb files into js/shipmodels.js.

Same treatment as the astronaut: merge the primitives, decimate with quadric
edge collapses, carry the attributes across by nearest-vertex transfer, and pack
the base-colour textures into one atlas per ship.  These have no rig and no
animation, so there is no skeleton to prune — the work is orientation and scale.

Every source uses a different idea of which way is up and which way is forward.
The per-model basis below maps each into the engine's convention (-Z forward,
+Y up) and was read off orthographic silhouettes of the raw meshes.
"""
import json, struct, io, base64, os, numpy as np
from PIL import Image
import fast_simplification as fsim

D = '/root/.claude/uploads/edb7f323-3b09-5a52-ab50-ad834433858e/'
OUT = '/home/user/test/js/shipmodels.js'
TILE = 512
TRIS = 30000

I3 = np.eye(3)
YAW180 = np.array([[-1., 0, 0], [0, 1., 0], [0, 0, -1.]])
ZUP_YFWD = np.array([[1., 0, 0], [0, 0, 1.], [0, -1., 0]])

SHIPS = [
    dict(file='cd1579a2-old_worn_out_spaceship.glb', id='drifter',
         basis=I3, length=26.0),
    dict(file='6b95ea3c-cargo_spaceship.glb', id='mule',
         basis=I3, length=30.0),
    dict(file='435a35de-spaceship_1.glb', id='harrier',
         basis=YAW180, length=24.0),
    dict(file='f614d075-light_fighter_spaceship__free_.glb', id='falcon',
         basis=YAW180, length=21.0),
    dict(file='b7bc3c97-spaceship.glb', id='paladin',
         basis=YAW180, length=38.0),
]

CT = {5125: '<u4', 5123: '<u2', 5121: '<u1', 5126: '<f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    J = json.loads(b[20:20+jl].decode('utf8'))
    BIN = b[20+jl+((4-jl % 4) % 4)+8:]
    return J, BIN


def baker(J, BIN):
    def bv(i):
        v = J['bufferViews'][i]; o = v.get('byteOffset', 0)
        return BIN[o:o+v['byteLength']]
    def acc(i):
        a = J['accessors'][i]; n = NC[a['type']]
        return np.frombuffer(bv(a['bufferView']), dtype=np.dtype(CT[a['componentType']]),
                             count=a['count']*n, offset=a.get('byteOffset', 0)).reshape(a['count'], n)
    return bv, acc


def node_world(J):
    """Global transform per node, so primitives land where the scene puts them."""
    nodes = J.get('nodes', [])
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    def qm(q):
        x, y, z, w = q
        return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                         [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                         [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    def lm(n):
        if 'matrix' in n:
            return np.array(n['matrix']).reshape(4, 4).T
        M = np.eye(4)
        if 'scale' in n: M = M @ np.diag(list(n['scale']) + [1.0])
        if 'rotation' in n:
            T = np.eye(4); T[:3, :3] = qm(n['rotation']); M = T @ M
        if 'translation' in n:
            T = np.eye(4); T[:3, 3] = n['translation']; M = T @ M
        return M
    W = {}
    def wm(i):
        if i in W: return W[i]
        m = lm(nodes[i])
        if i in parent: m = wm(parent[i]) @ m
        W[i] = m
        return m
    out = {}
    for i, n in enumerate(nodes):
        if 'mesh' in n:
            out.setdefault(n['mesh'], []).append(wm(i))
    return out


def base_colour_image(J, mat):
    m = J['materials'][mat] if mat is not None and mat < len(J.get('materials', [])) else {}
    pbr = m.get('pbrMetallicRoughness', {})
    t = pbr.get('baseColorTexture')
    if t is None:
        ext = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness', {})
        t = ext.get('diffuseTexture')
    if t is None:
        return None, pbr.get('baseColorFactor', [0.6, 0.62, 0.66, 1])
    return J['textures'][t['index']]['source'], pbr.get('baseColorFactor', [1, 1, 1, 1])


def bake(spec):
    J, BIN = load(D + spec['file'])
    bv, acc = baker(J, BIN)
    meshxf = node_world(J)

    # one entry per (material) so each gets an atlas tile
    mats = sorted(set(p.get('material') for m in J['meshes'] for p in m['primitives']),
                  key=lambda v: (v is None, v))
    tile_of = {m: i for i, m in enumerate(mats)}
    cols = min(4, max(1, len(mats)))
    rows = (len(mats) + cols - 1) // cols
    AW, AH = cols * TILE, rows * TILE

    total = sum(J['accessors'][p['indices']]['count'] // 3
                for m in J['meshes'] for p in m['primitives'] if 'indices' in p)
    keep = min(1.0, TRIS / max(total, 1))

    P = []; N = []; U = []; I = []
    vbase = 0
    for mi, mesh in enumerate(J['meshes']):
        xfs = meshxf.get(mi, [np.eye(4)])
        for prim in mesh['primitives']:
            if 'indices' not in prim: continue
            p0 = acc(prim['attributes']['POSITION']).astype(np.float64)
            n0 = acc(prim['attributes']['NORMAL']).astype(np.float64) \
                if 'NORMAL' in prim['attributes'] else np.tile([0, 1, 0], (len(p0), 1)).astype(np.float64)
            u0 = acc(prim['attributes']['TEXCOORD_0']).astype(np.float64) \
                if 'TEXCOORD_0' in prim['attributes'] else np.zeros((len(p0), 2))
            f = acc(prim['indices']).ravel().astype(np.int64).reshape(-1, 3)
            xf = xfs[0]
            p0 = p0 @ xf[:3, :3].T + xf[:3, 3]
            n0 = n0 @ xf[:3, :3].T

            ti = tile_of[prim.get('material')]
            x0, y0 = (ti % cols) * TILE, (ti // cols) * TILE
            s = (np.clip(u0[:, 0], 0, 1) * TILE + x0) / AW
            t = 1.0 - (np.clip(u0[:, 1], 0, 1) * TILE + y0) / AH

            P.append(p0); N.append(n0); U.append(np.stack([s, t], 1))
            I.append(f.ravel() + vbase)
            vbase += len(p0)

    P = np.vstack(P); N = np.vstack(N); U = np.vstack(U); I = np.concatenate(I)

    # One decimation over the merged hull rather than one per primitive: a
    # thirty-part model cannot lose 94% of a twenty-triangle part, so per-part
    # reduction misses the budget by a factor of three.  Orphan vertices have to
    # go first — the decimator's replay pass indexes past the end of the vertex
    # array when there are any.
    F = I.reshape(-1, 3)
    used, inv = np.unique(F.ravel(), return_inverse=True)
    P, N, U = P[used], N[used], U[used]
    F = inv.ravel().reshape(-1, 3).astype(np.int64)

    # Weld coincident vertices before decimating.  This is the whole ball game.
    # Every exporter splits a vertex wherever the UV or the normal changes, so a
    # hull that is one closed surface arrives as a quarter of a million loose
    # corners — and to a quadric decimator, a split vertex is a boundary it must
    # not move.  Given a mesh that is nothing but boundary it does the only
    # thing it can: collapses the interiors and leaves the seams behind as torn
    # sheets, which is exactly what the first bake produced.  Weld first and the
    # same decimator at the same ratio keeps the shape.
    key = np.round(P * 1e4).astype(np.int64)
    uk, first, winv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    winv = winv.ravel()
    Pw = P[first]
    Fw = winv[F]
    Fw = Fw[(Fw[:, 0] != Fw[:, 1]) & (Fw[:, 1] != Fw[:, 2]) & (Fw[:, 0] != Fw[:, 2])]
    print('    welded %d -> %d verts, %d -> %d tris' % (len(P), len(Pw), len(F), len(Fw)))

    red = 1.0 - min(1.0, TRIS / max(len(Fw), 1))
    if red > 0.02:
        pf = np.ascontiguousarray(Pw, np.float32)
        ff = np.ascontiguousarray(Fw, np.int32)
        _, _, col = fsim.simplify(pf, ff, red, return_collapses=True)
        p2, f2, imap = fsim.replay_simplification(pf, ff, col)
        order = np.argsort(imap, kind='stable')
        st = np.searchsorted(imap[order], np.arange(len(p2)))
        en = np.searchsorted(imap[order], np.arange(len(p2)), side='right')
        pick = np.zeros(len(p2), np.int64)
        for v in range(len(p2)):
            grp = order[st[v]:en[v]]
            w = grp[0] if len(grp) == 1 else grp[int(np.argmin(((Pw[grp] - p2[v]) ** 2).sum(1)))]
            pick[v] = first[w]          # back to an original vertex for its UV
        P, N, U, F = p2.astype(np.float64), N[pick], U[pick], f2.astype(np.int64)
    else:
        P, N, U, F = Pw, N[first], U[first], Fw
    I = F.ravel()

    # orient, scale, and seat the hull so its lowest point is the landing plane
    P = P @ spec['basis'].T
    N = N @ spec['basis'].T
    lo, hi = P.min(0), P.max(0)
    scale = spec['length'] / (hi[2] - lo[2])
    P = (P - (lo + hi) / 2) * scale
    lo, hi = P.min(0), P.max(0)
    P[:, 1] -= lo[1]                       # keel at y = 0
    lo, hi = P.min(0), P.max(0)

    # atlas
    atlas = Image.new('RGB', (AW, AH), (110, 112, 118))
    for m in mats:
        src, factor = base_colour_image(J, m)
        ti = tile_of[m]
        box = ((ti % cols) * TILE, (ti // cols) * TILE)
        if src is None:
            c = tuple(int(255 * min(1, max(0, factor[k]))) for k in range(3))
            atlas.paste(Image.new('RGB', (TILE, TILE), c), box)
        else:
            im = Image.open(io.BytesIO(bv(J['images'][src]['bufferView']))).convert('RGB')
            atlas.paste(im.resize((TILE, TILE), Image.LANCZOS), box)
    buf = io.BytesIO(); atlas.save(buf, 'JPEG', quality=84, optimize=True)
    tex = buf.getvalue()

    assert len(P) < 65536, (spec['id'], len(P))
    pc = (lo + hi) / 2; ph = np.maximum((hi - lo) / 2, 1e-6)
    pq = np.round((P - pc) / ph * 32767).astype(np.int16)
    nl = np.linalg.norm(N, axis=1, keepdims=True)
    nq = np.round(np.clip(N / np.maximum(nl, 1e-9), -1, 1) * 127).astype(np.int8)
    uq = np.round(np.clip(U, 0, 1) * 65535).astype(np.uint16)
    iq = I.astype(np.uint16)

    # engine mounts: the aft-most cluster of vertices, split left/right
    aft = P[P[:, 2] > hi[2] - (hi[2] - lo[2]) * 0.10]
    if len(aft) < 8:
        eng = [[0, (hi[1] - lo[1]) * 0.4, hi[2] * 0.98, (hi[0] - lo[0]) * 0.07]]
    else:
        span = hi[0] - lo[0]
        left = aft[aft[:, 0] < -span * 0.10]
        right = aft[aft[:, 0] > span * 0.10]
        eng = []
        for side in (left, right):
            if len(side) > 20:
                eng.append([float(side[:, 0].mean()), float(side[:, 1].mean()),
                            float(hi[2] * 0.97), float(span * 0.055)])
        if not eng:
            eng = [[0.0, float(aft[:, 1].mean()), float(hi[2] * 0.97), float(span * 0.075)]]
    sil(spec['id'], P)
    print('  %-9s %6d tris %5d verts  ext %s  engines %d  atlas %dx%d %dKB' %
          (spec['id'], len(iq)//3, len(P), (hi-lo).round(1), len(eng), AW, AH, len(tex)//1024))

    e64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    return """  {
    id: '%s',
    vertexCount: %d, indexCount: %d,
    bounds: { lo: [%s], hi: [%s] },
    posBias: [%s], posScale: [%s],
    engines: [%s],
    pos: '%s',
    nrm: '%s',
    uv:  '%s',
    idx: '%s',
    tex: 'data:image/jpeg;base64,%s'
  }""" % (spec['id'], len(P), len(iq),
          ', '.join('%.3f' % v for v in lo), ', '.join('%.3f' % v for v in hi),
          ', '.join('%.5f' % v for v in pc), ', '.join('%.5f' % v for v in ph),
          ', '.join('[%s]' % ', '.join('%.3f' % c for c in e) for e in eng),
          e64(pq), e64(nq), e64(uq), e64(iq),
          base64.b64encode(tex).decode())


SIL = Image.new('L', (240 * 3, 240 * len(SHIPS)))
SIL_ROW = [0]
def sil(name, P):
    W = H = 240
    lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; s = (hi - lo).max() / 2 * 1.12
    for col, (a, b) in enumerate([(0, 1), (2, 1), (0, 2)]):
        img = np.zeros((H, W), np.uint8)
        ix = (((P[:, a] - c[a]) / s * 0.5 + 0.5) * (W - 1)).astype(int)
        iy = (((P[:, b] - c[b]) / s * 0.5 + 0.5) * (H - 1)).astype(int)
        ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
        np.add.at(img, (H - 1 - iy[ok], ix[ok]), 70)
        SIL.paste(Image.fromarray(np.minimum(img.astype(np.int32) * 3, 255).astype(np.uint8)),
                  (col * W, SIL_ROW[0] * H))
    SIL_ROW[0] += 1

print('baking %d hulls' % len(SHIPS))
bodies = [bake(s) for s in SHIPS]
js = """'use strict';
/* ============================================================================
   shipmodels.js — the purchasable hulls, baked from glTF.

   Static meshes, so unlike the starship in shipmodel.js there is no rig and no
   animation to deal with; the work here was orientation and scale.  Every
   source had its own idea of which way is up and which way is forward, so the
   bake carries a per-model basis that maps each into the engine's convention
   of -Z forward and +Y up, and then scales the hull to a stated length and
   drops its keel to y = 0 so it sits on its landing gear.

   Each is decimated to about fifteen thousand triangles with quadric edge
   collapses, its attributes carried across by nearest-vertex transfer, and its
   base-colour textures packed into one atlas.  Engine mounts are found the same
   way the starship's were: the aft-most cluster of vertices, split left and
   right of the centreline.
   ============================================================================ */

const SHIP_HULLS = [
%s
];
""" % ',\n'.join(bodies)
open(OUT, 'w').write(js)
SIL.save('/tmp/claude-0/-home-user-test/edb7f323-3b09-5a52-ab50-ad834433858e/scratchpad/shipsil.png')
print('wrote', OUT, round(os.path.getsize(OUT)/1e6, 2), 'MB')
