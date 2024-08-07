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
};

const setOpacity = (obj, opacity) => {
  obj.traverse((child) => {
    if (child.material) {
      child.material.format = THREE.RGBAFormat;
      child.material.opacity = opacity;
    }
  });
};

const deepClone = (obj) => {
  const newObj = obj.clone();
  newObj.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
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

    const attachInteractionListeners = (item) => {
      const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.01, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true }));
      item.add(cursor);
      item.cursor = cursor;
    };

    for (let i = 0; i < items.length; i++) {
      const el = document.querySelector("#item" + i);
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        select(items[i]);
      });
    }

    const controller = renderer.xr.getController(0);
    scene.add(controller);
    controller.addEventListener('selectstart', () => {
      touchDown = true;
    });
    controller.addEventListener('selectend', () => {
      touchDown = false;
      prevTouchPosition = null;
    });

    renderer.xr.addEventListener("sessionstart", async () => {
      const session
