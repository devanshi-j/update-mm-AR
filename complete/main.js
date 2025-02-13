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

const setOpacityForSelected = (opacity) => {
    selectedModels.forEach((model) => {
        model.traverse((child) => {
            if (child.isMesh) {
                child.material.transparent = true;
                child.material.opacity = opacity;
            }
        });
    });
};

const deepCloneSelectedModels = () => {
    return selectedModels.map((model) => {
        const clone = model.clone(true);
        clone.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
            }
        });
        return clone;
    });
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
        renderer.xr.addEventListener("sessionstart", () => {
            console.log("AR session started");
        });
        renderer.xr.addEventListener("sessionend", () => {
            console.log("AR session ended");
        });
        const raycaster = new THREE.Raycaster();
        const touches = new THREE.Vector2();
        let selectedObject = null;
        let isDragging = false;
        let isRotating = false;
        let isScaling = false;
        let previousTouchX = 0;
        let previousTouchY = 0;
        let previousPinchDistance = 0;
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
        let placedItems = [];
        let previewItem = null;
        let hitTestSource = null;
        let hitTestSourceRequested = false;
        let isModelSelected = false;
        const selectedModels = [];
        const selectModel = (model) => {
    selectedModels.splice(0, selectedModels.length); 
    selectedModels.push(model); 
};
        const getTouchDistance = (touch1, touch2) => {
            const dx = touch1.pageX - touch2.pageX;
            const dy = touch1.pageY - touch2.pageY;
            return Math.sqrt(dx * dx + dy * dy);
        };
        const onTouchStart = (event) => {
            event.preventDefault();
            if (event.touches.length === 1) {
                touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedItems, true);
                if (intersects.length > 0) {
                    let parent = intersects[0].object;
                    while (parent.parent && parent.parent !== scene) {
                        parent = parent.parent;
                    }
                    selectedObject = parent;
                    isRotating = true;
                    previousTouchX = event.touches[0].pageX;
                    isScaling = false;
                    isDragging = false;
                    deleteButton.style.left = `${event.touches[0].pageX}px`;
                    deleteButton.style.top = `${event.touches[0].pageY}px`;
                    deleteButton.style.display = "block";
                }
            } else if (event.touches.length === 2) {
                isScaling = true;
                isRotating = false;
                isDragging = false;
                const dx = event.touches[0].pageX - event.touches[1].pageX;
                const dy = event.touches[0].pageY - event.touches[1].pageY;
                previousPinchDistance = Math.sqrt(dx * dx + dy * dy);
            }
        };
        const onTouchMove = (event) => {
            event.preventDefault();
            if (isRotating && event.touches.length === 1 && selectedObject) {
                const deltaX = event.touches[0].pageX - previousTouchX;
                selectedObject.rotateY(deltaX * 0.005);
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
            } else if (isScaling && event.touches.length === 2 && selectedObject) {
                const currentPinchDistance = getTouchDistance(event.touches[0], event.touches[1]);
                const scaleFactor = currentPinchDistance / previousPinchDistance;
                if (scaleFactor !== 1) {
                    const newScale = selectedObject.scale.x * scaleFactor;
                    if (newScale >= 0.5 && newScale <= 2) {
                        selectedObject.scale.multiplyScalar(scaleFactor);
                    }
                }
                previousPinchDistance = currentPinchDistance;
            }
        };
        const onTouchEnd = (event) => {
            if (event.touches.length === 0) {
                isRotating = false;
                isDragging = false;
                isScaling = false;
                if (!selectedObject) {
                    deleteButton.style.display = "none";
                }
                selectedObject = null;
            }
        };
        renderer.domElement.addEventListener('touchstart', onTouchStart, false);
        renderer.domElement.addEventListener('touchmove', onTouchMove, false);
        renderer.domElement.addEventListener('touchend', onTouchEnd, false);
        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.getElementById("place");
        const cancelButton = document.getElementById("cancel");
        const deleteButton = document.getElementById("delete-button");
        const surfaceIndicator = document.getElementById("surface-indicator");
        const statusMessage = document.getElementById("status-message");
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
            if (!isModelSelected) {
                reticle.visible = false;
            }
        });
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
    previewItem = item;
    scene.add(previewItem);
    
    setOpacityForSelected(0.5); 

    confirmButtons.style.display = "flex";
    isModelSelected = true;
};
        const placeModel = () => {
            if (selectedModels.length > 0 && reticle.visible) {
                const clonedModels = deepCloneSelectedModels();
                const position = new THREE.Vector3();
                const rotation = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                reticle.matrix.decompose(position, rotation, scale);
                clonedModels.forEach((clone) => {
                    clone.position.copy(position);
                    clone.quaternion.copy(rotation);
                    scene.add(clone);
                    placedItems.push(clone);
                });
                selectedModels.length = 0;
                isModelSelected = false;
                reticle.visible = false;
                confirmButtons.style.display = "none";
            }
        };
        const cancelModel = () => {
            if (previewItem) {
                scene.remove(previewItem);
                previewItem = null;
            }
            isModelSelected = false;
            reticle.visible = false;
            confirmButtons.style.display = "none";
        };
        const deleteModel = () => {
            if (selectedModels.length > 0) {
                selectedModels.forEach((model) => {
                    scene.remove(model);
                    placedItems = placedItems.filter(item => item !== model);
                });
                selectedModels.length = 0;
                deleteButton.style.display = "none";
            }
        };
        placeButton.addEventListener("click", placeModel);
        cancelButton.addEventListener("click", cancelModel);
        deleteButton.addEventListener("click", deleteModel);
        for (const category of ['table', 'chair', 'shelf']) {
            for (let i = 1; i <= 3; i++) {
                const itemName = `${category}${i}`;
                try {
                    const model = await loadGLTF(`../assets/models/${category}/${itemName}/scene.gltf`);
                    normalizeModel(model.scene, 0.5);
                    const item = new THREE.Group();
                    item.add(model.scene);
                    loadedModels.set(`${category}-${itemName}`, item);
                    const thumbnail = document.querySelector(`#${category}-${itemName}`);
                    if (thumbnail) {
                        thumbnail.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const model = loadedModels.get(`${category}-${itemName}`);
                            if (model) {
                                const modelClone = model.clone(true);
                                showModel(modelClone);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error loading model ${category}/${itemName}:`, error);
                }
            }
        }
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
                    if (hitTestResults.length > 0 && isModelSelected) {
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
