import { loadGLTF } from "../libs/loader.js";
import * as THREE from "../libs/three123/three.module.js";
import { ARButton } from "../libs/jsm/ARButton.js";
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
const itemCategories = {
    lamp: [
        { name: "lamp1", height: 0.3 },
        { name: "lamp2", height: 0.35 },
        { name: "lamp3", height: 0.28 }
    ],
    chair: [
        { name: "chair1", height: 0.1 },
        { name: "chair2", height: 0.12 },
        { name: "chair3", height: 0.15 }
    ],
    shelf: [
        { name: "shelf1", height: 0.2 },
        { name: "shelf2", height: 0.25 },
        { name: "shelf3", height: 0.22 }
    ]
};
document.addEventListener("DOMContentLoaded", () => {
    const initialize = async () => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        document.body.appendChild(renderer.domElement);
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        scene.add(light);
        scene.add(directionalLight);
        const arButton = ARButton.createButton(renderer, {
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: document.body },
            sessionInit: {
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.body }
            }
        });
        document.body.appendChild(arButton);
        const controller = renderer.xr.getController(0);
        scene.add(controller);
        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.visible = false;
        reticle.matrixAutoUpdate = false;
        scene.add(reticle);
        const loadedModels = new Map();
        const placedItems = [];
        let previewItem = null;
        let hitTestSource = null;
        let hitTestSourceRequested = false;
        let touchState = {
            touchCount: 0,
            selectedModel: null,
            startTouches: [],
            initialScale: 1,
            initialRotation: null,
            initialPosition: null
        };
        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");
        const submenuToggles = document.querySelectorAll(".submenu-toggle");
        const mainThumbnails = document.querySelectorAll(".main-thumbnail");
        menuButton.addEventListener("click", () => {
            sidebarMenu.classList.add("active");
        });
        closeButton.addEventListener("click", () => {
            sidebarMenu.classList.remove("active");
            document.querySelectorAll(".submenu").forEach(submenu => {
                submenu.classList.remove("active");
            });
        });
        mainThumbnails.forEach(thumbnail => {
            thumbnail.addEventListener("click", (e) => {
                // Find the parent category and close its corresponding submenu
                const parentCategory = thumbnail.closest('.category');
                const correspondingSubmenu = parentCategory.querySelector('.submenu');
                if (correspondingSubmenu) {
                    correspondingSubmenu.classList.remove("active");
                }
            });
        });
        submenuToggles.forEach(toggle => {
            toggle.addEventListener("click", (e) => {
                e.stopPropagation();
                const targetSubmenu = toggle.nextElementSibling;
                targetSubmenu.classList.toggle("active");
            });
        });
        const handleTouchStart = (event) => {
            touchState.touchCount = event.touches.length;
            if (event.touches.length === 2) {
                touchState.startTouches = Array.from(event.touches);
                touchState.initialScale = touchState.selectedModel ? touchState.selectedModel.scale.x : 1;
                touchState.initialRotation = touchState.selectedModel ? touchState.selectedModel.rotation.clone() : null;
            }
        };
        const handleTouchMove = (event) => {
            if (touchState.selectedModel && touchState.touchCount === 2) {
                const currentTouches = Array.from(event.touches);
                if (currentTouches.length === 2) {
                    const initialDistance = Math.hypot(
                        touchState.startTouches[0].pageX - touchState.startTouches[1].pageX,
                        touchState.startTouches[0].pageY - touchState.startTouches[1].pageY
                    );
                    const currentDistance = Math.hypot(
                        currentTouches[0].pageX - currentTouches[1].pageX,
                        currentTouches[0].pageY - currentTouches[1].pageY
                    );
                    const scaleFactor = currentDistance / initialDistance;
                    touchState.selectedModel.scale.setScalar(touchState.initialScale * scaleFactor);
                    const rotationDelta = Math.atan2(
                        currentTouches[1].pageY - currentTouches[0].pageY,
                        currentTouches[1].pageX - currentTouches[0].pageX
                    ) - Math.atan2(
                        touchState.startTouches[1].pageY - touchState.startTouches[0].pageY,
                        touchState.startTouches[1].pageX - touchState.startTouches[0].pageX
                    );
                    touchState.selectedModel.rotation.z = touchState.initialRotation.z + rotationDelta;
                }
            }
        };
        const handleTouchEnd = (event) => {
            touchState.touchCount = event.touches.length;
            touchState.selectedModel = null;
        };
        renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
        renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
        renderer.domElement.addEventListener('touchend', handleTouchEnd, { passive: false });
        const showModel = (item) => {
            if (previewItem) {
                scene.remove(previewItem);
            }
            previewItem = item;
            scene.add(previewItem);
            setOpacity(previewItem, 0.5);
            confirmButtons.style.display = "flex";
        };
        const placeModel = () => {
            if (previewItem && reticle.visible) {
                const clone = deepClone(previewItem);
                setOpacity(clone, 1.0);
                const position = new THREE.Vector3();
                const rotation = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                reticle.matrix.decompose(position, rotation, scale);
                clone.position.copy(position);
                clone.quaternion.copy(rotation);
                scene.add(clone);
                placedItems.push(clone);
                cancelModel();
            }
        };
        const cancelModel = () => {
            confirmButtons.style.display = "none";
            if (previewItem) {
                scene.remove(previewItem);
                previewItem = null;
            }
        };
        for (const category in itemCategories) {
            for (const itemInfo of itemCategories[category]) {
                try {
                    const model = await loadGLTF(`../assets/models/${category}/${itemInfo.name}/scene.gltf`);
                    normalizeModel(model.scene, itemInfo.height);
                    const item = new THREE.Group();
                    item.add(model.scene);
                    loadedModels.set(`${category}-${itemInfo.name}`, item);
                    const thumbnail = document.querySelector(`#${category}-${itemInfo.name}`);
                    if (thumbnail) {
                        thumbnail.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const model = loadedModels.get(`${category}-${itemInfo.name}`);
                            if (model) {
                                const modelClone = deepClone(model);
                                showModel(modelClone);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error loading model ${category}/${itemInfo.name}:`, error);
                }
            }
        }
        placeButton.addEventListener("click", placeModel);
        cancelButton.addEventListener("click", cancelModel);
        renderer.setAnimationLoop((timestamp, frame) => {
            if (frame) {
                const referenceSpace = renderer.xr.getReferenceSpace();
                const session = renderer.xr.getSession();
                if (!hitTestSourceRequested) {
                    session.requestReferenceSpace('viewer').then((referenceSpace) => {
                        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                            hitTestSource = source;
                        });
                    });
                    hitTestSourceRequested = true;
                }
                if (hitTestSource) {
                    const hitTestResults = frame.getHitTestResults(hitTestSource);
                    if (hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        reticle.visible = true;
                        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                        if (previewItem) {
                            const position = new THREE.Vector3();
                            const rotation = new THREE.Quaternion();
                            const scale = new THREE.Vector3();
                            reticle.matrix.decompose(position, rotation, scale);
                            previewItem.position.copy(position);
                            previewItem.quaternion.copy(rotation);
                        }
                    } else {
                        reticle.visible = false;
                    }
                }
            }
            renderer.render(scene, camera);
        });
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    };
    initialize().catch(console.error);
});
