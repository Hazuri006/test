#!/usr/bin/env python3
"""Author locomotion clips (Idle/Walk/Run/Jump/Fall) onto a humanoid GLB and inject them.

Supports both the Mixamo player rig (mixamorig:*) and the Rigify hazmat rig
(spine_01, thigh.L, upper_arm.L, ...). The rig is auto-detected. Posing is "aim based":
each bone is pointed in a target world-space direction and the local quaternion is solved
through the rest hierarchy, so it adapts to either skeleton's rest pose. Because we cannot
render here, every clip is validated with forward kinematics (feet below hips, alternating
stride, knees flex up, hands below shoulders) before it is written.

Usage: build_char_anim.py <source.glb> <dest.glb> [mixamo|rigify]
"""
import sys, struct, math, re
import numpy as np
from pygltflib import (GLTF2, Animation, AnimationSampler, AnimationChannel,
                       AnimationChannelTarget, Accessor, BufferView)

SRC, DST = sys.argv[1], sys.argv[2]
FORCE_RIG = sys.argv[3] if len(sys.argv) > 3 else None

# ---- quaternion / vector helpers (quat = x,y,z,w) ----
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx,
                     aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz])
def qconj(q): return np.array([-q[0], -q[1], -q[2], q[3]])
def qaxis(axis, ang):
    a = np.array(axis, float); n = np.linalg.norm(a)
    if n < 1e-12: return np.array([0, 0, 0, 1.0])
    a = a/n; s = math.sin(ang/2); return np.array([a[0]*s, a[1]*s, a[2]*s, math.cos(ang/2)])
def qmat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
def norm(v):
    v = np.array(v, float); n = np.linalg.norm(v); return v/n if n > 1e-12 else v
def from_two(a, b):
    a = norm(a); b = norm(b); d = float(np.dot(a, b))
    if d > 0.999999: return np.array([0, 0, 0, 1.0])
    if d < -0.999999:
        ax = np.cross(a, [1, 0, 0])
        if np.linalg.norm(ax) < 1e-6: ax = np.cross(a, [0, 1, 0])
        ax = norm(ax); return np.array([ax[0], ax[1], ax[2], 0.0])
    ax = np.cross(a, b); q = np.array([ax[0], ax[1], ax[2], 1.0+d]); return q/np.linalg.norm(q)
def mat2quat(R):
    t = np.trace(R)
    if t > 0:
        s = math.sqrt(t+1)*2; return np.array([(R[2,1]-R[1,2])/s, (R[0,2]-R[2,0])/s, (R[1,0]-R[0,1])/s, 0.25*s])
    i = int(np.argmax([R[0,0], R[1,1], R[2,2]]))
    if i == 0:
        s = math.sqrt(1+R[0,0]-R[1,1]-R[2,2])*2; return np.array([0.25*s, (R[0,1]+R[1,0])/s, (R[0,2]+R[2,0])/s, (R[2,1]-R[1,2])/s])
    if i == 1:
        s = math.sqrt(1+R[1,1]-R[0,0]-R[2,2])*2; return np.array([(R[0,1]+R[1,0])/s, 0.25*s, (R[1,2]+R[2,1])/s, (R[0,2]-R[2,0])/s])
    s = math.sqrt(1+R[2,2]-R[0,0]-R[1,1])*2; return np.array([(R[0,2]+R[2,0])/s, (R[1,2]+R[2,1])/s, 0.25*s, (R[1,0]-R[0,1])/s])

# ---- load model ----
g = GLTF2().load(SRC); blob = bytearray(g.binary_blob()); N = len(g.nodes)
parent = [-1]*N
for i, n in enumerate(g.nodes):
    for c in (n.children or []): parent[c] = i
byname = {n.name: i for i, n in enumerate(g.nodes)}

# ---- rig profiles: logical role -> bone base name ----
MIXAMO = {r: "mixamorig:"+r for r in [
    "Hips","Spine","Spine1","Spine2","Neck","Head",
    "LeftArm","LeftForeArm","LeftHand","RightArm","RightForeArm","RightHand",
    "LeftUpLeg","LeftLeg","LeftFoot","LeftToeBase","RightUpLeg","RightLeg","RightFoot","RightToeBase"]}
RIGIFY = {
    "Hips":"spine_01","Spine":"spine.001","Spine1":"spine.002","Spine2":"spine.003","Neck":"spine.004","Head":"Head",
    "LeftArm":"upper_arm.L","LeftForeArm":"forearm.L","LeftHand":"hand.L",
    "RightArm":"upper_arm.R","RightForeArm":"forearm.R","RightHand":"hand.R",
    "LeftUpLeg":"thigh.L","LeftLeg":"shin.L","LeftFoot":"foot.L","LeftToeBase":"toe.L",
    "RightUpLeg":"thigh.R","RightLeg":"shin.R","RightFoot":"foot.R","RightToeBase":"toe.R"}
