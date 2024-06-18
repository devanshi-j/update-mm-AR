import { loadGLTF } from "../libs/loader.js";
import * as THREE from '../libs/three123/three.module.js';
import { ARButton } from '../libs/jsm/ARButton.js';
import { TransformControls } from '../libs/jsm/TransformControls.js'; // Ensure you have the TransformControls module imported

const normalizeModel = (obj, height) => {
  // Scale according to the specified height
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = bbox.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / size.y);

  // Reposition to center
  const bbox2 = new THREE.Box3().setFromObject(obj);
  const center = bbox2.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -center.y, -center.z);
};

const setOpacity = (obj, opacity) => {
  // Recursively set opacity for all children meshes
  obj.traverse((child) => {
    if (child.isMesh) {
      child.material.transparent = true;
      child.material.opacity = opacity;
    }
  });
};

const deepClone = (obj) => {
  // Clone the object and its children materials
  const newObj = obj.clone();
  newObj.traverse((child) => {
    if (child.isMesh) {
      child.material = child.material.clone();
    }
  });
  return newObj;
};

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

    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);

    const controller = renderer.xr.getController(0);
    scene.add(controller);

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
    };

    const cancelSelect = () => {
      itemButtons.style.display = "block";
      confirmButtons.style.display = "none";
      if (selectedItem) {
        selectedItem.visible = false;
      }
      selectedItem = null;
    };

    const placeButton = document.querySelector("#place");
    placeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const spawnItem = deepClone(selectedItem);
      setOpacity(spawnItem, 1.0);
      scene.add(spawnItem);
      selectedItem = spawnItem;
      activateTransformControls(selectedItem);
      cancelSelect();
    });

    const activateTransformControls = (object) => {
      transformControls.attach(object);
      transformControls.addEventListener('dragging-changed', (event) => {
        touchDown = event.value;
      });
    };

    const render = () => {
      renderer.render(scene, camera);
    };

    const cancelButton = document.querySelector("#cancel");
    cancelButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelSelect();
    });

    const itemElements = document.querySelectorAll(".item");
    itemElements.forEach((el, index) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        select(items[index]);
      });
    });

    renderer.xr.addEventListener("sessionstart", async (e) => {
      const session = renderer.xr.getSession();
      const viewerReferenceSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource({ space: viewerReferenceSpace });

      renderer.setAnimationLoop((timestamp, frame) => {
        if (!frame) return;

        const referenceSpace = renderer.xr.getReferenceSpace();

        if (touchDown && selectedItem) {
          const viewerMatrix = new THREE.Matrix4().fromArray(frame.getViewerPose(referenceSpace).transform.inverse.matrix);
          const newPosition = controller.position.clone().applyMatrix4(viewerMatrix);

          if (prevTouchPosition) {
            const deltaX = newPosition.x - prevTouchPosition.x;
            selectedItem.rotation.y += deltaX * 30;

            const scaleDistance = newPosition.distanceTo(prevTouchPosition);
            const scaleFactor = 1 + scaleDistance * 0.1;
            selectedItem.scale.multiplyScalar(scaleFactor);

            const dragDistance = new THREE.Vector3().subVectors(newPosition, prevTouchPosition);
            selectedItem.position.add(dragDistance);
          }

          prevTouchPosition = newPosition;
        }

        if (selectedItem) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length) {
            const hit = hitTestResults[0];
            selectedItem.visible = true;
            selectedItem.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(hit.getPose(referenceSpace).transform.matrix));
          } else {
            selectedItem.visible = false;
          }
        }

        render(camera, scene);
      });
    });

    render(camera, scene); // Initial render call
  };

  initialize();
});
