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
        if (child.isMesh) {
            child.material.transparent = true;
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

        const itemNames = ['Chair', 'light', 'plant', 'rug'];
        const itemHeights = [0.3, 0.3, 0.3, 0.3];
        const items = [];
        const placedItems = [];
        const models = {};

        const loadModel = async (itemName, itemHeight) => {
            if (!models[itemName]) {
                const model = await loadGLTF(`../assets/models/${itemName}/scene.gltf`);
                normalizeModel(model.scene, itemHeight);
                models[itemName] = model.scene;
            }
            return models[itemName];
        };

        itemNames.forEach((name, i) => {
            const item = new THREE.Group();
            item.name = name;
            items.push(item);
            scene.add(item);
        });

        let selectedItem = null;
        let lastTouchX = null;
        let lastTouchY = null;
        let lastAngle = null;
        let lastDistance = null;
        let currentInteractedItem = null;

        const raycaster = new THREE.Raycaster();
        const controller = renderer.xr.getController(0);
        scene.add(controller);

        const itemButtons = document.querySelector("#item-buttons");
        const confirmButtons = document.querySelector("#confirm-buttons");
        itemButtons.style.display = "block";
        confirmButtons.style.display = "none";

        const select = async (selectItem) => {
            if (!selectItem.children.length) {
                const model = await loadModel(selectItem.name, itemHeights[itemNames.indexOf(selectItem.name)]);
                selectItem.add(model);
            }
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
        const cancelButton = document.querySelector("#cancel");

        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelSelect();
        });

        items.forEach((item, i) => {
            const el = document.querySelector(`#item${i}`);
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await select(item);
            });
        });

        placeButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (selectedItem) {
                const spawnItem = deepClone(selectedItem);
                setOpacity(spawnItem, 1.0);
                scene.add(spawnItem);
                placedItems.push(spawnItem);
                currentInteractedItem = spawnItem;
                cancelSelect();
            }
        });

        // DRAG: Single-Finger Dragging Implementation
        document.addEventListener('touchmove', (event) => {
            if (selectedItem && event.touches.length === 1) {
                const touch = event.touches[0];
                if (lastTouchX !== null && lastTouchY !== null) {
                    const movementX = touch.pageX - lastTouchX;
                    const movementY = touch.pageY - lastTouchY;
                    selectedItem.position.x += movementX * 0.001; // Adjust factor for dragging speed
                    selectedItem.position.y -= movementY * 0.001;
                }
                lastTouchX = touch.pageX;
                lastTouchY = touch.pageY;
            }
        });

        // ROTATION: Two-Finger Twist Gesture
        document.addEventListener('touchmove', (event) => {
            if (selectedItem && event.touches.length === 2) {
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];

                const currentAngle = Math.atan2(touch2.pageY - touch1.pageY, touch2.pageX - touch1.pageX);
                if (lastAngle !== null) {
                    const deltaAngle = currentAngle - lastAngle;
                    selectedItem.rotation.y += deltaAngle;
                }
                lastAngle = currentAngle;
            }
        });

        // SCALING: Two-Finger Pinch Gesture
        document.addEventListener('touchmove', (event) => {
            if (selectedItem && event.touches.length === 2) {
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];

                const currentDistance = Math.hypot(touch2.pageX - touch1.pageX, touch2.pageY - touch1.pageY);
                if (lastDistance !== null) {
                    const scaleFactor = currentDistance / lastDistance;
                    selectedItem.scale.multiplyScalar(scaleFactor);
                }
                lastDistance = currentDistance;
            }
        });

        document.addEventListener('touchend', () => {
            lastTouchX = null;
            lastTouchY = null;
            lastAngle = null;
            lastDistance = null;
        });

        const animate = () => {
            renderer.setAnimationLoop(animate);
            renderer.render(scene, camera);
        };

        animate();
    };

    initialize();
});
