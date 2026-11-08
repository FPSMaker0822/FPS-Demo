// 렌더러, 카메라, 연습장(배경 테마), 후처리(블룸)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const EYE_HEIGHT = 2.0;
const DEG = Math.PI / 180;

// bloom: [강도, 반경, 임계값], env: 환경광(반사) 세기, strip: 네온 라인 밝기
export const THEMES = {
  midnight: {
    label: '미드나잇 그리드', swatch: ['#0b1020', '#2f3d66', '#2ef2b0'],
    bg: '#0b1020', fog: [40, 95],
    floor: ['#141a2c', '#1f2843', '#2c3a62'], wall: ['#171e3a', '#20294d', '#29345f'],
    glow: 0.3, trim: '#2ef2b0', hemi: ['#cfe0ff', '#1a1f33', 0.7], sun: 2.0,
    bloom: [0.5, 0.45, 0.88], env: 0.3, strip: 1.5,
  },
  lab: {
    label: '라이트 랩', swatch: ['#d5d9e1', '#a5acba', '#3a86ff'],
    bg: '#cfd4dd', fog: [55, 130],
    floor: ['#b9bfca', '#aab1be', '#969eae'], wall: ['#dadee6', '#c9ced8', '#b6bcc8'],
    glow: 0.1, trim: '#3a86ff', hemi: ['#ffffff', '#9aa3b5', 1.0], sun: 1.6,
    bloom: [0.25, 0.4, 0.97], env: 0.7, strip: 1.4,
  },
  synthwave: {
    label: '신스웨이브', swatch: ['#12061f', '#7a2fd0', '#ff2fb4'],
    bg: '#12061f', fog: [35, 90],
    floor: ['#160a29', '#3a1b62', '#ff2fb4'], wall: ['#130824', '#2c124d', '#7a2fd0'],
    glow: 0.6, trim: '#ff2fb4', hemi: ['#ffb3ec', '#1a0b2e', 0.7], sun: 1.6,
    bloom: [0.7, 0.5, 0.82], env: 0.25, strip: 1.8,
  },
  void: {
    label: '보이드 (미니멀)', swatch: ['#050608', '#1d2027', '#ffffff'],
    bg: '#050608', fog: [30, 75],
    floor: ['#0b0c0f', '#14161b', '#1d2027'], wall: ['#08090b', '#101216', '#171a20'],
    glow: 0.2, trim: '#9aa3b8', hemi: ['#d8dcff', '#08090b', 0.6], sun: 1.8,
    bloom: [0.5, 0.45, 0.85], env: 0.25, strip: 1.3,
  },
  sky: {
    label: '스카이 아레나', swatch: ['#7fb6ee', '#e9f2ff', '#5f8f4e'],
    bg: '#9cc8f2', fog: [60, 170], sky: ['#3d7fd1', '#cfe6ff'],
    floor: ['#6d8f5c', '#64855a', '#56764d'], wall: null,
    glow: 0, trim: '#ffffff', hemi: ['#e6f2ff', '#4d6b3f', 0.9], sun: 2.6,
    bloom: [0.2, 0.4, 0.98], env: 0.6, strip: 1,
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog('#000', 40, 90);

    // 환경광(반사): 타겟과 바닥에 은은한 하이라이트
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.hfov = 103;

    this.hemi = new THREE.HemisphereLight('#fff', '#000', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.sun.position.set(8, 22, 4);
    this.sun.target.position.set(0, 0, -14);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    // 후처리
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildRoom();
    this.setQuality('high');
    this.setTheme('midnight');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildRoom() {
    const W = 50, H = 22, BACK = -36, FRONT = 14;
    const D = FRONT - BACK, CZ = (BACK + FRONT) / 2;
    this.dims = { W, H, D };

    this.floorMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, CZ);
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.walls = new THREE.Group();
    this.wallMats = [];
    const add = (w, h, pos, rotY, rotX = 0) => {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: '#ffffff', envMapIntensity: 0.4 });
      mat.userData.size = [w, h];
      this.wallMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.copy(pos);
      m.rotation.set(rotX, rotY, 0);
      m.receiveShadow = true;
      this.walls.add(m);
    };
    add(W, H, new THREE.Vector3(0, H / 2, BACK), 0);
    add(W, H, new THREE.Vector3(0, H / 2, FRONT), Math.PI);
    add(D, H, new THREE.Vector3(-W / 2, H / 2, CZ), Math.PI / 2);
    add(D, H, new THREE.Vector3(W / 2, H / 2, CZ), -Math.PI / 2);
    add(W, D, new THREE.Vector3(0, H, CZ), 0, Math.PI / 2);

    // 네온 라인 (블룸으로 빛남)
    this.stripMat = new THREE.MeshBasicMaterial({ color: '#2ef2b0', toneMapped: false });
    const bar = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.stripMat);
      m.position.set(x, y, z);
      this.walls.add(m);
    };
    // 바닥 경계
    bar(W - 0.4, 0.06, 0.06, 0, 0.04, BACK + 0.1);
    bar(0.06, 0.06, D - 0.4, -W / 2 + 0.1, 0.04, CZ);
    bar(0.06, 0.06, D - 0.4, W / 2 - 0.1, 0.04, CZ);
    // 뒷벽 가로 라인 + 세로 프레임
    bar(W - 0.4, 0.08, 0.05, 0, 13, BACK + 0.08);
    for (const x of [-12, 12]) bar(0.08, 12.9, 0.05, x, 6.55, BACK + 0.08);
    // 옆벽 세로 라인
    for (let z = BACK + 8; z < FRONT; z += 10) {
      bar(0.05, H - 0.2, 0.08, -W / 2 + 0.08, H / 2, z);
      bar(0.05, H - 0.2, 0.08, W / 2 - 0.08, H / 2, z);
    }
    // 천장 라이트 패널
    this.panelMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    for (const x of [-10, 0, 10]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, D - 10), this.panelMat);
      m.position.set(x, H - 0.08, CZ);
      this.walls.add(m);
    }
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

    // 플레이어 발판 (빛나는 링)
    this.padMat = new THREE.MeshStandardMaterial({ color: '#232c4d', roughness: 0.4, metalness: 0.3 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.1, 48), this.padMat);
    pad.position.set(0, 0.05, 0);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.025, 8, 64), this.stripMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    this.scene.add(ring);
  }

  /** 'high': 블룸 + 그림자, 'low': 가볍게 */
  setQuality(q) {
    this.quality = q === 'low' ? 'low' : 'high';
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
    this.resize();
  }

  setTheme(name) {
    const t = THEMES[name] || THEMES.midnight;
    this.theme = name in THEMES ? name : 'midnight';
    this.scene.background.set(t.bg);
    this.scene.fog.color.set(t.bg);
    this.scene.fog.near = t.fog[0];
    this.scene.fog.far = t.fog[1];
    this.scene.environmentIntensity = t.env;
    this.hemi.color.set(t.hemi[0]);
    this.hemi.groundColor.set(t.hemi[1]);
    this.hemi.intensity = t.hemi[2];
    this.sun.intensity = t.sun;
    [this.bloom.strength, this.bloom.radius, this.bloom.threshold] = t.bloom;

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
    }
    this.stripMat.color.set(t.trim).multiplyScalar(t.strip);
    this.panelMat.color.set('#ffffff').multiplyScalar(t.strip * 0.45);
    this.skyDome.visible = !!t.sky;
    if (t.sky) {
      this.skyMat.uniforms.top.value.set(t.sky[0]);
      this.skyMat.uniforms.bottom.value.set(t.sky[1]);
    }
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
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.updateFov();
  }

  render() {
    if (this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
