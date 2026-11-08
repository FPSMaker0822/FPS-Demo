// 타겟(휴먼 봇 / 구체 / 풍선), 파괴 이펙트, 히트 판정
import * as THREE from '../vendor/three.module.min.js';

export const PALETTE = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#ff8fab', '#f77f00', '#3a86ff'];

export const TARGET_KINDS = {
  bot: { label: '휴먼 봇', desc: '머리 + 몸통. 헤드샷 보너스', color: '#ff3d5a' },
  orb: { label: '구체', desc: '빛나는 공 타겟', color: '#2ef2b0' },
  balloon: { label: '풍선', desc: '알록달록 풍선', color: 'rainbow' },
};

// 휴먼 봇 비율 (radius 단위). r=0.6이면 키 약 1.9m
const BOT = { bodyR: 0.55, bodyLen: 1.2, headR: 0.4, neck: 0.06 };
BOT.bodyHalf = BOT.bodyR + BOT.bodyLen / 2;
BOT.headY = BOT.bodyHalf + BOT.neck + BOT.headR;

export function bottomOffsetFor(kind, r) {
  return r * (kind === 'bot' ? BOT.bodyHalf : kind === 'balloon' ? 1.25 : 1);
}

const SPHERE = new THREE.SphereGeometry(1, 36, 24);
const KNOT = new THREE.ConeGeometry(0.14, 0.22, 12);
const HEAD = new THREE.SphereGeometry(BOT.headR, 28, 20);
// 보이는 모양 (히트박스 캡슐 안쪽에 들어가도록)
const TORSO = new THREE.CapsuleGeometry(0.5, 0.5, 8, 24);
const LEG = new THREE.CapsuleGeometry(0.2, 0.7, 6, 14);
const VISOR = new THREE.BoxGeometry(0.5, 0.12, 0.12);
const BELT = new THREE.CylinderGeometry(0.47, 0.47, 0.08, 24);
const RING_GEO = new THREE.RingGeometry(0.85, 1, 40);

function makeMaterial(kind, color) {
  if (kind === 'balloon') {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: 0.32, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.15, emissive: color, emissiveIntensity: 0.1,
    });
  }
  if (kind === 'orb') {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.55 });
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, emissive: color, emissiveIntensity: 0.12 });
}
const matCache = new Map();
function sharedMaterial(kind, color) {
  const key = kind + color;
  if (!matCache.has(key)) matCache.set(key, makeMaterial(kind, color));
  return matCache.get(key);
}
const ACCENT_MAT = new THREE.MeshStandardMaterial({ color: '#0d1020', roughness: 0.4, metalness: 0.4 });

const easeOutBack = (k) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

const HP_BG = new THREE.SpriteMaterial({ color: '#000000', transparent: true, opacity: 0.55, depthWrite: false });

export class Target {
  constructor(scene, { kind = 'bot', position, radius = 0.6, color = '#ff3d5a', unique = false }) {
    this.scene = scene;
    this.kind = kind;
    this.radius = radius;
    this.color = color;
    this.unique = unique;
    this.material = unique ? makeMaterial(kind, color) : sharedMaterial(kind, color);
    this.baseEmissive = this.material.emissiveIntensity;
    this.group = new THREE.Group();

    if (kind === 'bot') {
      const torso = new THREE.Mesh(TORSO, this.material);
      torso.position.y = 0.35;
      const legL = new THREE.Mesh(LEG, this.material);
      legL.position.set(-0.22, -0.55, 0);
      const legR = legL.clone();
      legR.position.x = 0.22;
      const belt = new THREE.Mesh(BELT, ACCENT_MAT);
      belt.position.y = -0.05;
      const head = new THREE.Mesh(HEAD, this.material);
      head.position.y = BOT.headY;
      const visor = new THREE.Mesh(VISOR, ACCENT_MAT);
      visor.position.set(0, BOT.headY + 0.04, BOT.headR * 0.82);
      this.group.add(torso, legL, legR, belt, head, visor);
    } else if (kind === 'balloon') {
      const body = new THREE.Mesh(SPHERE, this.material);
      body.scale.set(1, 1.12, 1);
      const knot = new THREE.Mesh(KNOT, this.material);
      knot.position.y = -1.18;
      this.group.add(body, knot);
    } else {
      this.group.add(new THREE.Mesh(SPHERE, this.material));
    }

    this.group.position.copy(position);
    this.group.scale.setScalar(0.001);
    this.phase = Math.random() * Math.PI * 2;
    this.age = 0;
    this.inflate = 1;
    this.dead = false;
    this.data = {};
    scene.add(this.group);
  }

  get position() {
    return this.group.position;
  }

  /** 대략적인 크기(이펙트/간격 계산용) */
  hitRadius() {
    return this.radius * this.inflate * (this.kind === 'bot' ? 1.1 : 1.06);
  }

  /** 중심에서 바닥(발끝)까지 거리 */
  bottomOffset(r = this.radius) {
    return bottomOffsetFor(this.kind, r);
  }

  /** 중심에서 머리 꼭대기까지 */
  topOffset() {
    return this.radius * (this.kind === 'bot' ? BOT.headY + BOT.headR : 1.15);
  }