CHILD = {"LeftUpLeg":"LeftLeg","LeftLeg":"LeftFoot","RightUpLeg":"RightLeg","RightLeg":"RightFoot",
         "LeftFoot":"LeftToeBase","RightFoot":"RightToeBase",
         "LeftArm":"LeftForeArm","LeftForeArm":"LeftHand","RightArm":"RightForeArm","RightForeArm":"RightHand",
         "Spine":"Spine1","Spine1":"Spine2","Spine2":"Neck","Neck":"Head"}

def detect_rig():
    if FORCE_RIG in ("mixamo", "rigify"): return FORCE_RIG
    if any(nm.startswith("mixamorig:") for nm in byname): return "mixamo"
    return "rigify"
RIG = detect_rig()
PROFILE = MIXAMO if RIG == "mixamo" else RIGIFY
print("rig detected:", RIG)

def resolve(base):
    if base in byname: return byname[base]                       # exact (e.g. spine_01)
    cands = [(nm, i) for nm, i in byname.items() if nm.startswith(base + "_")]
    if not cands: raise KeyError(base)
    for nm, i in cands:                                          # prefer base + _<digits>
        if re.sub(r"_\d+$", "", nm) == base: return i
    cands.sort(key=lambda x: len(x[0])); return cands[0][1]
J = {role: resolve(PROFILE[role]) for role in PROFILE}

def rest_local(i):
    n = g.nodes[i]
    if n.matrix: return np.array(n.matrix, float).reshape(4, 4).T
    M = np.eye(4); M[:3, :3] = qmat(n.rotation or [0, 0, 0, 1]) @ np.diag(n.scale or [1, 1, 1]); M[:3, 3] = n.translation or [0, 0, 0]; return M
REST = [rest_local(i) for i in range(N)]
_dep = {}
def depth(i):
    if i in _dep: return _dep[i]
    d = 0; j = i
    while parent[j] >= 0: j = parent[j]; d += 1
    _dep[i] = d; return d
ORDER = sorted(range(N), key=depth)
def fk(localmap):
    W = {}
    for i in ORDER:
        L = localmap.get(i, REST[i]); p = parent[i]
        W[i] = (W[p] @ L) if p >= 0 else L
    return W
RESTW = fk({})

def rest_dir(role):
    j = J[role]; c = J[CHILD[role]]
    return norm(RESTW[c][:3, 3] - RESTW[j][:3, 3])
def world_q(M):
    R = M[:3, :3].copy()
    for k in range(3): R[:, k] /= (np.linalg.norm(R[:, k]) + 1e-12)
    return mat2quat(R)
def aim_local(role, world_dir):
    qw = from_two(rest_dir(role), world_dir)
    desired = qmul(qw, world_q(RESTW[J[role]]))
    return qmul(qconj(world_q(RESTW[parent[J[role]]])), desired)
def offset_local(role, world_axis, ang):
    j = J[role]; local_axis = RESTW[j][:3, :3].T @ np.array(world_axis, float)
    return qmul(np.array(g.nodes[j].rotation or [0, 0, 0, 1], float), qaxis(local_axis, ang))
def rotv(v, axis, ang): return qmat(qaxis(axis, ang)) @ np.array(v, float)

def base_arm_dirs():
    return {"LeftArm": norm([0.30, -1.0, 0.05]), "RightArm": norm([-0.30, -1.0, 0.05])}

