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
    obj.children.forEach((child) => {
        setOpacity(child, opacity);
    });
    if (obj.material) {
        obj.material.format = THREE.RGBAFormat;
        obj.material.transparent = true; // Ensure material is transparent to apply opacity
        obj.material.opacity = opacity;
    }
};

const deepClone = (obj) => {
    const newObj = obj.clone();
    newObj.traverse((o) => {
        if (o.isMesh) {
            o.material = o.material.clone(); // Clone material to avoid shared references
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

        const itemNames = ['chair', 'coffee-table', 'cushion'];
        const itemHeights = [0.5, 0.7, 0.05];
        const items = [];
        const placedItems = [];

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
        let isPinching = false;
        let initialDistance = null;
        let currentInteractedItem = null; // Track currently interacted item

        let isDraggingWithTwoFingers = false;
        let initialFingerPositions = [];

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
            currentInteractedItem = null; // Reset currently interacted item
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
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                select(item);
            });
        });

        placeButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (selectedItem) {
                const spawnItem = deepClone(selectedItem); // Ensure it's a deep clone
                setOpacity(spawnItem, 1.0); // Set opacity for the new instance
                scene.add(spawnItem); // Add the new instance to the scene
                placedItems.push(spawnItem); // Keep track of all placed items

                // Hide the selected item but don't set it to null
                selectedItem.visible = false; // This hides the original selected item
                selectedItem = null; // Reset selected item

                // Reset UI to allow for new selection
                itemButtons.style.display = "block";
                confirmButtons.style.display = "none";
            }
        });

        const controller = renderer.xr.getController(0);
        scene.add(controller);

        controller.addEventListener('selectstart', () => {
            touchDown = true;
        });

        controller.addEventListener('selectend', () => {
            touchDown = false;
            prevTouchPosition = null;
            isDraggingWithTwoFingers = false;
            initialFingerPositions = [];
            currentInteractedItem = null; // Reset interacted item on select end
        });

        renderer.xr.addEventListener("sessionstart", async () => {
            const session = renderer.xr.getSession();
            const viewerReferenceSpace = await session.requestReferenceSpace("viewer");
            const hitTestSource = await session.requestHitTestSource({ space: viewerReferenceSpace });

            session.addEventListener('inputsourceschange', () => {
                const sources = session.inputSources;
                if (sources.length === 2) {
                    isPinching = true;
                    initialDistance = sources[0].gamepad.axes[1] - sources[1].gamepad.axes[1];

                    // Detecting two-finger dragging
                    initialFingerPositions = [
                        new THREE.Vector3(sources[0].gamepad.axes[0], sources[0].gamepad.axes[1], 0),
                        new THREE.Vector3(sources[1].gamepad.axes[0], sources[1].gamepad.axes[1], 0)
                    ];
                    isDraggingWithTwoFingers = true;
                } else {
                    isPinching = false;
                    initialDistance = null;
                    isDraggingWithTwoFingers = false;
                }
            });

            renderer.setAnimationLoop((timestamp, frame) => {
                if (!frame) return;

                const referenceSpace = renderer.xr.getReferenceSpace();
                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (selectedItem && hitTestResults.length) {
                    const hit = hitTestResults[0];
                    const hitPose = hit.getPose(referenceSpace);

                    selectedItem.visible = true;
                    selectedItem.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(hitPose.transform.matrix));
                    setOpacity(selectedItem, 1.0);
                    placedItems.push(selectedItem);
                    selectedItem = null;
                    cancelSelect();
                }

                // Handle interactions with placed items
                if (touchDown && placedItems.length > 0) {
                    const newPosition = controller.position.clone();
                    if (prevTouchPosition) {
                        const deltaX = newPosition.x - prevTouchPosition.x;

                        // Apply rotation to the specific item being interacted with
                        if (currentInteractedItem) {
                            currentInteractedItem.rotation.y += deltaX * 6.0; // Faster rotation
                        }
                    }
                    prevTouchPosition = newPosition;
                }

                // Handling two-finger dragging
                if (isDraggingWithTwoFingers && placedItems.length > 0) {
                    const sources = session.inputSources;
                    const currentFingerPositions = [
                        new THREE.Vector3(sources[0].gamepad.axes[0], sources[0].gamepad.axes[1], 0),
                        new THREE.Vector3(sources[1].gamepad.axes[0], sources[1].gamepad.axes[1], 0)
                    ];

                    const deltaX = (currentFingerPositions[0].x - initialFingerPositions[0].x + currentFingerPositions[1].x - initialFingerPositions[1].x) / 2;
                    const deltaY = (currentFingerPositions[0].y - initialFingerPositions[0].y + currentFingerPositions[1].y - initialFingerPositions[1].y) / 2;

                    if (currentInteractedItem) {
                        currentInteractedItem.position.x += deltaX;
                        currentInteractedItem.position.y += deltaY;
                    }

                    initialFingerPositions = currentFingerPositions;
                }

                // Handling pinch to scale
                if (isPinching && placedItems.length > 0 && initialDistance !== null) {
                    const sources = session.inputSources;
                    const currentDistance = sources[0].gamepad.axes[1] - sources[1].gamepad.axes[1];
                    const scaleFactor = currentDistance / initialDistance;

                    if (currentInteractedItem) {
                        currentInteractedItem.scale.multiplyScalar(scaleFactor);
                    }

                    initialDistance = currentDistance; // Update for smooth scaling
                }

                // Render the scene
                renderer.render(scene, camera);
            });
        });
    };

    initialize();
});
