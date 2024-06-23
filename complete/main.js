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
  obj.children.forEach((child) => {
    setOpacity(child, opacity);
  });
  if (obj.material) {
    obj.material.transparent = true;
    obj.material.opacity = opacity;
  }
}

const deepClone = (obj) => {
  const newObj = obj.clone();
  newObj.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
    }
  });
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

    const arButton = ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(arButton);

    const itemNames = ['coffee-table', 'chair', 'cushion'];
    const itemHeights = [0.5, 0.7, 0.05];
    const items = [];
    for (let i = 0; i < itemNames.length; i++) {
      const model = await loadGLTF(`../assets/models/${itemNames[i]}/scene.gltf`);
      normalizeModel(model.scene, itemHeights[i]);
      const item = new THREE.Group();
      item.add(model.scene);
      item.visible = false;
      setOpacity(item, 0.5);
      items.push(item);
      scene.add(item);
    }

    let selectedItem = null;
    let prevTouchPosition = null;
    let touchDown = false;

    const itemButtons = document.querySelector("#item-buttons");
    const confirmButtons = document.querySelector("#confirm-buttons");
    itemButtons.style.display = "block";
    confirmButtons.style.display = "none";

    const select = (selectItem) => {
      items.forEach((item) => {
        item.visible = item === selectItem;
      });
      selectedItem = selectItem;
      itemButtons.style.display = "none";
      confirmButtons.style.display = "block";
    }

    const cancelSelect = () => {
      itemButtons.style.display = "block";
      confirmButtons.style.display = "none";
      if (selectedItem) {
        selectedItem.visible = false;
      }
      selectedItem = null;
    }

    const placeButton = document.querySelector("#place");
    const cancelButton = document.querySelector("#cancel");
    placeButton.addEventListener('beforexrselect', (e) => {
      e.preventDefault();
    });
    placeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const spawnItem = deepClone(selectedItem);
      setOpacity(spawnItem, 1.0);
      scene.add(spawnItem);
      cancelSelect();
    });
    cancelButton.addEventListener('beforexrselect', (e) => {
      e.preventDefault();
    });
    cancelButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelSelect();
    });

    for (let i = 0; i < items.length; i++) {
      const el = document.querySelector("#item" + i);
      el.addEventListener('beforexrselect', (e) => {
        e.preventDefault();
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        select(items[i]);
      });
    }

    const controller = renderer.xr.getController(0);
    scene.add(controller);

    controller.addEventListener('select', (e) => {
      if (e.data && e.data.points && e.data.points.length === 2) {
        const distance = e.data.points[0].distanceTo(e.data.points[1]);
        const scaleFactor = 1 + distance * 0.1; // Adjust the factor as needed
        if (selectedItem) {
          selectedItem.scale.multiplyScalar(scaleFactor);
        }
      }
    });

    controller.addEventListener('selectstart', (e) => {
      if (e.data && e.data.points && e.data.points.length > 0) {
        prevTouchPosition = e.data.points[0].clone();
        touchDown = true;
      }
    });

    controller.addEventListener('selectend', () => {
      prevTouchPosition = null;
      touchDown = false;
    });

    renderer.setAnimationLoop((timestamp, frame) => {
      if (!frame) return;

      const referenceSpace = renderer.xr.getReferenceSpace(); // ARButton requested 'local' reference space

      if (touchDown && selectedItem) {
        const viewerPose = frame.getViewerPose(referenceSpace);
        if (!viewerPose) return;

        const viewerMatrix = new THREE.Matrix4().fromArray(viewerPose.transform.inverse.matrix);
        const newPosition = controller.position.clone().applyMatrix4(viewerMatrix);

        if (prevTouchPosition) {
          const deltaX = newPosition.x - prevTouchPosition.x;
          const deltaY = newPosition.y - prevTouchPosition.y;
          const deltaZ = newPosition.z - prevTouchPosition.z;

          // Rotation around Y-axis (yaw)
          selectedItem.rotation.y += deltaX * 30;

          // Scale
          const scaleDistance = newPosition.distanceTo(prevTouchPosition);
          const scaleFactor = 1 + scaleDistance * 0.1; // Adjust the factor as needed
          selectedItem.scale.multiplyScalar(scaleFactor);

          // Dragging
          selectedItem.position.x += deltaX;
          selectedItem.position.y += deltaY;
          selectedItem.position.z += deltaZ;
        }

        prevTouchPosition = newPosition.clone();
      }

      if (selectedItem) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        if (hitTestResults.length) {
          const hit = hitTestResults[0];
          const hitPose = hit.getPose(referenceSpace);
          if (hitPose) {
            selectedItem.visible = true;
            selectedItem.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(hitPose.transform.matrix));
          }
        } else {
          selectedItem.visible = false;
        }
      }

      renderer.render(scene, camera);
    });
  }

  initialize();
});
