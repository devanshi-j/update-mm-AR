/*import { loadGLTF } from "../libs/loader.js";
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

        controller.addEventListener('selectstart', (e) => {
            // Logic to select the item in the scene based on hit testing or user input
            selectedItem = items.find(item => item.visible); // Example selection logic
            if (selectedItem && e.data && e.data.points && e.data.points.length > 0) {
                prevTouchPosition = e.data.points[0].clone();
                touchDown = true; // Set to true when touch interaction starts
            }
        });

        controller.addEventListener('selectend', (e) => {
            if (touchDown && selectedItem && prevTouchPosition) {
                const newPosition = e.data.points[0].clone();

                // Apply rotation, scaling, or other actions to the selected item
                const deltaX = newPosition.x - prevTouchPosition.x;
                const deltaY = newPosition.y - prevTouchPosition.y;
                selectedItem.rotation.y += deltaX * 30;

               /* const scaleDistance = newPosition.distanceTo(prevTouchPosition);
                const scaleFactor = 1 + scaleDistance * 0.1; // Adjust the factor as needed
                selectedItem.scale.multiplyScalar(scaleFactor);

                const dragDistance = new THREE.Vector3().subVectors(newPosition, prevTouchPosition);
                selectedItem.position.add(dragDistance);

                prevTouchPosition = newPosition.clone();
            }
            touchDown = false; // Set to false when touch interaction ends
        });

        controller.addEventListener('squeezestart', (e) => {
            // Logic to handle continuous user interactions when trigger or button is pressed
            if (selectedItem && e.data && e.data.points && e.data.points.length > 0) {
                prevTouchPosition = e.data.points[0].clone();
                touchDown = true;
            }
        });

        controller.addEventListener('squeezemove', (e) => {
            if (touchDown && selectedItem && e.data && e.data.points && e.data.points.length > 0) {
                const newPosition = e.data.points[0].clone();

                // Update user interactions during continuous squeezing motion
                const deltaX = newPosition.x - prevTouchPosition.x;
                const deltaY = newPosition.y - prevTouchPosition.y;
                selectedItem.rotation.y += deltaX * 30;

                const scaleDistance = newPosition.distanceTo(prevTouchPosition);
                const scaleFactor = 1 + scaleDistance * 0.1; // Adjust the factor as needed
                selectedItem.scale.multiplyScalar(scaleFactor);

                const dragDistance = new THREE.Vector3().subVectors(newPosition, prevTouchPosition);
                selectedItem.position.add(dragDistance);

                prevTouchPosition = newPosition.clone();
            }
        });

        controller.addEventListener('squeezeend', (e) => {
            // Additional logic when continuous user interaction ends
            prevTouchPosition = null;
            touchDown = false;
        });

        renderer.xr.addEventListener('sessionstart', async (e) => {
            const referenceSpace = await renderer.xr.getReferenceSpace();
            const hitTestSource = await renderer.xr.getSession().requestHitTestSource({
                space: referenceSpace,
                offsetRay: new XRRay()
            });

            renderer.setAnimationLoop((timestamp, frame) => {
                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (selectedItem && hitTestResults.length) {
                    const hit = hitTestResults[0];
                    const hitPose = hit.getPose(referenceSpace);

                    if (hitPose) {
                        selectedItem.visible = true;
                        selectedItem.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(hitPose.transform.matrix));
                    }
                } else if (selectedItem) {
                    selectedItem.visible = false;
                }

                renderer.render(scene, camera);
            });
        });
    }

    initialize();
});*/


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

// Recursively set opacity
const setOpacity = (obj, opacity) => {
    obj.children.forEach((child) => {
        setOpacity(child, opacity);
    });
    if (obj.material) {
        obj.material.format = THREE.RGBAFormat; // Required for opacity
        obj.material.opacity = opacity;
    }
}

// Make clone object not sharing materials
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

        const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: document.body } });
        document.body.appendChild(renderer.domElement);
        document.body.appendChild(arButton);

        const itemNames = ['coffee-table', 'chair', 'cushion'];
        const itemHeights = [0.5, 0.7, 0.05];
        const items = [];
        for (let i = 0; i < itemNames.length; i++) {
            const model = await loadGLTF('../assets/models/' + itemNames[i] + '/scene.gltf');
            normalizeModel(model.scene, itemHeights[i]);
            const item = new THREE.Group();
            item.add(model.scene);
            item.visible = false;
            setOpacity(item, 0.5);
            items.push(item);
            scene.add(item);
        }

        let selectedItem = null;
        let activeItem = null;
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
            activeItem = spawnItem; // Set the spawned item as the active item
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

        const handleUserInteractions = (controller, frame, referenceSpace) => {
            const viewerMatrix = new THREE.Matrix4().fromArray(frame.getViewerPose(referenceSpace).transform.inverse.matrix);
            const newPosition = controller.position.clone();
            newPosition.applyMatrix4(viewerMatrix);

            if (touchDown && activeItem) {
                if (prevTouchPosition) {
                    const deltaX = newPosition.x - prevTouchPosition.x;
                    const deltaY = newPosition.y - prevTouchPosition.y;
                    activeItem.rotation.y += deltaX * 30;
                    const scaleDistance = newPosition.distanceTo(prevTouchPosition);
                    const scaleFactor = 1 + scaleDistance * 0.1;
                    activeItem.scale.multiplyScalar(scaleFactor);
                    const dragDistance = new THREE.Vector3().subVectors(newPosition, prevTouchPosition);
                    activeItem.position.add(dragDistance);
                }
                prevTouchPosition = newPosition.clone();
            }
        }

        const controller = renderer.xr.getController(0);
        scene.add(controller);
        controller.addEventListener('selectstart', (e) => {
            touchDown = true;
            if (selectedItem) {
                activeItem = selectedItem;
                selectedItem = null;
            }
        });
        controller.addEventListener('selectend', (e) => {
            touchDown = false;
            prevTouchPosition = null;
        });

        renderer.xr.addEventListener('sessionstart', async (e) => {
            const session = renderer.xr.getSession();
            const viewerReferenceSpace = await session.requestReferenceSpace('viewer');
            const hitTestSource = await session.requestHitTestSource({ space: viewerReferenceSpace });

            renderer.setAnimationLoop((timestamp, frame) => {
                if (!frame) return;

                const referenceSpace = renderer.xr.getReferenceSpace();
                const hitTestResults = frame.getHitTestResults(hitTestSource);

                if (selectedItem && hitTestResults.length) {
                    const hit = hitTestResults[0];
                    selectedItem.visible = true;
                    selectedItem.position.setFromMatrixPosition(new THREE.Matrix4().fromArray(hit.getPose(referenceSpace).transform.matrix));
                } else if (selectedItem) {
                    selectedItem.visible = false;
                }

                handleUserInteractions(controller, frame, referenceSpace);
                renderer.render(scene, camera);
            });
        });
    }
    initialize();
});
