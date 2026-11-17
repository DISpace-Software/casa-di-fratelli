import * as THREE from 'three';
import { sampleCoffeeFluid, cupTiltAt, createCoffeeSloshState, updateCoffeeSlosh, createCoffeeFluidSampler } from './coffeeFluidPhysics.js';
import { drawCoffeeWetReveal } from './coffeeWetReveal.js';

const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const pageOffset = (p, h) => h * (1 - ease((p - 0.02) / 0.62));

// The foot starts at exactly the saucer's central well. Lift precedes rotation.
export function cupPositionAt(p) {
  const lift = ease((p - 0.035) / 0.22);
  return { x: -0.28 * ease((p - 0.06) / 0.18), y: 0.10 + 0.65 * lift + 6 * ease((p - 0.74) / 0.20), z: 0 };
}

function lathe(points, segments = 96) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

function cupGeometry() {
  const outer = new THREE.CatmullRomCurve3([
    [0.37, 0.035], [0.43, 0.10], [0.51, 0.19], [0.58, 0.32],
    [0.75, 0.70], [0.86, 1.00], [0.96, 1.35], [0.995, 1.46],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const profile = [[0, 0.035], [0.29, 0.035], [0.30, 0], [0.37, 0],
    ...outer.getPoints(48).map(p => [p.x, p.y]),
    [0.998, 1.48], [0.992, 1.502], [0.975, 1.514], [0.955, 1.504], [0.94, 1.48],
    [0.90, 1.35], [0.80, 1.00], [0.69, 0.70], [0.52, 0.35], [0.33, 0.22], [0, 0.22]];
  return lathe(profile);
}

function saucerGeometry() {
  const top = new THREE.CatmullRomCurve3([
    [0, 0.10], [0.38, 0.10], [0.48, 0.101], [0.57, 0.116], [0.68, 0.125],
    [0.87, 0.132], [1.12, 0.16], [1.40, 0.215], [1.65, 0.275], [1.75, 0.292],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  return lathe([[0, 0.025], [0.50, 0.025], [0.52, 0.005], [0.60, 0.005], [0.62, 0.04],
    [1.12, 0.085], [1.45, 0.16], [1.71, 0.233], [1.76, 0.26], [1.765, 0.281],
    ...top.getPoints(64).reverse().map(p => [p.x, p.y])]);
}

function brandGeometry() {
  const positions = []; const uv = []; const indices = [];
  const columns = 40; const rows = 8;
  for (let j = 0; j <= rows; j += 1) {
    const y = 0.69 + j / rows * 0.30;
    const radius = y <= 0.70 ? 0.75 + (y - 0.70) * 0.4 : 0.75 + (y - 0.70) * 0.3667;
    for (let i = 0; i <= columns; i += 1) {
      const angle = (i / columns - 0.5) * 1.50;
      positions.push(Math.sin(angle) * (radius + 0.022), y, Math.cos(angle) * (radius + 0.022));
      uv.push(i / columns, j / rows);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i;
        indices.push(a, a + 1, a + columns + 2, a, a + columns + 2, a + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function studioEnvironment(renderer) {
  const stage = new THREE.Scene();
  stage.background = new THREE.Color('#10141b');
  const panels = [];
  function panel(color, intensity, width, height, x, y, z) {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z); mesh.lookAt(0, 0.8, 0); stage.add(mesh); panels.push(mesh);
  }
  panel('#e7efff', 4, 2.7, 5, -3.7, 3.8, 4);
  panel('#7bafff', 3.5, 1.0, 5, -3.5, 2.0, -2.7);
  panel('#f8ead8', 2.3, 1.9, 3.5, 4, 2.7, 2);
  panel('#ffffff', 2.2, 3.4, 0.35, -0.5, 3.4, -7);
  panel('#b9d2ff', 1.3, 1.5, 0.18, -1.8, 2.4, -5);
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(stage, 0.035, 0.1, 30, { size: 128 });
  generator.dispose();
  panels.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
  return environment;
}

/** Real geometry + a free-surface/particle model; no raster cup or stream sprite. */
export async function createCoffeeWebGLScene(canvas, revealCanvas, wrapper, onError, signal) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const scene = new THREE.Scene();
  let environment; let logoTexture; let disposed = false; let frame = 0;
  function lost(event) { event.preventDefault(); dispose(); onError(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    signal?.removeEventListener('abort', dispose);
    canvas.removeEventListener('webglcontextlost', lost);
    const geometries = new Set(); const materials = new Set();
    scene.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    logoTexture?.dispose(); environment?.dispose(); renderer.dispose();
  }
  signal?.addEventListener('abort', dispose, { once: true });
  canvas.addEventListener('webglcontextlost', lost);
  try {
    if (signal?.aborted) throw new DOMException('Scene cancelled', 'AbortError');
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    environment = studioEnvironment(renderer);
    scene.environment = environment.texture;
    const ceramic = new THREE.MeshPhysicalMaterial({ color: '#eee4d1', roughness: 0.16, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.5 });
    const liquidMaterial = new THREE.MeshPhysicalMaterial({ color: '#241007', roughness: 0.085, metalness: 0,
      ior: 1.333, clearcoat: 0.65, clearcoatRoughness: 0.045, envMapIntensity: 0.95, side: THREE.DoubleSide });
    // Tiny crema islands and dark body remain attached to the moving free surface.
    liquidMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 coffeeLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ncoffeeLocal = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 coffeeLocal;
        float grain(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float coffeeNoise(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(grain(i),grain(i+vec2(1,0)),f.x),mix(grain(i+vec2(0,1)),grain(i+vec2(1,1)),f.x),f.y); }
      `).replace('#include <color_fragment>', `#include <color_fragment>
        float clouds=coffeeNoise(coffeeLocal.xz*22.0+coffeeNoise(coffeeLocal.xz*52.0)*0.6);
        float crema=smoothstep(0.72,0.97,clouds)*0.14;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.27,0.12,0.038),crema);
      `);
    };
    const dropletMaterial = new THREE.MeshPhysicalMaterial({ color: '#2a1005', roughness: 0.095, ior: 1.333,
      metalness: 0, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.7 });
    const cup = new THREE.Group(); scene.add(cup);
    const bowl = new THREE.Mesh(cupGeometry(), ceramic); bowl.castShadow = true; bowl.receiveShadow = true; cup.add(bowl);
    const handleCurve = new THREE.CatmullRomCurve3([
      [0.90, 1.23, 0], [1.28, 1.34, 0], [1.53, 1.15, 0], [1.50, 0.83, 0], [1.24, 0.51, 0], [0.64, 0.42, 0],
    ].map(p => new THREE.Vector3(...p)));
    const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 64, 0.102, 16, false), ceramic);
    handle.castShadow = true; handle.receiveShadow = true; cup.add(handle);
    const saucer = new THREE.Mesh(saucerGeometry(), ceramic); saucer.receiveShadow = true; scene.add(saucer);
    const coffeeGeometry = new THREE.BufferGeometry();
    const liquid = new THREE.Mesh(coffeeGeometry, liquidMaterial); liquid.frustumCulled = false; cup.add(liquid);
    const wetRimCurve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
      const angle = (i / 12 - 0.5) * 0.18;
      return new THREE.Vector3(-Math.cos(angle) * 0.992, 1.486, Math.sin(angle) * 0.992);
    }));
    const wetRim = new THREE.Mesh(new THREE.TubeGeometry(wetRimCurve, 24, 0.013, 8, false), dropletMaterial);
    cup.add(wetRim);
    const dropGeometry = new THREE.SphereGeometry(1, 20, 14);
    const beads = new THREE.InstancedMesh(dropGeometry, dropletMaterial, 180);
    beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage); beads.frustumCulled = false; scene.add(beads);
    const dummy = new THREE.Object3D(); const velocity = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
    const key = new THREE.DirectionalLight('#edf3ff', 1.4); key.position.set(-3, 5, 4); key.castShadow = true;
    const shadowSize = canvas.clientWidth <= 760 ? 512 : 1024;
    key.shadow.intensity = 0.35; key.shadow.mapSize.set(shadowSize, shadowSize); key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -3; key.shadow.normalBias = 0.015; key.shadow.bias = -0.00015;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#82b4ff', 1.4); rim.position.set(-3, 2, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffe8ce', 0.3); fill.position.set(3, 2, 3); scene.add(fill);
    scene.add(new THREE.HemisphereLight('#bccde9', '#312318', 0.18));
    const textureLoader = new THREE.TextureLoader();
    let width = 0; let height = 0;
    let progress = 0; let layout = {}; let lastTime = 0; let settleUntil = 0; let frameCount = 0;
    logoTexture = await new Promise((resolve, reject) => {
      const aborted = () => reject(new DOMException('Scene cancelled', 'AbortError'));
      signal?.addEventListener('abort', aborted, { once: true });
      textureLoader.load('/cofein/brand/cofein-lockup.svg', texture => {
        signal?.removeEventListener('abort', aborted);
        if (disposed || signal?.aborted) { texture.dispose(); aborted(); }
        else resolve(texture);
      }, undefined, error => { signal?.removeEventListener('abort', aborted); reject(error); });
    });
    const brandCanvas = document.createElement('canvas');
    brandCanvas.width = 1536; brandCanvas.height = 370;
    const brandContext = brandCanvas.getContext('2d');
    if (!brandContext) throw new Error('Brand canvas unavailable');
    brandContext.drawImage(logoTexture.image, 0, 0, 1536, 370);
    logoTexture.dispose();
    logoTexture = new THREE.CanvasTexture(brandCanvas);
    logoTexture.colorSpace = THREE.SRGBColorSpace; logoTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const logoMaterial = new THREE.MeshStandardMaterial({ map: logoTexture, transparent: true, depthWrite: false,
      color: '#342b23', side: THREE.DoubleSide, roughness: 0.36, polygonOffset: true, polygonOffsetFactor: -1 });
    cup.add(new THREE.Mesh(brandGeometry(), logoMaterial));
    const context = revealCanvas.getContext('2d');
    if (!context) { dispose(); throw new Error('Reveal canvas unavailable'); }
    let projectedImpacts = [];
    const slosh = createCoffeeSloshState();
    const sampleFluid = createCoffeeFluidSampler();
    const fluidResolution = canvas.clientWidth <= 760 ? { segments: 32, rings: 6 } : { segments: 48, rings: 8 };
    const projected = new THREE.Vector3();
    function placeCamera(p) {
      camera.aspect = width / height;
      const portrait = 1 - ease((camera.aspect - 0.8) / 0.4);
      const pullback = portrait * ease((p - 0.04) / 0.14);
      const verticalSpan = Math.max(5.8, (4.5 + 2.5 * pullback) / camera.aspect);
      const distance = verticalSpan / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const center = -0.65 * pullback;
      camera.far = Math.max(40, distance + 15);
      camera.position.set(center, 0.25 + distance * 0.43, distance * 0.903);
      camera.lookAt(center, 0.25, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    }
    function resize() {
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (w === width && h === height) return;
      width = w; height = h;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width <= 760 ? 1.25 : 1.75));
      renderer.setSize(width, height, false);
      const ratio = Math.min(devicePixelRatio || 1, width <= 760 ? 1 : 1.25);
      revealCanvas.width = Math.round(width * ratio); revealCanvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Portrait framing has already pulled back before the first impact. Keep
      // each aperture at the actual projected landing, in document coordinates.
      placeCamera(0.5);
      const landings = sampleCoffeeFluid(0, { cupPosition: cupPositionAt, includeSplashImpacts: true });
      projectedImpacts = [...landings.impacts, ...landings.splashImpacts].map(impact => {
        projected.set(impact.x, impact.y, impact.z).project(camera);
        return { ...impact, x: (projected.x + 1) / 2, screenY: (1 - projected.y) / 2,
          pageY: (1 - projected.y) / 2 - pageOffset(impact.at, height) / height };
      });
    }
    function draw(timestamp) {
      try { drawFrame(timestamp); }
      catch { dispose(); onError(); }
    }
    function drawFrame(timestamp) {
      frame = 0;
      if (disposed) return;
      resize();
      if (!width || !height) return;
      placeCamera(progress);
      const dt = lastTime ? Math.min(0.05, (timestamp - lastTime) / 1000) : 1 / 60;
      lastTime = timestamp;
      updateCoffeeSlosh(slosh, cupTiltAt(progress), dt);
      const fluid = sampleFluid(progress, { ...fluidResolution, cupPosition: cupPositionAt, slosh, time: timestamp / 1000 });
      const pos = cupPositionAt(progress); cup.position.set(pos.x, pos.y, pos.z); cup.rotation.z = fluid.angle;
      const rock = Math.sin(progress * Math.PI * 3) * ease((progress - 0.08) / 0.25) * (1 - ease((progress - 0.55) / 0.3));
      saucer.rotation.z = rock * 0.085; saucer.rotation.x = rock * 0.045;
      // Rock around the contact edge: the lower edge never cuts through a support plane.
      saucer.position.y = Math.abs(Math.sin(saucer.rotation.z)) * 1.75 + 5 * ease((progress - 0.74) / 0.20);
      saucer.position.x = 0.82 * ease((progress - 0.06) / 0.18);
      if (!coffeeGeometry.getAttribute('position')) {
        coffeeGeometry.setAttribute('position', new THREE.BufferAttribute(fluid.surface.positions, 3).setUsage(THREE.DynamicDrawUsage));
        coffeeGeometry.setIndex(new THREE.BufferAttribute(fluid.surface.indices, 1));
      } else {
        coffeeGeometry.getAttribute('position').array.set(fluid.surface.positions);
        coffeeGeometry.getAttribute('position').needsUpdate = true;
      }
      coffeeGeometry.computeVertexNormals(); liquid.visible = fluid.surface.visible;
      wetRim.visible = progress > 0.22 && progress < 0.84;
      beads.count = Math.min(fluid.drops.length, 180);
      let visibleDrops = 0;
      fluid.drops.slice(0, 180).forEach((drop, index) => {
        projected.set(drop.x, drop.y, drop.z).project(camera);
        if (Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1) visibleDrops += 1;
        dummy.position.set(drop.x, drop.y, drop.z);
        velocity.set(drop.velocity.x, drop.velocity.y, drop.velocity.z).normalize();
        dummy.quaternion.setFromUnitVectors(up, velocity);
        const side = drop.radius / Math.sqrt(drop.stretch);
        dummy.scale.set(side, drop.radius * drop.stretch, side); dummy.updateMatrix(); beads.setMatrixAt(index, dummy.matrix);
      });
      beads.instanceMatrix.needsUpdate = true;
      // The physical objects leave before the final wet edge reaches the bottom.
      canvas.style.opacity = String(1 - ease((progress - 0.965) / 0.025));
      context.clearRect(0, 0, width, height);
      drawCoffeeWetReveal(context, width, height, progress, {
        pageTop: layout.pageTop ?? pageOffset(progress, height), impacts: projectedImpacts,
      });
      renderer.render(scene, camera);
      wrapper.dataset.fluidFraction = fluid.remainingFraction.toFixed(4);
      wrapper.dataset.dropCount = String(beads.count);
      wrapper.dataset.visibleDropCount = String(visibleDrops);
      wrapper.dataset.renderCount = String(++frameCount);
      if (timestamp < settleUntil && progress < 0.95) frame = requestAnimationFrame(draw);
    }
    function render(value, nextLayout = {}) {
      const changed = Math.abs(progress - value) > 0.0001;
      progress = clamp(value); layout = nextLayout;
      if (changed) settleUntil = performance.now() + 900;
      if (!frame && !disposed) frame = requestAnimationFrame(draw);
    }
    resize(); render(0);
    wrapper.dataset.renderer = 'webgl';
    return { render, dispose };
  } catch (error) { dispose(); throw error; }
}
