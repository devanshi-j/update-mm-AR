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

        const itemNames = ['Chair','light','plant','rug'];
        const itemHeights = [0.3, 0.3, 0.3, 0.3];
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
                const spawnItem = deepClone(selectedItem);
                setOpacity(spawnItem, 1.0);
                scene.add(spawnItem);
                placedItems.push(spawnItem);
                currentInteractedItem = spawnItem; // Set the current interacted item
                cancelSelect(); // Hide the selected model and reset selection
            }
        });

        const selectItem = (item) => {
            if (currentInteractedItem !== item) {
                if (currentInteractedItem) {
                    setOpacity(currentInteractedItem, 1.0); // Reset opacity for the previous item
                }
                currentInteractedItem = item;
                setOpacity(currentInteractedItem, 0.7); // Highlight selected item with slightly transparent opacity
            }
        };

        controller.addEventListener('selectstart', () => {
            touchDown = true;

            // Raycasting to check if we intersect with any placed items
            const tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);

            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

            const intersects = raycaster.intersectObjects(placedItems, true);

            if (intersects.length > 0) {
                selectItem(intersects[0].object.parent); // Assuming the object is in a group
            }
        });

        controller.addEventListener('selectend', () => {
            touchDown = false;
            prevTouchPosition = null;
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

            renderer.setAnimationLoop((timestamp, frame) => {
                if (frame) {
                    const referenceSpace = renderer.xr.getReferenceSpace();
                    const hitTestResults = frame.getHitTestResults(hitTestSource);

                    if (selectedItem && hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        const position = new THREE.Vector3().setFromMatrixPosition(hit.getPose(referenceSpace).transform.matrix);
                        selectedItem.position.copy(position);
                    }

                    // Rotation and dragging logic
                    if (touchDown && currentInteractedItem && !isPinching) {
                        const touchPosition = new THREE.Vector2(controller.position.x, controller.position.y);

                        if (prevTouchPosition) {
                            const delta = touchPosition.clone().sub(prevTouchPosition);
                            if (delta.length() > 0) {
                                currentInteractedItem.rotation.y -= delta.x * 5.0; // Rotate the object based on touch movement
                            }
                        }
                        prevTouchPosition = touchPosition.clone();
                    } else if (isDraggingWithTwoFingers && currentInteractedItem) {
                        const sessionSources = renderer.xr.getSession().inputSources;

                        if (sessionSources.length === 2) {
                            const newFingerPositions = [
                                new THREE.Vector3(sessionSources[0].gamepad.axes[0], sessionSources[0].gamepad.axes[1], 0),
                                new THREE.Vector3(sessionSources[1].gamepad.axes[0], sessionSources[1].gamepad.axes[1], 0)
                            ];

                            const movementVector = newFingerPositions[0].clone().sub(initialFingerPositions[0])
                                .add(newFingerPositions[1].clone().sub(initialFingerPositions[1]));

                            currentInteractedItem.position.add(new THREE.Vector3(movementVector.x, 0, -movementVector.y));
                            initialFingerPositions = newFingerPositions;
                        }
                    } else if (isPinching && currentInteractedItem) {
                        const sessionSources = renderer.xr.getSession().inputSources;

                        if (sessionSources.length === 2) {
                            const newDistance = Math.sqrt(
                                Math.pow(sessionSources[0].gamepad.axes[0] - sessionSources[1].gamepad.axes[0], 2) +
                                Math.pow(sessionSources[0].gamepad.axes[1] - sessionSources[1].gamepad.axes[1], 2)
                            );

                            const scaleChange = newDistance / initialDistance;
                            currentInteractedItem.scale.multiplyScalar(scaleChange);
                            initialDistance = newDistance;
                        }
                    }
                }

                renderer.render(scene, camera);
            });
        });
    };

    initialize();
}); 
