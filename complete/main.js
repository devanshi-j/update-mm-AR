import { loadGLTF } from "../libs/loader.js";
import * as THREE from "../libs/three123/three.module.js";
import { ARButton } from "../libs/jsm/ARButton.js";

// Utility function for model normalization
const normalizeModel = (obj, height) => {
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(height / size.y);

    const bbox2 = new THREE.Box3().setFromObject(obj);
    const center = bbox2.getCenter(new THREE.Vector3());
    obj.position.set(-center.x, -center.y, -center.z);
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

        // Arrays to track models
        const loadedModels = new Map();
        const selectedModels = new Set();
        const previewModels = new Map();
        const placedModels = [];

        // Interaction state
        let selectedObject = null;
        let isDragging = false;
        let isRotating = false;
        let previousTouchX = 0;
        let previousTouchY = 0;

        // Create reticle
        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.visible = false;
        reticle.matrixAutoUpdate = false;
        scene.add(reticle);

        // AR Setup
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

        let hitTestSource = null;
        let hitTestSourceRequested = false;

        // Model Management Functions
        const createPreviewModel = (originalModel) => {
            const previewModel = new THREE.Group();
            
            originalModel.traverse((child) => {
                if (child.isMesh) {
                    const clonedMesh = child.clone();
                    clonedMesh.material = child.material.clone();
                    clonedMesh.material.transparent = true;
                    clonedMesh.material.opacity = 0.5;
                    previewModel.add(clonedMesh);
                }
            });

            return previewModel;
        };

        const showSelectedModels = () => {
            // Clear existing preview models
            previewModels.forEach((model) => scene.remove(model));
            previewModels.clear();

            // Create and show preview for each selected model
            selectedModels.forEach((modelId) => {
                const originalModel = loadedModels.get(modelId);
                if (originalModel) {
                    const previewModel = createPreviewModel(originalModel);
                    previewModels.set(modelId, previewModel);
                    scene.add(previewModel);
                }
            });

            // Show reticle and confirm buttons if there are selected models
            const confirmButtons = document.getElementById("confirm-buttons");
            if (selectedModels.size > 0) {
                reticle.visible = true;
                confirmButtons.style.display = "flex";
            } else {
                reticle.visible = false;
                confirmButtons.style.display = "none";
            }
        };

        const placeModels = () => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            reticle.matrix.decompose(position, rotation, scale);

            // Place each selected model
            selectedModels.forEach((modelId) => {
                const originalModel = loadedModels.get(modelId);
                if (originalModel) {
                    const finalModel = new THREE.Group();
                    
                    originalModel.traverse((child) => {
                        if (child.isMesh) {
                            const placedMesh = child.clone();
                            placedMesh.material = child.material.clone();
                            placedMesh.material.transparent = false;
                            placedMesh.material.opacity = 1.0;
                            finalModel.add(placedMesh);
                        }
                    });

                    finalModel.position.copy(position);
                    finalModel.quaternion.copy(rotation);
                    
                    scene.add(finalModel);
                    placedModels.push(finalModel);
                }
            });

            // Cleanup
            previewModels.forEach((model) => scene.remove(model));
            previewModels.clear();
            selectedModels.clear();
            reticle.visible = false;
            document.getElementById("confirm-buttons").style.display = "none";
        };

        const cancelPlacement = () => {
            previewModels.forEach((model) => scene.remove(model));
            previewModels.clear();
            selectedModels.clear();
            reticle.visible = false;
            document.getElementById("confirm-buttons").style.display = "none";
        };

        // Touch Interaction Setup
        const raycaster = new THREE.Raycaster();
        const touches = new THREE.Vector2();

        const onTouchStart = (event) => {
            event.preventDefault();

            if (event.touches.length === 1) {
                touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedModels, true);

                if (intersects.length > 0) {
                    selectedObject = intersects[0].object.parent;
                    isRotating = true;
                    previousTouchX = event.touches[0].pageX;
                    isDragging = false;
                }
            } else if (event.touches.length === 2) {
                touches.x = (((event.touches[0].pageX + event.touches[1].pageX) / 2) / window.innerWidth) * 2 - 1;
                touches.y = -(((event.touches[0].pageY + event.touches[1].pageY) / 2) / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedModels, true);

                if (intersects.length > 0) {
                    selectedObject = intersects[0].object.parent;
                    previousTouchX = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                    previousTouchY = (event.touches[0].pageY + event.touches[1].pageY) / 2;
                    isDragging = true;
                    isRotating = false;
                }
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
            }
        };

        const onTouchEnd = () => {
            isRotating = false;
            isDragging = false;
            selectedObject = null;
        };

        // Model Loading
        const loadModels = async () => {
            for (const category in itemCategories) {
                for (const itemInfo of itemCategories[category]) {
                    try {
                        const model = await loadGLTF(`../assets/models/${category}/${itemInfo.name}/scene.gltf`);
                        normalizeModel(model.scene, itemInfo.height);

                        const modelGroup = new THREE.Group();
                        modelGroup.add(model.scene);
                        
                        loadedModels.set(`${category}-${itemInfo.name}`, modelGroup);
                    } catch (error) {
                        console.error(`Error loading model ${category}/${itemInfo.name}:`, error);
                    }
                }
            }
        };

        // UI Setup
        const setupUI = () => {
            // Menu elements
            const menuButton = document.getElementById("menu-button");
            const closeButton = document.getElementById("close-button");
            const sidebarMenu = document.getElementById("sidebar-menu");

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
                if (selectedModels.size === 0) {
                    reticle.visible = false;
                }
            });

            // Category submenu handlers
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

            // Model selection handlers
            for (const category in itemCategories) {
                for (const itemInfo of itemCategories[category]) {
                    const modelId = `${category}-${itemInfo.name}`;
                    const thumbnail = document.querySelector(`#${modelId}`);
                    
                    if (thumbnail) {
                        thumbnail.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            if (selectedModels.has(modelId)) {
                                selectedModels.delete(modelId);
                                thumbnail.classList.remove('selected');
                            } else {
                                selectedModels.add(modelId);
                                thumbnail.classList.add('selected');
                            }
                            
                            showSelectedModels();
                        });
                    }
                }
            }

            // Button handlers
            document.querySelector("#place").addEventListener("click", placeModels);
            document.querySelector("#cancel").addEventListener("click", cancelPlacement);
        };

        // Event Listeners
        renderer.domElement.addEventListener('touchstart', onTouchStart);
        renderer.domElement.addEventListener('touchmove', onTouchMove);
        renderer.domElement.addEventListener('touchend', onTouchEnd);

        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Render Loop
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

                if (hitTestSource && selectedModels.size > 0) {
                    const hitTestResults = frame.getHitTestResults(hitTestSource);
                    if (hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        reticle.visible = true;
                        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

                        // Update preview models position
                        const position = new THREE.Vector3();
                        const rotation = new THREE.Quaternion();
                        const scale = new THREE.Vector3();
                        reticle.matrix.decompose(position, rotation, scale);

                        previewModels.forEach((model) => {
                            model.position.copy(position);
                            model.quaternion.copy(rotation);
                        });
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