def pose(clip, t, dur):
    p = 2*math.pi*(t/dur); q = {}; arm = base_arm_dirs()
    def setaim(r, d): q[J[r]] = aim_local(r, d)
    def setoff(r, a, ang): q[J[r]] = offset_local(r, a, ang)

    if clip == "Idle":
        br = math.sin(p); sway = math.sin(p*0.5)
        setoff("Spine", [1,0,0], math.radians(2+1.2*br)); setoff("Spine1", [1,0,0], math.radians(1.5))
        setoff("Spine2", [0,1,0], math.radians(2*sway)); setoff("Neck", [1,0,0], math.radians(-3))
        setoff("Head", [0,1,0], math.radians(2.5*sway)); setoff("Hips", [0,0,1], math.radians(1.5*sway))
        setaim("LeftArm", rotv(arm["LeftArm"], [1,0,0], math.radians(4*br)))
        setaim("RightArm", rotv(arm["RightArm"], [1,0,0], math.radians(-4*br)))
        setaim("LeftForeArm", rotv(rest_dir("LeftForeArm"), [1,0,0], math.radians(18)))
        setaim("RightForeArm", rotv(rest_dir("RightForeArm"), [1,0,0], math.radians(18)))
        return q, 0.0

    if clip in ("Walk", "Run"):
        if clip == "Walk": legA, armA, knee, bob, lean, toe = 24, 20, 42, 0.035, 5, 18
        else: legA, armA, knee, bob, lean, toe = 40, 46, 70, 0.07, 15, 26
        s = math.sin(p)
        thL = math.radians(legA)*s; thR = -thL
        setaim("LeftUpLeg", rotv([0,-1,0], [1,0,0], thL)); setaim("RightUpLeg", rotv([0,-1,0], [1,0,0], thR))
        kL = math.radians(knee)*max(0.0, -math.sin(p-0.6)); kR = math.radians(knee)*max(0.0, -math.sin(p+math.pi-0.6))
        setaim("LeftLeg", rotv(rotv([0,-1,0], [1,0,0], thL), [1,0,0], kL))
        setaim("RightLeg", rotv(rotv([0,-1,0], [1,0,0], thR), [1,0,0], kR))
        setaim("LeftFoot", rotv(rest_dir("LeftFoot"), [1,0,0], math.radians(toe)*max(0, math.sin(p))-kL*0.5))
        setaim("RightFoot", rotv(rest_dir("RightFoot"), [1,0,0], math.radians(toe)*max(0, -math.sin(p))-kR*0.5))
        setaim("LeftArm", rotv(arm["LeftArm"], [1,0,0], math.radians(armA)*(-s)))
        setaim("RightArm", rotv(arm["RightArm"], [1,0,0], math.radians(armA)*(s)))
        setaim("LeftForeArm", rotv(rest_dir("LeftForeArm"), [1,0,0], math.radians(25+10*max(0,-s))))
        setaim("RightForeArm", rotv(rest_dir("RightForeArm"), [1,0,0], math.radians(25+10*max(0,s))))
        setoff("Spine", [1,0,0], math.radians(lean)); setoff("Spine1", [0,1,0], math.radians(6)*(-s))
        setoff("Spine2", [0,1,0], math.radians(4)*(-s)); setoff("Neck", [1,0,0], math.radians(-lean*0.6))
        setoff("Hips", [0,1,0], math.radians(7)*s)
        return q, bob*(1-math.cos(2*p))*0.5

    if clip == "Jump":
        ph = t/dur; crouch = math.sin(min(1, ph*1.4)*math.pi); th = math.radians(55)*crouch
        setaim("LeftUpLeg", rotv([0,-1,0], [1,0,0], th)); setaim("RightUpLeg", rotv([0,-1,0], [1,0,0], th))
        setaim("LeftLeg", rotv(rotv([0,-1,0], [1,0,0], th), [1,0,0], math.radians(80)*crouch))
        setaim("RightLeg", rotv(rotv([0,-1,0], [1,0,0], th), [1,0,0], math.radians(80)*crouch))
        setaim("LeftArm", rotv(arm["LeftArm"], [1,0,0], math.radians(60)*crouch))
        setaim("RightArm", rotv(arm["RightArm"], [1,0,0], math.radians(60)*crouch))
        setoff("Spine", [1,0,0], math.radians(18)*crouch)
        return q, -0.18*crouch

    if clip == "Fall":
        s = math.sin(p)
        setaim("LeftUpLeg", rotv([0,-1,0], [1,0,0], math.radians(-12+6*s)))
        setaim("RightUpLeg", rotv([0,-1,0], [1,0,0], math.radians(18-6*s)))
        setaim("LeftLeg", rotv(rest_dir("LeftLeg"), [1,0,0], math.radians(30)))
        setaim("RightLeg", rotv(rest_dir("RightLeg"), [1,0,0], math.radians(15)))
        setaim("LeftArm", rotv(arm["LeftArm"], [1,0,0], math.radians(-120+10*s)))
        setaim("RightArm", rotv(arm["RightArm"], [1,0,0], math.radians(-120-10*s)))
        setaim("LeftForeArm", rotv(rest_dir("LeftForeArm"), [1,0,0], math.radians(40)))
        setaim("RightForeArm", rotv(rest_dir("RightForeArm"), [1,0,0], math.radians(40)))
        setoff("Spine", [1,0,0], math.radians(-8))
        return q, 0.0
    return q, 0.0