  /** 레이 판정: { t, head } 또는 null */
  intersect(ray) {
    const s = this.radius * this.inflate;
    const c = this.group.position;
    if (this.kind === 'bot') {
      let best = null;
      _v.set(c.x, c.y + BOT.headY * s, c.z);
      const hr = BOT.headR * s * 1.05;
      if (ray.distanceSqToPoint(_v) <= hr * hr) {
        const t = _v.sub(ray.origin).dot(ray.direction);
        if (t > 0) best = { t, head: true };
      }
      _a.set(c.x, c.y - (BOT.bodyLen / 2) * s, c.z);
      _b.set(c.x, c.y + (BOT.bodyLen / 2) * s, c.z);
      const br = BOT.bodyR * s;
      if (ray.distanceSqToSegment(_a, _b, _p) <= br * br) {
        const t = _p.sub(ray.origin).dot(ray.direction);
        if (t > 0 && (!best || t < best.t - 0.05)) best = { t, head: false };
      }
      return best;
    }
    const r = this.hitRadius();
    if (ray.distanceSqToPoint(c) > r * r) return null;
    const t = _v.copy(c).sub(ray.origin).dot(ray.direction);
    return t > 0 ? { t, head: false } : null;
  }

  setHp(frac) {
    if (!this.hpFill) {
      const bg = new THREE.Sprite(HP_BG);
      this.hpFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#2ef2b0', depthWrite: false }));
      this.hpFill.center.set(0, 0.5);
      bg.scale.set(1.9, 0.2, 1);
      const y = this.topOffset() / this.radius + 0.45;
      bg.position.set(0, y, 0);
      this.hpFill.position.set(-0.93, y, 0.001);
      this.group.add(bg, this.hpFill);
    }
    const f = Math.max(0, Math.min(1, frac));
    this.hpFill.scale.set(1.86 * f, 0.13, 1);
    this.hpFill.material.color.set(f > 0.5 ? '#2ef2b0' : f > 0.25 ? '#ffcf4d' : '#ff5d6c');
  }

  setLit(on) {
    if (this.unique) this.material.emissiveIntensity = on ? this.baseEmissive + 0.5 : this.baseEmissive;
  }

  update(dt) {
    this.age += dt;
    const k = Math.min(1, this.age / 0.14);
    const s = this.radius * this.inflate * (k < 1 ? Math.max(0.001, easeOutBack(k)) : 1);
    this.group.scale.setScalar(s);
    if (this.kind === 'balloon') this.group.rotation.z = Math.sin(this.age * 1.7 + this.phase) * 0.07;
  }

  dispose() {
    this.dead = true;
    this.scene.remove(this.group);
    if (this.unique) this.material.dispose();
    if (this.hpFill) this.hpFill.material.dispose();
  }
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ray = new THREE.Ray();

/** 카메라 중심 레이와 가장 먼저 맞는 타겟 → { target, head } | null */
export function rayHit(origin, dir, targets) {
  _ray.set(origin, dir);
  let best = null;
  for (const tg of targets) {
    if (tg.dead) continue;
    const h = tg.intersect(_ray);
    if (h && (!best || h.t < best.t)) best = { target: tg, head: h.head, t: h.t };
  }
  return best;
}

const DOT_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.items = [];
  }

  burst(pos, color, radius, { count = 30, ring = true, speed = 1, height = 0 } = {}) {
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      let x, y, z, l;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        l = x * x + y * y + z * z;
      } while (l > 1 || l < 0.05);
      l = Math.sqrt(l);
      x /= l; y /= l; z /= l;
      const s = (2.5 + Math.random() * 4) * (0.5 + radius) * speed;
      vel.push(x * s, y * s + 1.2, z * s);
      const oy = height ? (Math.random() - 0.3) * height : 0;
      positions[i * 3] = pos.x + x * radius * 0.8;
      positions[i * 3 + 1] = pos.y + y * radius * 0.8 + oy;
      positions[i * 3 + 2] = pos.z + z * radius * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.14 + radius * 0.3, map: DOT_TEX, transparent: true, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    let ringMesh = null;
    if (ring) {
      const rm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
      ringMesh = new THREE.Mesh(RING_GEO, rm);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(this.camera.position);
      ringMesh.scale.setScalar(radius);
      this.scene.add(ringMesh);
    }
    this.items.push({ points, vel, ring: ringMesh, radius, life: 0, max: 0.6 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      const p = it.points.geometry.attributes.position.array;
      const drag = Math.max(0, 1 - 2.8 * dt);
      for (let j = 0; j < it.vel.length; j += 3) {
        it.vel[j] *= drag;
        it.vel[j + 1] = it.vel[j + 1] * drag - 9 * dt;
        it.vel[j + 2] *= drag;
        p[j] += it.vel[j] * dt;
        p[j + 1] += it.vel[j + 1] * dt;
        p[j + 2] += it.vel[j + 2] * dt;
      }
      it.points.geometry.attributes.position.needsUpdate = true;
      it.points.material.opacity = Math.max(0, 1 - it.life / it.max);
      if (it.ring) {
        it.ring.scale.setScalar(it.radius * (1 + it.life * 9));
        it.ring.material.opacity = Math.max(0, 0.8 * (1 - it.life / 0.18));
      }
      if (it.life >= it.max) {
        this.scene.remove(it.points);
        it.points.geometry.dispose();
        it.points.material.dispose();
        if (it.ring) {
          this.scene.remove(it.ring);
          it.ring.material.dispose();
        }
        this.items.splice(i, 1);
      }
    }
  }
}
