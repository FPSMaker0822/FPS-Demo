// 렌더러, 카메라, 연습장(배경 테마)
import * as THREE from '../vendor/three.module.min.js';

export const EYE_HEIGHT = 2.0;
const DEG = Math.PI / 180;

export const THEMES = {
  midnight: {
    label: '미드나잇 그리드', swatch: ['#0b1020', '#2f3d66', '#2ef2b0'],
    bg: '#0b1020', fog: [40, 90],
    floor: ['#151b2e', '#222b47', '#2f3d66'], wall: ['#1a2140', '#232c52', '#2c3866'],
    glow: 0.35, trim: '#2ef2b0', hemi: ['#cfe0ff', '#1a1f33', 1.1], sun: 2.2,
  },
  lab: {
    label: '라이트 랩', swatch: ['#d5d9e1', '#a5acba', '#3a86ff'],
    bg: '#cfd4dd', fog: [55, 120],
    floor: ['#b7bdc8', '#a8afbc', '#949cab'], wall: ['#d9dde5', '#c8cdd7', '#b4bac6'],
    glow: 0.12, trim: '#3a86ff', hemi: ['#ffffff', '#9aa3b5', 1.4], sun: 1.6,
  },
  synthwave: {
    label: '신스웨이브', swatch: ['#12061f', '#7a2fd0', '#ff2fb4'],
    bg: '#12061f', fog: [35, 85],
    floor: ['#170a2b', '#3d1c66', '#ff2fb4'], wall: ['#140826', '#2e1350', '#7a2fd0'],
    glow: 0.7, trim: '#ff2fb4', hemi: ['#ffb3ec', '#1a0b2e', 1.0], sun: 1.8,
  },
  void: {
    label: '보이드 (미니멀)', swatch: ['#050608', '#1d2027', '#ffffff'],
    bg: '#050608', fog: [30, 70],
    floor: ['#0b0c0f', '#14161b', '#1d2027'], wall: ['#08090b', '#101216', '#171a20'],
    glow: 0.25, trim: '#3b3f4a', hemi: ['#d8dcff', '#08090b', 0.9], sun: 2.0,
  },
  sky: {
    label: '스카이 아레나', swatch: ['#7fb6ee', '#e9f2ff', '#5f8f4e'],
    bg: '#9cc8f2', fog: [60, 160], sky: ['#3d7fd1', '#cfe6ff'],
    floor: ['#6d8f5c', '#64855a', '#56764d'], wall: null,
    glow: 0, trim: '#ffffff', hemi: ['#e6f2ff', '#4d6b3f', 1.3], sun: 2.6,
  },
};

function gridTexture([base, line, major], { size = 512, cells = 8, majorEvery = 4 } = {}) {
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
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog('#000', 40, 90);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.hfov = 103;

    this.hemi = new THREE.HemisphereLight('#fff', '#000', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.sun.position.set(6, 14, 8);
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight('#9fb4ff', 0.5);
    fill.position.set(-8, 4, -6);
    this.scene.add(fill);

    this.buildRoom();
    this.setTheme('midnight');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildRoom() {
    const W = 50, H = 22, BACK = -36, FRONT = 14;
    const D = FRONT - BACK, CZ = (BACK + FRONT) / 2;
    this.dims = { W, H, D };

    this.floorMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, CZ);
    this.scene.add(floor);

    this.walls = new THREE.Group();
    this.wallMats = [];
    const add = (w, h, pos, rotY, rotX = 0) => {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, emissive: '#ffffff' });
      mat.userData.size = [w, h];
      this.wallMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.copy(pos);
      m.rotation.set(rotX, rotY, 0);
      this.walls.add(m);
    };
    add(W, H, new THREE.Vector3(0, H / 2, BACK), 0);
    add(W, H, new THREE.Vector3(0, H / 2, FRONT), Math.PI);
    add(D, H, new THREE.Vector3(-W / 2, H / 2, CZ), Math.PI / 2);
    add(D, H, new THREE.Vector3(W / 2, H / 2, CZ), -Math.PI / 2);
    add(W, D, new THREE.Vector3(0, H, CZ), 0, Math.PI / 2);

    this.trimMat = new THREE.MeshBasicMaterial({ color: '#2ef2b0' });
    const trim = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), this.trimMat);
      m.position.set(x, 0.03, z);
      this.walls.add(m);
    };
    trim(W, 0.06, 0, BACK + 0.03);
    trim(0.06, D, -W / 2 + 0.03, CZ);
    trim(0.06, D, W / 2 - 0.03, CZ);
    this.scene.add(this.walls);

    // 하늘 돔 (스카이 테마)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat);
    this.scene.add(this.skyDome);

    // 플레이어 발판
    this.padMat = new THREE.MeshStandardMaterial({ color: '#232c4d', roughness: 0.6, emissive: '#0d3b33', emissiveIntensity: 0.6 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.12, 40), this.padMat);
    pad.position.set(0, 0.06, 0);
    this.scene.add(pad);
  }

  setTheme(name) {
    const t = THEMES[name] || THEMES.midnight;
    this.theme = name in THEMES ? name : 'midnight';
    this.scene.background.set(t.bg);
    this.scene.fog.color.set(t.bg);
    this.scene.fog.near = t.fog[0];
    this.scene.fog.far = t.fog[1];
    this.hemi.color.set(t.hemi[0]);
    this.hemi.groundColor.set(t.hemi[1]);
    this.hemi.intensity = t.hemi[2];
    this.sun.intensity = t.sun;

    if (this.floorMat.map) this.floorMat.map.dispose();
    const ft = gridTexture(t.floor);
    ft.repeat.set(400 / 8, 400 / 8);
    this.floorMat.map = ft;
    this.floorMat.emissive.set('#ffffff');
    this.floorMat.emissiveMap = ft;
    this.floorMat.emissiveIntensity = t.glow * 0.4;
    this.floorMat.needsUpdate = true;

    const hasWalls = !!t.wall;
    this.walls.visible = hasWalls;
    if (hasWalls) {
      if (this.wallTex) this.wallTex.dispose();
      this.wallTex = gridTexture(t.wall);
      for (const m of this.wallMats) {
        if (m.map) m.map.dispose();
        const tx = this.wallTex.clone();
        const [w, h] = m.userData.size;
        tx.repeat.set(w / 8, h / 8);
        tx.needsUpdate = true;
        m.map = tx;
        m.emissiveMap = tx;
        m.emissiveIntensity = t.glow;
        m.needsUpdate = true;
      }
      this.trimMat.color.set(t.trim);
    }
    this.skyDome.visible = !!t.sky;
    if (t.sky) {
      this.skyMat.uniforms.top.value.set(t.sky[0]);
      this.skyMat.uniforms.bottom.value.set(t.sky[1]);
    }
    this.padMat.emissive.set(t.trim);
    this.padMat.emissiveIntensity = 0.15;
    this.padMat.color.set(t.floor[2]);
  }

  /** 수평 FOV(도) 설정 – 대부분의 FPS 게임 표기 방식 */
  setFov(hfov) {
    this.hfov = hfov;
    this.updateFov();
  }

  updateFov() {
    const v = 2 * Math.atan(Math.tan((this.hfov * DEG) / 2) / this.camera.aspect);
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
