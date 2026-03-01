"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 56;
const LINE_DISTANCE = 10;
const LINE_OPACITY_MAX = 0.07;
const LINE_OPACITY_MIN = 0.04;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
const SWAY_AMP = 3.5;
const SWAY_PERIOD = 4200;

export function ParticleField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;

    async function init() {
      const el = containerRef.current;
      if (!el) return;

      const THREE = await import("three");
      if (destroyed) return;

      const w = window.innerWidth;
      const h = window.innerHeight;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 120);
      camera.position.z = 35;

      const cyanR = 0, cyanG = 229 / 255, cyanB = 1;
      const purpleR = 179 / 255, purpleG = 136 / 255, purpleB = 1;

      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);
      const speeds = new Float32Array(PARTICLE_COUNT);
      const phases = new Float32Array(PARTICLE_COUNT);
      const sizes = new Float32Array(PARTICLE_COUNT);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * 60;
        positions[i3 + 1] = (Math.random() - 0.5) * 44;
        positions[i3 + 2] = (Math.random() - 0.5) * 22;
        speeds[i] = 0.0025 + Math.random() * 0.003;
        phases[i] = Math.random() * Math.PI * 2;
        sizes[i] = 1.8 + Math.random() * 1.6;

        const mix = Math.random();
        colors[i3] = cyanR * (1 - mix) + purpleR * mix;
        colors[i3 + 1] = cyanG * (1 - mix) + purpleG * mix;
        colors[i3 + 2] = cyanB * (1 - mix) + purpleB * mix;
      }

      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      pointGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      pointGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

      const pointMat = new THREE.ShaderMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
        },
        vertexShader: `
          attribute float aSize;
          varying vec3 vColor;
          uniform float uPixelRatio;
          void main() {
            vColor = color;
            vec4 mvp = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvp;
            gl_PointSize = aSize * uPixelRatio * (280.0 / -mvp.z);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            float core = exp(-d * d * 8.0);
            float bloom = exp(-d * d * 2.0) * 0.35;
            float alpha = (core + bloom) * 0.45;
            gl_FragColor = vec4(vColor, alpha);
          }
        `,
      });

      const points = new THREE.Points(pointGeo, pointMat);
      scene.add(points);

      const maxLines = PARTICLE_COUNT * (PARTICLE_COUNT - 1) / 2;
      const linePositions = new Float32Array(maxLines * 6);
      const lineColors = new Float32Array(maxLines * 6);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      lineGeo.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
      lineGeo.setDrawRange(0, 0);

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        linewidth: 1,
      });

      const lines = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lines);

      const nebulaGeo = new THREE.PlaneGeometry(90, 70);
      const nebulaMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {},
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          varying vec2 vUv;
          void main() {
            vec2 c = vUv - 0.5;
            float d = length(c);
            float cyan = 0.035 * exp(-d * d * 5.5);
            float purple = 0.018 * exp(-(d - 0.45) * (d - 0.45) * 3.5);
            float haze = 0.008 * exp(-d * d * 2.0);
            gl_FragColor = vec4(0.0, 0.9, 1.0, cyan + haze * 0.5) + vec4(0.7, 0.53, 1.0, purple + haze * 0.3);
          }
        `,
      });

      const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);
      nebula.position.z = -10;
      scene.add(nebula);

      let lastFrameTime = 0;
      let rafId: number;

      function animate(timestamp: number) {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);

        const delta = timestamp - lastFrameTime;
        if (delta < FRAME_INTERVAL) return;
        lastFrameTime = timestamp - (delta % FRAME_INTERVAL);

        const posArr = pointGeo.attributes.position.array as Float32Array;
        const swayT = (timestamp / SWAY_PERIOD) * Math.PI * 2;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const i3 = i * 3;
          posArr[i3 + 1] += speeds[i];
          posArr[i3] += Math.sin(swayT + phases[i]) * (SWAY_AMP * speeds[i]);

          if (posArr[i3 + 1] > 22) {
            posArr[i3 + 1] = -22;
            posArr[i3] = (Math.random() - 0.5) * 60;
            posArr[i3 + 2] = (Math.random() - 0.5) * 22;
          }
        }
        pointGeo.attributes.position.needsUpdate = true;

        let lineIdx = 0;
        const lPos = lineGeo.attributes.position.array as Float32Array;
        const lCol = lineGeo.attributes.color.array as Float32Array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const ix = posArr[i * 3], iy = posArr[i * 3 + 1], iz = posArr[i * 3 + 2];
          for (let j = i + 1; j < PARTICLE_COUNT; j++) {
            const jx = posArr[j * 3], jy = posArr[j * 3 + 1], jz = posArr[j * 3 + 2];
            const dx = ix - jx, dy = iy - jy, dz = iz - jz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < LINE_DISTANCE) {
              const off = lineIdx * 6;
              lPos[off] = ix; lPos[off + 1] = iy; lPos[off + 2] = iz;
              lPos[off + 3] = jx; lPos[off + 4] = jy; lPos[off + 5] = jz;

              const fade = 1 - dist / LINE_DISTANCE;
              const alpha = LINE_OPACITY_MIN + fade * (LINE_OPACITY_MAX - LINE_OPACITY_MIN);
              const ci = colors[i * 3], cj = colors[j * 3];
              const mr = (ci + cj) * 0.5 * alpha;
              const mg = (colors[i * 3 + 1] + colors[j * 3 + 1]) * 0.5 * alpha;
              const mb = (colors[i * 3 + 2] + colors[j * 3 + 2]) * 0.5 * alpha;
              lCol[off] = mr; lCol[off + 1] = mg; lCol[off + 2] = mb;
              lCol[off + 3] = mr; lCol[off + 4] = mg; lCol[off + 5] = mb;

              lineIdx++;
            }
          }
        }
        lineGeo.setDrawRange(0, lineIdx * 2);
        lineGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.color.needsUpdate = true;

        points.rotation.y = timestamp * 0.000018;

        renderer.render(scene, camera);
      }

      rafId = requestAnimationFrame(animate);

      function handleResize() {
        const nw = window.innerWidth;
        const nh = window.innerHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
        pointMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.5);
      }

      window.addEventListener("resize", handleResize);

      cleanupRef.current = () => {
        destroyed = true;
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", handleResize);
        pointGeo.dispose();
        pointMat.dispose();
        lineGeo.dispose();
        lineMat.dispose();
        nebulaGeo.dispose();
        nebulaMat.dispose();
        renderer.dispose();
        if (el.contains(renderer.domElement)) {
          el.removeChild(renderer.domElement);
        }
      };
    }

    init();

    return () => {
      destroyed = true;
      cleanupRef.current?.();
    };
  }, []);

  return <div ref={containerRef} className="particle-canvas-container" />;
}
