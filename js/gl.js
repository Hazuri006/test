'use strict';
/* ============================================================================
   gl.js — thin WebGL2 wrapper: programs, buffers, framebuffers, meshes.
   ============================================================================ */

const GLU = {
  gl: null,
  hdr: false,          // true when we got float/half-float colour targets
  colorType: 0,

  init(canvas) {
    const opts = {
      alpha: false, antialias: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
      desynchronized: false
    };
    const gl = canvas.getContext('webgl2', opts);
    if (!gl) return null;
    this.gl = gl;

    // Float render targets give us a proper HDR pipeline (bloom, sun, bright
    // atmosphere).  Fall back gracefully rather than failing outright.
    const cbf = gl.getExtension('EXT_color_buffer_float');
    const cbhf = gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('OES_texture_half_float_linear');
    if (cbf) { this.hdr = true; this.colorType = gl.HALF_FLOAT; }
    else if (cbhf) { this.hdr = true; this.colorType = gl.HALF_FLOAT; }
    else { this.hdr = false; this.colorType = gl.UNSIGNED_BYTE; }
    return gl;
  },

  compile(type, src, name) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
      console.error('Shader compile failed [' + name + ']\n' + log + '\n' + lines);
      throw new Error('Shader compile failed: ' + name + '\n' + log);
    }
    return sh;
  },

  program(vsSrc, fsSrc, name) {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vsSrc, name + '.vert');
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSrc, name + '.frag');
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Link failed: ' + name + '\n' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);

    // Cache every active uniform and attribute location up front.
    const u = Object.create(null), a = Object.create(null);
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[0\]$/, '');
      u[base] = gl.getUniformLocation(p, info.name);
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return { prog: p, u, a, name };
  },

  /* ------------------------------------------------------------ textures -- */
  texture2D(w, h, internal, format, type, filter, wrap, data) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return t;
  },

  texture3D(size, data) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_3D, null);
    return t;
  },

  /* -------------------------------------------------------- framebuffers -- */
  /* Scene target: HDR colour + a real depth texture (we invert the logarithmic
     depth in the post pass to recover world-space distance). */
  makeSceneTarget(w, h) {
    const gl = this.gl;
    const internal = this.hdr ? gl.RGBA16F : gl.RGBA8;
    const type = this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const color = this.texture2D(w, h, internal, gl.RGBA, type, gl.LINEAR, gl.CLAMP_TO_EDGE);
    const depth = this.texture2D(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) console.warn('scene framebuffer incomplete');
    return { fbo, color, depth, w, h };
  },

  makeColorTarget(w, h, filter) {
    const gl = this.gl;
    const internal = this.hdr ? gl.RGBA16F : gl.RGBA8;
    const type = this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const color = this.texture2D(w, h, internal, gl.RGBA, type, filter || gl.LINEAR, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, color, w, h };
  },

  /* A framebuffer over textures somebody else owns: an existing colour target
     plus an existing depth buffer.  It exists so translucent geometry can be
     composited on top of a deferred pass — over the finished water rather than
     into the scene buffer the water is about to be drawn over — while still
     being depth-tested against the scene that pass was built from. */
  makeOverlayTarget(color, depth, w, h) {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) console.warn('overlay framebuffer incomplete');
    return { fbo, w, h };
  },

  deleteTarget(t) {
    if (!t) return;
    const gl = this.gl;
    if (t.color) gl.deleteTexture(t.color);
    if (t.depth) gl.deleteTexture(t.depth);
    if (t.fbo) gl.deleteFramebuffer(t.fbo);
  },

  /* ---------------------------------------------------------------- misc -- */
  bindTex(prog, uniform, unit, tex, target) {
    const gl = this.gl;
    if (prog.u[uniform] === undefined) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target || gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u[uniform], unit);
  }
};

/* ---------------------------------------------------------------- Mesh ---- */
/* A tiny interleaved-vertex mesh helper.  `layout` is a list of
   { name, size, type?, norm? } describing the interleaved attributes. */
class Mesh {
  constructor(gl, layout) {
    this.gl = gl;
    this.layout = layout;
    this.stride = 0;
    for (const l of layout) { l.offset = this.stride; this.stride += l.size * 4; }
    this.vao = null; this.vbo = null; this.ibo = null;
    this.indexCount = 0; this.instanceCount = 0;
    this.instVbo = null;
  }

