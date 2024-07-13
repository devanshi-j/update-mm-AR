import { loadGLTF } from "../libs/loader.js";
import * as THREE from '../libs/three123/three.module.js';
import { ARButton } from '../libs/jsm/ARButton.js';

const normalizeModel = (obj, height) => {
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = bbox.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / size.y);

  const bbox2 = new THREE.Box3().setFromObject(obj);
  const center = bbox2.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -center.y, -center.z);
}

const setOpacity = (obj, opacity) => {
  obj.traverse((child) => {
    if (child.material) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = opacity;
    }
  });
}

const deepClone = (obj) => {
  const newObj = obj.clone();
  setOpacity(newObj, newObj.material.opacity);
  return newObj;
}

document.addEventListener('DOMContentLoaded', () => {
  const initialize = async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    scene.add(light);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: document.body } });
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(arButton);

    const itemNames = ['coffee-table', 'chair', 'cushion'];
    const itemHeights = [0.5, 0.7, 0.05];
    const items = await Promise.all(itemNames.map(async (name, i) => {
      const model = await loadGLTF(`../assets/models/${name}/scene.gltf`);
      normalizeModel(model.scene, itemHeights[i]);
      const item = new THREE.Group();
      item.add(model.scene);
      item.visible = false;
      setOpacity(item, 0.5);
      scene.add(item);
      return item;
    }));

    let selectedItem = null;
    let prevTouchPosition = null;
    let touchDown = false;
    let interactingItem = null;
    const placedItems = [];

    const itemButtons = document.querySelector("#item-buttons");
    const confirmButtons = document.querySelector("#confirm-buttons");

    const toggleUI = (isSelecting) => {
      itemButtons.style.display = isSelecting ? "block" : "none";
      confirmButtons.style.display = isSelecting ? "none" : "block";
    }

    const select = (item) => {
      items.forEach(i => i.visible = i === item);
      selectedItem = item;
      toggleUI(false);
    }

    const cancelSelect = () => {
      if (selectedItem) selectedItem.visible = false;
      selectedItem = null;
      toggleUI(true);
    }

    document.querySelector("#place").addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const spawnItem = deepClone(selectedItem);
      setOpacity(spawnItem, 1.0);
      scene.add(spawnItem);
      placedItems.push(spawnItem);
      attachInteractionListeners(spawnItem);
      cancelSelect();
    });

    document.querySelector("#cancel").addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelSelect();
    });

    items.forEach((item, i) => {
      document.querySelector(`#item${i}`).addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        select(item);
      });
    });

    const controller = renderer.xr.getController(0);
    scene.add(controller);

    controller.addEventListener('selectstart', () => touchDown = true);
    controller.addEventListener('selectend', () => {
      touchDown = false;
      prevTouchPosition = null;
    });

    renderer.xr.addEventListener("sessionstart", async () => {
      const session = renderer.xr.getSession();
      const viewerReferenceSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource({ space: viewerReferenceSpace });

      renderer.setAnimationLoop((timestamp, frame) => {
        if (!frame) return;

        const referenceSpace = renderer.xr.getReferenceSpace();
        const viewerPose = frame.getViewerPose(referenceSpace);
        const viewerMatrix = new THREE.Matrix4().fromArray(viewerPose.transform.inverse.matrix);

        if (touchDown && interactingItem) {
          const newPosition = controller.position.clone().applyMatrix4(viewerMatrix);
          if (prevTouchPosition) {
            const deltaX = newPosition.x - prevTouchPosition.x;
            const deltaZ = newPosition.y - prevTouchPosition.y;
            interactingItem.rotation.y += deltaX * 30;
          }
          prevTouchPosition = newPosition;
        }

        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          placedItems.forEach(item => {
            item.visible = true;
            item.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(hit.getPose(referenceSpace).transform.matrix));
          });
        } else {
          placedItems.forEach(item => item.visible = false);
        }

        renderer.render(scene, camera);
      });
    });

    const attachInteractionListeners = (object) => {
      object.traverse((child) => {
        if (child.isMesh) {
          child.userData.selectable = true;
          child.addEventListener('click', () => {
            interactingItem = object;
          });
        }
      });
    }

    toggleUI(true);
  }

  initialize();
});
