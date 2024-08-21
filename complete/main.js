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
        let isPinching = false;
        let initialDistance = null;
        let isDraggingWithTwoFingers = false;
        let initialFingerPositions = [];
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

        const selectItem = (item) => {
            if (currentInteractedItem !== item) {
                if (currentInteractedItem) {
                    setOpacity(currentInteractedItem, 1.0);
                }
                currentInteractedItem = item;
                setOpacity(currentInteractedItem, 0.7);
            }
        };

        controller.addEventListener('selectstart', () => {
            const tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);

            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

            const intersects = raycaster.intersectObjects(placedItems, true);

            if (intersects.length > 0) {
                selectItem(intersects[0].object.parent);
            }
        });

        controller.addEventListener('selectend', () => {
            // Removed single-hand drag code
        });

        renderer.xr.addEventListener("sessionstart", async () => {
            const session = renderer.xr.getSession();
            const viewerReferenceSpace = await session.requestReferenceSpace("viewer");
            const hitTestSource = await session.requestHitTestSource({ space: viewerReferenceSpace });

            session.addEventListener('inputsourceschange', () => {
                const sources = session.inputSources;
                if (sources.length === 2) {
                    isPinching = true;
                    initialDistance = Math.sqrt(
                        Math.pow(sources[0].gamepad.axes[0] - sources[1].gamepad.axes[0], 2) +
                        Math.pow(sources[0].gamepad.axes[1] - sources[1].gamepad.axes[1], 2)
                    );
                    isDraggingWithTwoFingers = true;
                    initialFingerPositions = [
                        new THREE.Vector3(sources[0].gamepad.axes[0], sources[0].gamepad.axes[1], 0),
                        new THREE.Vector3(sources[1].gamepad.axes[0], sources[1].gamepad.axes[1], 0)
                    ];
                }
            });

            session.addEventListener("selectstart", async () => {
                const frame = session.requestAnimationFrame;

                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (hitTestResults.length > 0) {
                    const hitPose = hitTestResults[0].getPose(renderer.xr.getReferenceSpace());
                    const pos = hitPose.transform.position;
                    if (selectedItem) {
                        selectedItem.position.set(pos.x, pos.y, pos.z);
                        selectedItem.visible = true;
                    }
                }
            });
        });

        // New swipe gesture implementation
        let swipeStartPos = null;
        let swipeEndPos = null;
        const swipeThreshold = 30; // Threshold for swipe detection

        document.addEventListener('touchstart', (event) => {
            if (event.touches.length === 1 && currentInteractedItem) {
                swipeStartPos = event.touches[0].pageX; // Record the start position of the swipe
            }
        });

        document.addEventListener('touchend', (event) => {
            if (swipeStartPos !== null && currentInteractedItem) {
                swipeEndPos = event.changedTouches[0].pageX; // Record the end position of the swipe
                const swipeDistance = swipeEndPos - swipeStartPos;

                // Check if the swipe distance exceeds the threshold
                if (Math.abs(swipeDistance) > swipeThreshold) {
                    if (swipeDistance > 0) {
                        currentInteractedItem.rotation.y -= Math.PI / 4;  // Rotate right
                    } else {
                        currentInteractedItem.rotation.y += Math.PI / 4;  // Rotate left
                    }
                }

                // Reset swipe positions
                swipeStartPos = null;
                swipeEndPos = null;
            }
        });

        const animate = () => {
            // Update the scene as needed (e.g., handling pinching and dragging with two fingers)
            renderer.setAnimationLoop(animate);
            renderer.render(scene, camera);
        };

        animate();
    };

    initialize();
});