  upload(vertices, indices, instLayout, instData) {
    const gl = this.gl;
    if (!this.vao) this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    if (!this.vbo) this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    for (let i = 0; i < this.layout.length; i++) {
      const l = this.layout[i];
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, l.size, gl.FLOAT, false, this.stride, l.offset);
    }

    if (indices) {
      if (!this.ibo) this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.indexCount = indices.length;
      this.indexType = (indices instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    } else {
      this.vertexCount = vertices.length / (this.stride / 4);
    }

    if (instLayout && instData) {
      let istride = 0;
      for (const l of instLayout) { l.offset = istride; istride += l.size * 4; }
      if (!this.instVbo) this.instVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
      gl.bufferData(gl.ARRAY_BUFFER, instData, gl.DYNAMIC_DRAW);
      const base = this.layout.length;
      for (let i = 0; i < instLayout.length; i++) {
        const l = instLayout[i];
        gl.enableVertexAttribArray(base + i);
        gl.vertexAttribPointer(base + i, l.size, gl.FLOAT, false, istride, l.offset);
        gl.vertexAttribDivisor(base + i, 1);
      }
      this.instanceCount = instData.length / (istride / 4);
      this.instStride = istride;
      this.instLayout = instLayout;
    }

    gl.bindVertexArray(null);
    return this;
  }

  updateInstances(data) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.instanceCount = data.length / (this.instStride / 4);
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (this.indexCount) gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  drawInstanced(count) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    const n = count === undefined ? this.instanceCount : count;
    if (n <= 0) return;
    gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, this.indexType, 0, n);
  }

  /* A second VAO over this mesh's existing geometry plus a fresh instance
     buffer.  Lets many chunks instance the same model without each one
     duplicating the vertex data. */
  instancedView(instData, instLayout) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    for (let i = 0; i < this.layout.length; i++) {
      const l = this.layout[i];
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, l.size, gl.FLOAT, false, this.stride, l.offset);
      gl.vertexAttribDivisor(i, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    let istride = 0;
    for (const l of instLayout) { l.offset = istride; istride += l.size * 4; }
    const ivbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ivbo);
    gl.bufferData(gl.ARRAY_BUFFER, instData, gl.STATIC_DRAW);
    const base = this.layout.length;
    for (let i = 0; i < instLayout.length; i++) {
      const l = instLayout[i];
      gl.enableVertexAttribArray(base + i);
      gl.vertexAttribPointer(base + i, l.size, gl.FLOAT, false, istride, l.offset);
      gl.vertexAttribDivisor(base + i, 1);
    }
    gl.bindVertexArray(null);

    const mesh = this;
    const ibytes = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
    return {
      vao, ivbo,
      count: instData.length / (istride / 4),
      _instBase: 0,

      /* One index range, drawn for a contiguous slice of the instances.  A
         model baked as several variants needs both halves of that: the range
         picks the variant's geometry, the slice picks the instances that chose
         it.  WebGL 2 has no baseInstance, so the slice is done by re-pointing
         the instance attributes — a few pointer calls, against a whole extra
         VAO and instance buffer per variant. */
      draw(indexStart, indexCount, instStart, instCount) {
        if (indexCount <= 0) return;
        const s = instStart || 0;
        const n = instCount === undefined ? this.count - s : instCount;
        if (n <= 0) return;
        gl.bindVertexArray(vao);
        if (s !== this._instBase) {
          gl.bindBuffer(gl.ARRAY_BUFFER, ivbo);
          for (let i = 0; i < instLayout.length; i++) {
            const l = instLayout[i];
            gl.vertexAttribPointer(base + i, l.size, gl.FLOAT, false, istride,
              l.offset + s * istride);
          }
          this._instBase = s;
        }
        gl.drawElementsInstanced(gl.TRIANGLES, indexCount, mesh.indexType,
          indexStart * ibytes, n);
      },
      dispose() { gl.deleteVertexArray(vao); gl.deleteBuffer(ivbo); }
    };
  }

  dispose() {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.ibo) gl.deleteBuffer(this.ibo);
    if (this.instVbo) gl.deleteBuffer(this.instVbo);
    this.vao = this.vbo = this.ibo = this.instVbo = null;
  }
}

