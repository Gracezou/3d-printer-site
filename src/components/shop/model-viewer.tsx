'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface ModelViewerProps {
  modelUrl: string;
  productName: string;
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
}

export function ModelViewer({ modelUrl, productName }: ModelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setErrorDetail('当前浏览器或设备不支持 WebGL 2');
      setStatus('error');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearColor(0x111914, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
    camera.position.set(2.5, 1.8, 3.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x385440, 2.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 4);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xd9ff68, 2);
    fillLight.position.set(-4, 2, -3);
    scene.add(fillLight);

    let loadedModel: THREE.Object3D | undefined;
    let animationFrame = 0;
    let disposed = false;

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        loadedModel = gltf.scene;
        scene.add(loadedModel);

        const bounds = new THREE.Box3().setFromObject(loadedModel);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z, 0.1);
        loadedModel.position.sub(center);

        const cameraDistance =
          maxDimension / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const initialPosition = new THREE.Vector3(
          cameraDistance * 0.7,
          cameraDistance * 0.45,
          cameraDistance * 0.9,
        );
        const resetView = () => {
          camera.position.copy(initialPosition);
          camera.near = Math.max(maxDimension / 100, 0.01);
          camera.far = Math.max(maxDimension * 100, 100);
          camera.updateProjectionMatrix();
          controls.target.set(0, 0, 0);
          controls.minDistance = maxDimension * 0.45;
          controls.maxDistance = maxDimension * 8;
          controls.update();
        };
        resetViewRef.current = resetView;
        resetView();
        setStatus('ready');
      },
      (event) => {
        setProgress(
          event.total > 0
            ? Math.round((event.loaded / event.total) * 100)
            : null,
        );
      },
      (error) => {
        if (disposed) return;
        const target =
          typeof error === 'object' && error !== null && 'target' in error
            ? error.target
            : undefined;
        const responseUrl =
          typeof target === 'object' &&
          target !== null &&
          'responseURL' in target &&
          typeof target.responseURL === 'string'
            ? target.responseURL
            : '';
        setErrorDetail(
          error instanceof Error
            ? error.message
            : responseUrl
              ? `无法读取 ${new URL(responseUrl).host}`
              : '无法解析模型文件',
        );
        setStatus('error');
      },
    );

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      if (loadedModel) disposeModel(loadedModel);
      renderer.dispose();
      renderer.forceContextLoss();
      resetViewRef.current = () => undefined;
    };
  }, [modelUrl]);

  return (
    <div ref={containerRef} className="relative h-full min-h-80 w-full">
      <canvas
        ref={canvasRef}
        aria-label={`${productName} 可交互 3D 模型`}
        className="block h-full w-full touch-none"
      />
      {status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#111914] text-center text-white">
          <div>
            <span className="mx-auto block size-10 animate-spin rounded-full border-2 border-white/15 border-t-[#d9ff68]" />
            <p className="mt-4 text-sm text-white/60">
              正在载入模型{progress === null ? '…' : ` ${progress}%`}
            </p>
          </div>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="absolute inset-0 grid place-items-center bg-[#111914] px-6 text-center text-white">
          <div>
            <p className="font-semibold">模型加载失败</p>
            <p className="mt-2 text-sm text-white/45">
              请检查网络连接，或稍后重新打开预览。
            </p>
            {errorDetail ? (
              <p className="mt-2 text-xs text-white/30">{errorDetail}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {status === 'ready' ? (
        <button
          type="button"
          onClick={() => resetViewRef.current()}
          className="absolute right-5 bottom-5 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 text-xs font-semibold text-white backdrop-blur transition hover:bg-white hover:text-[#17251c]"
        >
          <RotateCcw className="size-3.5" /> 重置视角
        </button>
      ) : null}
    </div>
  );
}
