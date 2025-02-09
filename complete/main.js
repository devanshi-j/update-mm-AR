import { loadGLTF } from "../libs/loader.js";
import * as THREE from "../libs/three123/three.module.js";
import { ARButton } from "../libs/jsm/ARButton.js";

// Utility functions
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
    table: [
        { name: "table1", height: 0.5 },
        { name: "table2", height: 0.5 },
        { name: "table3", height: 0.5 }
    ],
    chair: [
        { name: "chair1", height: 0.5 },
        { name: "chair2", height: 0.5 },
        { name: "chair3", height: 0.5 }
    ],
    shelf: [
        { name: "shelf1", height: 0.5 },
        { name: "shelf2", height: 0.5 },
        { name: "shelf3", height: 0.5 }
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    const initialize = async () => {
        // Scene and AR setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;

        document.body.appendChild(renderer.domElement);

        // Add lights
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

        // Handle XR session start
        renderer.xr.addEventListener("sessionstart", () => {
            console.log("AR session started");
        });

        renderer.xr.addEventListener("sessionend", () => {
            console.log("AR session ended");
        });

        // Raycaster setup
        const raycaster = new THREE.Raycaster();
        const touches = new THREE.Vector2();
        let selectedObject = null;
        let isDragging = false;
        let isRotating = false;
        // let isScaling = false; // Commented out
        let previousTouchX = 0;
        let previousTouchY = 0;
        // let previousPinchDistance = 0; // Commented out

        // Controller setup for AR
        const controller = renderer.xr.getController(0);
        scene.add(controller);

        // Create reticle
        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.visible = false;
        reticle.matrixAutoUpdate = false;
        scene.add(reticle);

        // Model Management
        const loadedModels = new Map();
        const placedItems = [];
        let previewItem = null;
        let hitTestSource = null;
        let hitTestSourceRequested = false;
        let isModelSelected = false;

        // Calculate distance between two touch points
        const getTouchDistance = (touch1, touch2) => {
            const dx = touch1.pageX - touch2.pageX;
            const dy = touch1.pageY - touch2.pageY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const onTouchStart = (event) => {
            event.preventDefault();

            if (event.touches.length === 1) {
                // Single touch for rotation
                touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedItems, true);

                if (intersects.length > 0) {
                    // Find the top-level parent object (the placed model)
                    let parent = intersects[0].object;
                    while (parent.parent && parent.parent !== scene) {
                        parent = parent.parent;
                    }
                    selectedObject = parent;
                    isRotating = true;
                    previousTouchX = event.touches[0].pageX;
                    // isScaling = false; // Commented out
                    isDragging = false;
                }
            } else if (event.touches.length === 2) {
                // Two finger touch handling remains the same
                const currentPinchDistance = getTouchDistance(event.touches[0], event.touches[1]);

                if (Math.abs(previousPinchDistance - currentPinchDistance) < 10) {
                    touches.x = (((event.touches[0].pageX + event.touches[1].pageX) / 2) / window.innerWidth) * 2 - 1);
                    touches.y = -(((event.touches[0].pageY + event.touches[1].pageY) / 2) / window.innerHeight) * 2 + 1);

                    raycaster.setFromCamera(touches, camera);
                    const intersects = raycaster.intersectObjects(placedItems, true);

                    if (intersects.length > 0) {
                        let parent = intersects[0].object;
                        while (parent.parent && parent.parent !== scene) {
                            parent = parent.parent;
                        }
                        selectedObject = parent;
                        previousTouchX = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                        previousTouchY = (event.touches[0].pageY + event.touches[1].pageY) / 2;
                        isDragging = true;
                        isRotating = false;
                        // isScaling = false; // Commented out
                    }
                } else {
                    previousPinchDistance = currentPinchDistance;
                    // isScaling = true; // Commented out
                    isRotating = false;
                    isDragging = false;
                }
            }
        };

        const onTouchMove = (event) => {
            event.preventDefault();

            if (isRotating && event.touches.length === 1 && selectedObject) {
                // Calculate rotation based on touch movement
                const deltaX = event.touches[0].pageX - previousTouchX;

                // Only rotate around Y axis with proper sensitivity
                selectedObject.rotateY(deltaX * 0.005); // Reduced sensitivity for smoother rotation

                previousTouchX = event.touches[0].pageX;
            } else if (isDragging && event.touches.length === 2 && selectedObject) {
                const currentCenterX = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                const currentCenterY = (event.touches[0].pageY + event.touches[1].pageY) / 2;

                const deltaX = (currentCenterX - previousTouchX) * 0.01;
                const deltaY = (currentCenterY - previousTouchY) * 0.01;

                selectedObject.position.x += deltaX;
                selectedObject.position.z += deltaY;

                previousTouchX = currentCenterX;
                previousTouchY = currentCenterY;
            } /* else if (isScaling && event.touches.length === 2 && selectedObject) {
                const currentPinchDistance = getTouchDistance(event.touches[0], event.touches[1]);
                const scaleFactor = currentPinchDistance / previousPinchDistance;

                if (scaleFactor !== 1) {
                    const newScale = selectedObject.scale.x * scaleFactor;
                    if (newScale >= 0.5 && newScale <= 2) {
                        selectedObject.scale.multiplyScalar(scaleFactor);
                    }
                }

                previousPinchDistance = currentPinchDistance;
            } */
        };

        const onTouchEnd = (event) => {
            if (event.touches.length === 0) {
                isRotating = false;
                isDragging = false;
                // isScaling = false; // Commented out
                selectedObject = null;
            }
        };

        // Add touch event listeners
        renderer.domElement.addEventListener('touchstart', onTouchStart, false);
        renderer.domElement.addEventListener('touchmove', onTouchMove, false);
        renderer.domElement.addEventListener('touchend', onTouchEnd, false);

        // UI Elements setup
        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");

        // Menu event handlers
        document.addEventListener("click", (event) => {
            const isClickInsideMenu = sidebarMenu?.contains(event.target);
            const isClickOnMenuButton = menuButton?.contains(event.target);
            const isMenuOpen = sidebarMenu?.classList.contains("open");

            if (!isClickInsideMenu && !isClickOnMenuButton && isMenuOpen) {
                sidebarMenu.classList.remove("open");
                closeButton.style.display = "none";
                menuButton.style.display = "block";

                reticle.visible = false;
            }
        });

        menuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            sidebarMenu.classList.add("open");
            menuButton.style.display = "none";
            closeButton.style.display = "block";
        });

        closeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            sidebarMenu.classList.remove("open");
            closeButton.style.display = "none";
            menuButton.style.display = "block";
            // Hide reticle when menu is closed
            if (!isModelSelected) {
                reticle.visible = false;
            }
        });

        // Category handlers
        const icons = document.querySelectorAll(".icon");
        icons.forEach((icon) => {
            icon.addEventListener("click", (event) => {
                event.stopPropagation();
                const clickedSubmenu = icon.querySelector(".submenu");

                document.querySelectorAll('.submenu').forEach(submenu => {
                    if (submenu !== clickedSubmenu) {
                        submenu.classList.remove('open');
                    }
                });

                clickedSubmenu.classList.toggle("open");
            });
        });

        const showModel = (item) => {
            if (previewItem) {
                scene.remove(previewItem);
            }

            // Deep clone the item and set opacity
            const modelClone = item.clone();
            modelClone.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.5; // Set the desired opacity
                }
            });

            previewItem = modelClone;
            scene.add(previewItem);
            confirmButtons.style.display = "flex";
            // Set model selected state to true
            isModelSelected = true;
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
                clone.scale.copy(scale);

                scene.add(clone);
                placedItems.push(clone);

                // Reset model selected state and hide reticle
                isModelSelected = false;
                reticle.visible = false;

                // Clear the preview and hide confirmation buttons
                cancelModel();
            }
        };

        const cancelModel = () => {
            confirmButtons.style.display = "none";
            if (previewItem) {
                scene.remove(previewItem);
                previewItem = null;
            }
            // Set model selected state to false
            isModelSelected = false;
            // Hide reticle
            reticle.visible = false;
        };

        // Load models
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

        // Button Event Listeners
        placeButton.addEventListener("click", placeModel);
        cancelButton.addEventListener("click", cancelModel);

        // AR Session and Render Loop
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
                    if (hitTestResults.length > 0 && isModelSelected) {  // Only show reticle if model is selected
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

        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    };

    initialize().catch(console.error);
});
