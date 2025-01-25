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
    table: [
        { name: "table1", height: 0.2 },
        { name: "table2", height: 0.25 },
        { name: "table3", height: 0.22 }
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

        const raycaster = new THREE.Raycaster();
        const touches = new THREE.Vector2();
        let selectedObject = null;
        let interactionMode = null;
        let isDragging = false;
        let isRotating = false;
        let isScaling = false;
        let initialPinchDistance = 0;
        let initialScale = 1;
        let previousTouchX = 0;
        let previousTouchY = 0;

        const controller = renderer.xr.getController(0);
        scene.add(controller);

        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.visible = false;
        reticle.matrixAutoUpdate = false;
        scene.add(reticle);

        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");

        const rotateButton = document.getElementById("rotate-mode");
        const moveButton = document.getElementById("move-mode");
        const scaleButton = document.getElementById("scale-mode");
        const interactionButtons = [moveButton, rotateButton, scaleButton];

        const loadedModels = new Map();
        const placedItems = [];
        let previewItem = null;
        let hitTestSource = null;
        let hitTestSourceRequested = false;

        const resetInteractionButtons = () => {
            interactionButtons.forEach(button => {
                button.classList.remove('active');
            });
            interactionMode = null;
            selectedObject = null;
            isDragging = false;
            isRotating = false;
            isScaling = false;
        };

        rotateButton.addEventListener('click', () => {
            resetInteractionButtons();
            rotateButton.classList.add('active');
            interactionMode = 'rotate';
        });

        moveButton.addEventListener('click', () => {
            resetInteractionButtons();
            moveButton.classList.add('active');
            interactionMode = 'drag';
        });

        scaleButton.addEventListener('click', () => {
            resetInteractionButtons();
            scaleButton.classList.add('active');
            interactionMode = 'scale';
        });

        const onTouchStart = (event) => {
            event.preventDefault();
            
            if (event.touches.length === 1 && selectedObject) {
                touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
                
                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedItems, true);
                
                if (intersects.length > 0) {
                    switch (interactionMode) {
                        case 'rotate':
                            isRotating = true;
                            previousTouchX = event.touches[0].pageX;
                            break;
                        case 'drag':
                            isDragging = true;
                            previousTouchX = event.touches[0].pageX;
                            previousTouchY = event.touches[0].pageY;
                            break;
                    }
                }
            } else if (event.touches.length === 2 && selectedObject && interactionMode === 'scale') {
                const dx = event.touches[0].pageX - event.touches[1].pageX;
                const dy = event.touches[0].pageY - event.touches[1].pageY;
                initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                isScaling = true;
                initialScale = selectedObject.scale.x;
            }
        };

        const onTouchMove = (event) => {
            event.preventDefault();
            
            if (isRotating && event.touches.length === 1) {
                const deltaX = event.touches[0].pageX - previousTouchX;
                selectedObject.rotation.y += deltaX * 0.01;
                previousTouchX = event.touches[0].pageX;
            } else if (isDragging && event.touches.length === 1) {
                const deltaX = (event.touches[0].pageX - previousTouchX) * 0.01;
                const deltaY = (event.touches[0].pageY - previousTouchY) * 0.01;
                
                selectedObject.position.x += deltaX;
                selectedObject.position.z += deltaY;
                
                previousTouchX = event.touches[0].pageX;
                previousTouchY = event.touches[0].pageY;
            } else if (isScaling && event.touches.length === 2) {
                const dx = event.touches[0].pageX - event.touches[1].pageX;
                const dy = event.touches[0].pageY - event.touches[1].pageY;
                const pinchDistance = Math.sqrt(dx * dx + dy * dy);
                const scale = (pinchDistance / initialPinchDistance) * initialScale;
                selectedObject.scale.set(scale, scale, scale);
            }
        };

        const onTouchEnd = (event) => {
            if (event.touches.length === 0) {
                isRotating = false;
                isDragging = false;
                isScaling = false;
            }
        };

        renderer.domElement.addEventListener('touchstart', onTouchStart, false);
        renderer.domElement.addEventListener('touchmove', onTouchMove, false);
        renderer.domElement.addEventListener('touchend', onTouchEnd, false);

        document.addEventListener("click", (event) => {
            const isClickInsideMenu = sidebarMenu?.contains(event.target);
            const isClickOnMenuButton = menuButton?.contains(event.target);
            const isMenuOpen = sidebarMenu?.classList.contains("open");
            
            if (!isClickInsideMenu && !isClickOnMenuButton && isMenuOpen) {
                sidebarMenu.classList.remove("open");
                closeButton.style.display = "none";
                menuButton.style.display = "block";
            }

            // Select object for interaction
            if (placedItems.length > 0) {
                touches.x = (event.pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.pageY / window.innerHeight) * 2 + 1;
                
                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedItems, true);
                
                if (intersects.length > 0) {
                    selectedObject = intersects[0].object.parent;
                    resetInteractionButtons();
                }
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
        });

        const icons = document.querySelectorAll(".icon");
        icons.forEach((icon) => {
            icon.addEventListener("click", (event) => {
                event.stopPropagation();
                const clickedSubmenu = icon.querySelector(".submenu");
                
                // Prevent submenu from closing when clicking on inner item
                if (event.target.closest('.submenu-item')) {
                    return;
                }
                
                // Toggle clicked submenu, close others
                document.querySelectorAll('.submenu').forEach(submenu => {
                    if (submenu !== clickedSubmenu) {
                        submenu.classList.remove('open');
                    }
                });
                
                // If not clicking a submenu item, toggle the submenu
                if (!event.target.closest('.submenu-item')) {
                    clickedSubmenu.classList.toggle("open");
                }
            });
        });

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
