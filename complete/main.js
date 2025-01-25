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
        const raycaster = new THREE.Raycaster();
        
        let previewItem = null;
        let hitTestSource = null;
        let hitTestSourceRequested = false;

        let currentInteractionMode = 'move';
        const INTERACTION_MODES = {
            NONE: 'none',
            MOVE: 'move',
            ROTATE: 'rotate',
            SCALE: 'scale'
        };

        let touchState = {
            touchCount: 0,
            selectedModel: null,
            startTouches: [],
            initialScale: 1,
            initialRotation: null,
            initialPosition: null,
            dragStartPosition: null,
            isRotating: false,
            isDragging: false,
            isScaling: false
        };

        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");
        const submenuToggles = document.querySelectorAll(".submenu-toggle");
        const mainThumbnails = document.querySelectorAll(".main-thumbnail");

        // Interaction mode buttons
        const moveModeButton = document.getElementById("move-mode");
        const rotateModeButton = document.getElementById("rotate-mode");
        const scaleModeButton = document.getElementById("scale-mode");

        // Menu interaction
        menuButton.addEventListener("click", () => {
            sidebarMenu.classList.add("open");
        });

        closeButton.addEventListener("click", () => {
            sidebarMenu.classList.remove("open");
            document.querySelectorAll(".submenu").forEach(submenu => {
                submenu.classList.remove("active");
            });
        });

        // Interaction mode setup
        moveModeButton.addEventListener("click", () => {
            currentInteractionMode = INTERACTION_MODES.MOVE;
            updateInteractionModeUI();
        });

        rotateModeButton.addEventListener("click", () => {
            currentInteractionMode = INTERACTION_MODES.ROTATE;
            updateInteractionModeUI();
        });

        scaleModeButton.addEventListener("click", () => {
            currentInteractionMode = INTERACTION_MODES.SCALE;
            updateInteractionModeUI();
        });

        function updateInteractionModeUI() {
            [moveModeButton, rotateModeButton, scaleModeButton].forEach(btn => 
                btn.classList.remove('active')
            );

            switch(currentInteractionMode) {
                case INTERACTION_MODES.MOVE:
                    moveModeButton.classList.add('active');
                    break;
                case INTERACTION_MODES.ROTATE:
                    rotateModeButton.classList.add('active');
                    break;
                case INTERACTION_MODES.SCALE:
                    scaleModeButton.classList.add('active');
                    break;
            }
        }

        // Initial mode setup
        updateInteractionModeUI();

        mainThumbnails.forEach(thumbnail => {
            thumbnail.addEventListener("click", (e) => {
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
            event.preventDefault();
            touchState.touchCount = event.touches.length;

            if (event.touches.length === 1) {
                touchState.startTouches = [event.touches[0]];
                
                const touch = event.touches[0];
                const touchX = (touch.pageX / window.innerWidth) * 2 - 1;
                const touchY = -(touch.pageY / window.innerHeight) * 2 + 1;
                
                raycaster.setFromCamera({ x: touchX, y: touchY }, camera);
                const intersects = raycaster.intersectObjects(placedItems);
                
                if (intersects.length > 0) {
                    touchState.selectedModel = intersects[0].object;
                    touchState.initialRotation = touchState.selectedModel.rotation.z;
                    touchState.initialPosition = touchState.selectedModel.position.clone();
                    touchState.initialScale = touchState.selectedModel.scale.x;
                    touchState.dragStartPosition = {
                        x: event.touches[0].pageX,
                        y: event.touches[0].pageY
                    };
                }
            } 
            else if (event.touches.length === 2) {
                touchState.startTouches = Array.from(event.touches);
            }
        };

        const handleTouchMove = (event) => {
            event.preventDefault();
            if (!touchState.selectedModel) return;

            if (touchState.touchCount === 1) {
                const currentTouch = event.touches[0];
                
                switch(currentInteractionMode) {
                    case INTERACTION_MODES.MOVE:
                        handleModelMovement(currentTouch);
                        break;
                    case INTERACTION_MODES.ROTATE:
                        handleModelRotation(currentTouch);
                        break;
                }
            }
            
            if (touchState.touchCount === 2 && currentInteractionMode === INTERACTION_MODES.SCALE) {
                const currentTouches = Array.from(event.touches);
                handleModelScaling(currentTouches);
            }
        };

        const handleModelMovement = (currentTouch) => {
            const deltaX = (currentTouch.pageX - touchState.dragStartPosition.x) * 0.01;
            const deltaY = (currentTouch.pageY - touchState.dragStartPosition.y) * -0.01;
            
            touchState.selectedModel.position.set(
                touchState.initialPosition.x + deltaX,
                touchState.initialPosition.y + deltaY,
                touchState.initialPosition.z
            );
        };

        const handleModelRotation = (currentTouch) => {
            const rotationSpeed = 0.01;
            const rotationDelta = 
                (currentTouch.pageX - touchState.dragStartPosition.x) * rotationSpeed;
            
            touchState.selectedModel.rotation.z = touchState.initialRotation + rotationDelta;
        };

        const handleModelScaling = (currentTouches) => {
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
        };

        const handleTouchEnd = (event) => {
            event.preventDefault();
            touchState.touchCount = event.touches.length;

            if (touchState.touchCount === 0) {
                touchState.selectedModel = null;
            }
        };

        renderer.domElement.addEventListener('touchstart', handleTouchStart, false);
        renderer.domElement.addEventListener('touchmove', handleTouchMove, false);
        renderer.domElement.addEventListener('touchend', handleTouchEnd, false);

        const loadARModel = async (modelCategory) => {
            if (loadedModels.has(modelCategory)) {
                return loadedModels.get(modelCategory);
            }

            const modelData = itemCategories[modelCategory];
            const loadedModelsPromises = modelData.map(async (modelInfo) => {
                const model = await loadGLTF(modelInfo.name);
                normalizeModel(model, modelInfo.height);
                return model;
            });

            const models = await Promise.all(loadedModelsPromises);
            models.forEach(model => {
                placedItems.push(model);
                scene.add(model);
            });

            loadedModels.set(modelCategory, models);
            return models;
        };

        placeButton.addEventListener("click", () => {
            if (touchState.selectedModel) {
                setOpacity(touchState.selectedModel, 1);
            }
        });

        cancelButton.addEventListener("click", () => {
            if (touchState.selectedModel) {
                scene.remove(touchState.selectedModel);
                touchState.selectedModel = null;
            }
        });

        function animate() {
            renderer.setAnimationLoop(() => {
                renderer.render(scene, camera);
            });
        }

        animate();
    };

    initialize();
});