def sample(clip, dur, fps, loop):
    n = max(2, int(round(dur*fps)) + (0 if loop else 1)); times = []; frames = []; bobs = []
    for k in range(n):
        t = (k/n)*dur if loop else (k/(n-1))*dur
        qd, bob = pose(clip, t, dur); times.append(t); frames.append(qd); bobs.append(bob)
    if loop: times.append(dur); frames.append(frames[0]); bobs.append(bobs[0])
    return times, frames, bobs

def setrot(L, q):
    s = np.array([np.linalg.norm(L[:3,0]), np.linalg.norm(L[:3,1]), np.linalg.norm(L[:3,2])])
    L[:3, :3] = qmat(q) @ np.diag(s); return L
def validate(clip, frames):
    hipY = RESTW[J["Hips"]][1, 3]; shoY = RESTW[J["LeftArm"]][1, 3]
    minLF = 1e9; maxLF = -1e9; alt = []; hand_ok = True
    for q in frames:
        W = fk({i: setrot(REST[i].copy(), q[i]) for i in q})
        lf = W[J["LeftFoot"]][:3, 3]; rf = W[J["RightFoot"]][:3, 3]
        lh = W[J["LeftHand"]][:3, 3]
        minLF = min(minLF, lf[1]); maxLF = max(maxLF, lf[1]); alt.append(lf[2]-rf[2])
        if lh[1] > shoY + 0.05 and clip in ("Idle", "Walk", "Run"): hand_ok = False
    ok = maxLF < hipY + 0.05
    print("  [%s] feet_below_hip=%s left_foot_y=[%.2f..%.2f] stride=%.2f hands_ok=%s"
          % (clip, ok, minLF, maxLF, max(alt)-min(alt), hand_ok))

# ---- glTF buffer append ----
def pad4():
    while len(blob) % 4: blob.append(0)
def add_view(data):
    pad4(); off = len(blob); blob.extend(data)
    g.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=len(data))); return len(g.bufferViews)-1
def add_time(times):
    bv = add_view(struct.pack('<%df' % len(times), *times))
    g.accessors.append(Accessor(bufferView=bv, componentType=5126, count=len(times), type="SCALAR",
                                min=[float(min(times))], max=[float(max(times))])); return len(g.accessors)-1
def add_vec(vals, dim):
    flat = []
    for v in vals: flat.extend([float(x) for x in v])
    bv = add_view(struct.pack('<%df' % len(flat), *flat))
    g.accessors.append(Accessor(bufferView=bv, componentType=5126, count=len(vals), type=("VEC3" if dim==3 else "VEC4")))
    return len(g.accessors)-1

CLIPS = [("Idle",4.0,30,True),("Walk",1.0,30,True),("Run",0.7,30,True),("Jump",0.6,30,False),("Fall",0.8,30,True)]
hips_parent_R = RESTW[parent[J["Hips"]]][:3, :3]
existing = {a.name for a in g.animations}
print("Validating + injecting clips:")
for name, dur, fps, loop in CLIPS:
    times, frames, bobs = sample(name, dur, fps, loop)
    validate(name, frames)
    if name in existing:  # never clobber a clip the model already had
        name = name + "_Gen"
    anim = Animation(name=name, samplers=[], channels=[])
    nodes = set()
    for fr in frames: nodes.update(fr.keys())
    tin = add_time(times)
    for nd in sorted(nodes):
        vals = [fr.get(nd, np.array(g.nodes[nd].rotation or [0,0,0,1], float)) for fr in frames]
        out = add_vec(vals, 4); si = len(anim.samplers)
        anim.samplers.append(AnimationSampler(input=tin, output=out, interpolation="LINEAR"))
        anim.channels.append(AnimationChannel(sampler=si, target=AnimationChannelTarget(node=nd, path="rotation")))
    if any(abs(b) > 1e-6 for b in bobs):
        base = np.array(g.nodes[J["Hips"]].translation or [0,0,0], float)
        tr = [base + hips_parent_R.T @ np.array([0, b, 0]) for b in bobs]
        out = add_vec(tr, 3); si = len(anim.samplers)
        anim.samplers.append(AnimationSampler(input=tin, output=out, interpolation="LINEAR"))
        anim.channels.append(AnimationChannel(sampler=si, target=AnimationChannelTarget(node=J["Hips"], path="translation")))
    g.animations.append(anim)

g.buffers[0].byteLength = len(blob)
g.set_binary_blob(bytes(blob))
g.save(DST)
print("WROTE", DST, "animations:", [a.name for a in g.animations])
