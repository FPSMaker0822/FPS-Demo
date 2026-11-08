// 풍선 타겟, 터지는 이펙트, 히트 판정
import * as THREE from '../vendor/three.module.min.js';

export const PALETTE = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#ff8fab', '#f77f00', '#3a86ff'];

const SPHERE = new THREE.SphereGeometry(1, 36, 24);
const KNOT = new THREE.ConeGeometry(0.14, 0.22, 12);
const RING_GEO = new THREE.RingGeometry(0.85, 1, 40);

const matCache = new Map();
function makeMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    emissive: color,
    emissiveIntensity: 0.1,
  });
}
function sharedMaterial(color) {
  if (!matCache.has(color)) matCache.set(color, makeMaterial(color));
  return matCache.get(color);
}

const easeOutBack = (k) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

export class Balloon {
  constructor(scene, { position, radius = 0.6, color = PALETTE[0], unique = false }) {
    this.scene = scene;
    this.radius = radius;
    this.color = color;
    this.unique = unique;
    this.material = unique ? makeMaterial(color) : sharedMaterial(color);
    this.group = new THREE.Group();
    const body = new THREE.Mesh(SPHERE, this.material);
    body.scale.set(1, 1.12, 1);
    const knot = new THREE.Mesh(KNOT, this.material);
    knot.position.y = -1.18;
    this.group.add(body, knot);
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

  hitRadius() {
    return this.radius * this.inflate * 1.06;
  }

  update(dt) {
    this.age += dt;
    const k = Math.min(1, this.age / 0.14);
    const s = this.radius * this.inflate * (k < 1 ? Math.max(0.001, easeOutBack(k)) : 1);
    this.group.scale.setScalar(s);
    this.group.rotation.z = Math.sin(this.age * 1.7 + this.phase) * 0.07;
  }

  dispose() {
    this.dead = true;
    this.scene.remove(this.group);
    if (this.unique) this.material.dispose();
  }
}

const _v = new THREE.Vector3();
/** 카메라 중심 레이와 가장 먼저 맞는 풍선 */
export function rayHit(origin, dir, balloons) {
  let best = null;
  let bestT = Infinity;
  for (const b of balloons) {
    if (b.dead) continue;
    _v.subVectors(b.group.position, origin);
    const t = _v.dot(dir);
    if (t <= 0) continue;
    const d2 = _v.lengthSq() - t * t;
    const r = b.hitRadius();
    if (d2 <= r * r && t < bestT) {
      best = b;
      bestT = t;
    }
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

  burst(pos, color, radius, { count = 30, ring = true, speed = 1 } = {}) {
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
      positions[i * 3] = pos.x + x * radius * 0.8;
      positions[i * 3 + 1] = pos.y + y * radius * 0.8;
      positions[i * 3 + 2] = pos.z + z * radius * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.14 + radius * 0.3,
      map: DOT_TEX,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
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
