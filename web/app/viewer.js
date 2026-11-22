// three.js preview of the generated parts (Z up, like slicers and Onshape).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { partMesh } from '../engine/build.js';

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(60, -90, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(80, -60, 160);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-100, 80, 40);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(250, 25, 0xffffff, 0xffffff);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.25;
    this.scene.add(this.grid);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.fitted = false;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTheme(background, grid) {
    this.scene.background = new THREE.Color(background || '#eef1f4');
    this.grid.material.color.set(grid || '#888888');
  }

  show(parts, colors = {}) {
    for (const c of [...this.group.children]) {
      c.geometry.dispose();
      c.material.dispose();
      this.group.remove(c);
    }
    let zMin = Infinity;
    for (const p of parts) zMin = Math.min(zMin, p.bounds.min[2]);
    for (const p of parts) {
      const { positions, indices } = partMesh(p);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: colors[p.key] || p.color, flatShading: true, roughness: 0.6, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = -zMin; // sit on the plate
      this.group.add(mesh);
    }
    if (!this.fitted && parts.length) {
      this.fit();
      this.fitted = true;
    }
  }

  fit() {
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.5 || 10;
    const dist = r / Math.sin((this.camera.fov * Math.PI) / 360) * 1.25;
    const dir = new THREE.Vector3(0.45, -0.75, 0.8).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
  }

  snapshot() {
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
