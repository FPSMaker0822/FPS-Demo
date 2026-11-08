// 렌더러, 카메라, 연습장(방) 구성
import * as THREE from '../vendor/three.module.min.js';

export const EYE_HEIGHT = 2.0;
const DEG = Math.PI / 180;

function gridTexture({ base, line, major, size = 512, cells = 8, majorEvery = 4 }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    const isMajor = i % majorEvery === 0;
    x.strokeStyle = isMajor ? major : line;
    x.lineWidth = isMajor ? 4 : 2;
    const p = Math.round(i * step);
    x.beginPath();
    x.moveTo(p, 0);
    x.lineTo(p, size);
    x.stroke();
    x.beginPath();
    x.moveTo(0, p);
    x.lineTo(size, p);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1020');
    this.scene.fog = new THREE.Fog('#0b1020', 40, 90);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.hfov = 103;

    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#1a1f33', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(6, 14, 8);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#9fb4ff', 0.6);
    fill.position.set(-8, 4, -6);
    this.scene.add(fill);

    this.buildRoom();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildRoom() {
    const W = 50, H = 22, BACK = -36, FRONT = 14;
    const D = FRONT - BACK;
    const floorTex = gridTexture({ base: '#151b2e', line: '#222b47', major: '#2f3d66' });
    floorTex.repeat.set(W / 8, D / 8);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (BACK + FRONT) / 2);
    this.scene.add(floor);

    const wallTex = gridTexture({ base: '#1a2140', line: '#232c52', major: '#2c3866' });
    const wallMat = (rx, ry) => {
      const t = wallTex.clone();
      t.repeat.set(rx / 8, ry / 8);
      // 조명이 닿지 않는 천장/벽도 격자가 보이도록 약한 자체 발광
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35 });
    };
    const add = (w, h, pos, rotY, rotX = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat(w, h));
      m.position.copy(pos);
      m.rotation.set(rotX, rotY, 0);
      this.scene.add(m);
    };
    add(W, H, new THREE.Vector3(0, H / 2, BACK), 0);
    add(W, H, new THREE.Vector3(0, H / 2, FRONT), Math.PI);
    add(D, H, new THREE.Vector3(-W / 2, H / 2, (BACK + FRONT) / 2), Math.PI / 2);
    add(D, H, new THREE.Vector3(W / 2, H / 2, (BACK + FRONT) / 2), -Math.PI / 2);
    add(W, D, new THREE.Vector3(0, H, (BACK + FRONT) / 2), 0, Math.PI / 2);

    // 바닥 경계 네온 라인
    const trimMat = new THREE.MeshBasicMaterial({ color: '#2ef2b0' });
    const trim = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), trimMat);
      m.position.set(x, 0.03, z);
      this.scene.add(m);
    };
    trim(W, 0.06, 0, BACK + 0.03);
    trim(0.06, D, -W / 2 + 0.03, (BACK + FRONT) / 2);
    trim(0.06, D, W / 2 - 0.03, (BACK + FRONT) / 2);

    // 플레이어 발판
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.3, 0.12, 40),
      new THREE.MeshStandardMaterial({ color: '#232c4d', roughness: 0.6, emissive: '#0d3b33', emissiveIntensity: 0.6 })
    );
    pad.position.set(0, 0.06, 0);
    this.scene.add(pad);
  }

  /** 수평 FOV(도) 설정 – 대부분의 FPS 게임 표기 방식 */
  setFov(hfov) {
    this.hfov = hfov;
    this.updateFov();
  }

  updateFov() {
    const aspect = this.camera.aspect;
    const v = 2 * Math.atan(Math.tan((this.hfov * DEG) / 2) / aspect);
    this.camera.fov = v / DEG;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.updateFov();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