/* ------------------------------------------------------- geometry builder -- */
/* Accumulates position / normal / colour / flag vertices for the procedural
   ship and prop meshes. */
class MeshBuilder {
  constructor() { this.v = []; this.i = []; }
  get vertCount() { return this.v.length / 10; }

  /* pos(3) normal(3) color(3) flag(1) */
  push(px, py, pz, nx, ny, nz, r, g, b, f) {
    this.v.push(px, py, pz, nx, ny, nz, r, g, b, f);
  }

  quad(a, b, c, d, col, flag, emissive) {
    // flat normal from the triangle plane
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.vertCount;
    const e = emissive || 0;
    const fl = (flag || 0) + e * 8; // flag packs: 0..7 part id, +8*emissive
    for (const p of [a, b, c, d]) this.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], fl);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /* Axis-aligned box between two corners, optionally tapered in X/Y at one
     end.  `taperAtZ0` picks which end narrows — a hull needs the taper at the
     nose, an engine nacelle at the tail. */
  box(x0, y0, z0, x1, y1, z1, col, flag, emissive, taper, taperAtZ0) {
    const t = taper === undefined ? 1 : taper;
    const tz = taperAtZ0 ? z0 : z1;
    const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
    const sx = (x1 - x0) * 0.5, sy = (y1 - y0) * 0.5;
    const P = (fx, fy, z) => {
      const s = (z === tz) ? t : 1;
      return [cx + fx * sx * s, cy + fy * sy * s, z];
    };
    const a = P(-1, -1, z0), b = P(1, -1, z0), c = P(1, 1, z0), d = P(-1, 1, z0);
    const e = P(-1, -1, z1), f = P(1, -1, z1), g = P(1, 1, z1), h = P(-1, 1, z1);
    this.quad(e, f, g, h, col, flag, emissive);   // +Z
    this.quad(b, a, d, c, col, flag, emissive);   // -Z
    this.quad(a, b, f, e, col, flag, emissive);   // -Y
    this.quad(c, d, h, g, col, flag, emissive);   // +Y
    this.quad(b, c, g, f, col, flag, emissive);   // +X
    this.quad(d, a, e, h, col, flag, emissive);   // -X
  }

  /* Cylinder along Z between z0 and z1. */
  cylinder(cx, cy, z0, z1, r0, r1, seg, col, flag, emissive, capA, capB) {
    const base = this.vertCount;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ca, ny = sa;
      this.push(cx + ca * r0, cy + sa * r0, z0, nx, ny, 0, col[0], col[1], col[2], (flag || 0) + (emissive || 0) * 8);
      this.push(cx + ca * r1, cy + sa * r1, z1, nx, ny, 0, col[0], col[1], col[2], (flag || 0) + (emissive || 0) * 8);
    }
    for (let i = 0; i < seg; i++) {
      const o = base + i * 2;
      this.i.push(o, o + 1, o + 3, o, o + 3, o + 2);
    }
    if (capB) {
      const c0 = this.vertCount;
      this.push(cx, cy, z1, 0, 0, 1, col[0], col[1], col[2], (flag || 0) + (emissive || 0) * 8);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        this.push(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, z1, 0, 0, 1, col[0], col[1], col[2], (flag || 0) + (emissive || 0) * 8);
      }
      for (let i = 0; i < seg; i++) this.i.push(c0, c0 + 1 + i, c0 + 2 + i);
    }
    if (capA) {
      const c0 = this.vertCount;
      this.push(cx, cy, z0, 0, 0, -1, col[0], col[1], col[2], (flag || 0) + (emissive || 0) * 8);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        this.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, z0, 0, 0, -1, col[0], col[1], col[2], (flag || 0) + (emissive || 0) * 8);
      }
      for (let i = 0; i < seg; i++) this.i.push(c0, c0 + 2 + i, c0 + 1 + i);
    }
  }

  /* Cylinder along Y — props are built in a frame where +Y is "up". */
  cylinderY(cx, cz, y0, y1, r0, r1, seg, col, flag, emissive, capA, capB) {
    const base = this.vertCount;
    const fl = (flag || 0) + (emissive || 0) * 8;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      this.push(cx + ca * r0, y0, cz + sa * r0, ca, 0, sa, col[0], col[1], col[2], fl);
      this.push(cx + ca * r1, y1, cz + sa * r1, ca, 0, sa, col[0], col[1], col[2], fl);
    }
    for (let i = 0; i < seg; i++) {
      const o = base + i * 2;
      this.i.push(o, o + 1, o + 3, o, o + 3, o + 2);
    }
    if (capB) {
      const c0 = this.vertCount;
      this.push(cx, y1, cz, 0, 1, 0, col[0], col[1], col[2], fl);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        this.push(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, col[0], col[1], col[2], fl);
      }
      for (let i = 0; i < seg; i++) this.i.push(c0, c0 + 1 + i, c0 + 2 + i);
    }
    if (capA) {
      const c0 = this.vertCount;
      this.push(cx, y0, cz, 0, -1, 0, col[0], col[1], col[2], fl);
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU;
        this.push(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0, col[0], col[1], col[2], fl);
      }
      for (let i = 0; i < seg; i++) this.i.push(c0, c0 + 2 + i, c0 + 1 + i);
    }
  }

  /* Icosphere with optional per-vertex radial noise (rocks, boulders). */
  sphere(cx, cy, cz, radius, subdiv, col, flag, distortFn) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ].map(v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    for (let s = 0; s < subdiv; s++) {
      const cache = new Map();
      const mid = (a, b) => {
        const k = a < b ? a + ',' + b : b + ',' + a;
        if (cache.has(k)) return cache.get(k);
        const va = verts[a], vb = verts[b];
        let m = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
        const l = Math.hypot(m[0], m[1], m[2]);
        m = [m[0] / l, m[1] / l, m[2] / l];
        verts.push(m); cache.set(k, verts.length - 1);
        return verts.length - 1;
      };
      const nf = [];
      for (const f of faces) {
        const a = mid(f[0], f[1]), b = mid(f[1], f[2]), c = mid(f[2], f[0]);
        nf.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]);
      }
      faces = nf;
    }
    const rad = verts.map(v => distortFn ? radius * distortFn(v[0], v[1], v[2]) : radius);
    const base = this.vertCount;
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i], r = rad[i];
      this.push(cx + v[0] * r, cy + v[1] * r, cz + v[2] * r, v[0], v[1], v[2], col[0], col[1], col[2], flag || 0);
    }
    for (const f of faces) this.i.push(base + f[0], base + f[1], base + f[2]);
    if (distortFn) this.recomputeNormals(base);
  }

  /* Re-derive smooth normals for vertices added since `from`. */
  recomputeNormals(from) {
    const n = this.vertCount;
    const acc = new Float32Array((n - from) * 3);
    for (let k = 0; k < this.i.length; k += 3) {
      const ia = this.i[k], ib = this.i[k + 1], ic = this.i[k + 2];
      if (ia < from) continue;
      const a = ia * 10, b = ib * 10, c = ic * 10;
      const ux = this.v[b] - this.v[a], uy = this.v[b + 1] - this.v[a + 1], uz = this.v[b + 2] - this.v[a + 2];
      const vx = this.v[c] - this.v[a], vy = this.v[c + 1] - this.v[a + 1], vz = this.v[c + 2] - this.v[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const idx of [ia, ib, ic]) {
        const o = (idx - from) * 3;
        acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz;
      }
    }
    for (let i = from; i < n; i++) {
      const o = (i - from) * 3;
      const l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
      this.v[i * 10 + 3] = acc[o] / l;
      this.v[i * 10 + 4] = acc[o + 1] / l;
      this.v[i * 10 + 5] = acc[o + 2] / l;
    }
  }

  build(gl) {
    const m = new Mesh(gl, [
      { name: 'aPos', size: 3 }, { name: 'aNormal', size: 3 },
      { name: 'aColor', size: 3 }, { name: 'aFlag', size: 1 }
    ]);
    const idx = this.vertCount > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    m.upload(new Float32Array(this.v), idx);
    return m;
  }

  buildInstanced(gl, instData) {
    const m = new Mesh(gl, [
      { name: 'aPos', size: 3 }, { name: 'aNormal', size: 3 },
      { name: 'aColor', size: 3 }, { name: 'aFlag', size: 1 }
    ]);
    const idx = this.vertCount > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    m.upload(new Float32Array(this.v), idx, [
      { name: 'iOffset', size: 3 }, { name: 'iRot', size: 4 }, { name: 'iTint', size: 4 }
    ], instData || new Float32Array(0));
    return m;
  }
}
