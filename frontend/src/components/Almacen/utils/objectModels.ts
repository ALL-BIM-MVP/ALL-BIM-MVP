// src/components/Almacen/utils/objectModels.ts
// Carga modelos .glb reales (CC0, ver public/models/LICENSE.txt) para mostrar
// dentro de una casilla en vez de dejarla vacía. Cada modelo se carga una
// sola vez (caché) y se devuelve un clon centrado/normalizado por uso.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ObjectCategory = 'caja' | 'bulto' | 'tubo';

const MODEL_URLS: Record<ObjectCategory, string> = {
  caja: '/models/caja.glb',
  bulto: '/models/bulto.glb',
  tubo: '/models/tubo.glb',
};

const loader = new GLTFLoader();
const cache = new Map<ObjectCategory, Promise<THREE.Object3D>>();

/** Centra el modelo en x/z, apoya su base en y=0, y lo normaliza a que su
 * dimensión más grande mida 1 — así cualquiera que lo use solo tiene que
 * escalarlo al tamaño final que necesite. */
function normalize(root: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  root.position.x -= centerX;
  root.position.z -= centerZ;
  root.position.y -= box.min.y;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const wrapper = new THREE.Group();
  wrapper.add(root);
  wrapper.scale.setScalar(1 / (Math.max(size.x, size.y, size.z) || 1));
  return wrapper;
}

function loadBase(category: ObjectCategory): Promise<THREE.Object3D> {
  let promise = cache.get(category);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      loader.load(MODEL_URLS[category], (gltf) => resolve(normalize(gltf.scene)), undefined, reject);
    });
    cache.set(category, promise);
  }
  return promise;
}

/** Clon listo para usar (centrado, base en y=0, tamaño normalizado a 1) — escalalo al tamaño final. */
export async function loadObjectModel(category: ObjectCategory): Promise<THREE.Object3D> {
  const base = await loadBase(category);
  return base.clone(true);
}

/** Igual que loadObjectModel, pero a partir de un .glb que subió el usuario
 * (no uno de los predefinidos) — se lee directo del archivo, sin subirlo a
 * ningún lado. No tiene caché: cada ítem trae su propio archivo. */
export async function loadObjectModelFromFile(file: File): Promise<THREE.Object3D> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => resolve(normalize(gltf.scene)), reject);
  });
}
