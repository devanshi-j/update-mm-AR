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

// Item categories
const itemCategories = {
    lamp: [{ name: "lamp1", height: 0.3 }],
    sofa: [{ name: "sofa1", height: 0.1 }],
    table: [{ name: "table1", height: 0.2 }],
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

        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        scene.add(light);

        const arButton = ARButton.createButton(renderer, {
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: document.body },
        });
        document.body.appendChild(renderer.domElement);
        document.body.appendChild(arButton);

        // UI Elements
        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");

        if (!placeButton || !cancelButton) {
            console.error("Place or Cancel buttons not found in DOM");
            return;
        }

        // UI Event Listeners
        menuButton.addEventListener("click", () => {
            console.log("Menu button clicked");
            sidebarMenu.classList.add("open");
            menuButton.style.display = "none";
            closeButton.style.display = "block";
        });

        closeButton.addEventListener("click", () => {
            console.log("Close button clicked");
            sidebarMenu.classList.remove("open");
            closeButton.style.display = "none";
            menuButton.style.display = "block";
        });

        const icons = document.querySelectorAll(".icon");
        icons.forEach((icon) => {
            icon.addEventListener("click", (event) => {
                const submenu = icon.querySelector(".submenu");
                submenu.classList.toggle("open");
                event.stopPropagation();
            });
        });

        // Model Management
        const placedItems = [];
        let previewItem = null;
        let selectedItem = null;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const showModel = (item) => {
            console.log("Showing model preview");
            previewItem = item;
            previewItem.visible = true;
            setOpacity(previewItem, 0.5);
            confirmButtons.style.display = "flex";
            console.log("Preview model displayed");
        };

        const placeModel = () => {
            console.log("Place button clicked");
            if (previewItem) {
                console.log("Preview item exists, placing model");
                const clone = deepClone(previewItem);
                setOpacity(clone, 1.0);
                clone.position.copy(previewItem.position);
                clone.rotation.copy(previewItem.rotation);
                clone.scale.copy(previewItem.scale);
                scene.add(clone);
                placedItems.push(clone);
                console.log("Model placed successfully");
                cancelModel();
            } else {
                console.log("No preview item available");
            }
        };

        const cancelModel = () => {
            console.log("Cancel button clicked");
            confirmButtons.style.display = "none";
            if (previewItem) {
                console.log("Hiding preview item");
                previewItem.visible = false;
                previewItem = null;
            } else {
                console.log("No preview item to cancel");
            }
        };

        // Model Selection & Interaction
        const selectModel = (model) => {
            // Deselect previous model
            if (selectedItem && selectedItem !== model) {
                setOpacity(selectedItem, 1.0);
            }
            selectedItem = model;
            setOpacity(selectedItem, 0.8); // Highlight selected model
        };

        const checkIntersection = (event) => {
            // Calculate mouse position in normalized device coordinates
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(placedItems, true);

            if (intersects.length > 0) {
                // Find the top-level parent that's in placedItems
                let targetObject = intersects[0].object;
                while (targetObject.parent && !placedItems.includes(targetObject)) {
                    targetObject = targetObject.parent;
                }
                if (placedItems.includes(targetObject)) {
                    selectModel(targetObject);
                    return true;
                }
            }
            return false;
        };

        // Load and setup models
        for (const category in itemCategories) {
            for (const itemInfo of itemCategories[category]) {
                const model = await loadGLTF(`../assets/models/${category}/${itemInfo.name}/scene.gltf`);
                normalizeModel(model.scene, itemInfo.height);

                const item = new THREE.Group();
                item.add(model.scene);
                item.visible = false;
                scene.add(item);

                const thumbnail = document.querySelector(`#${category}-${itemInfo.name}`);
                if (thumbnail) {
                    thumbnail.addEventListener("click", (e) => {
                        console.log(`Thumbnail clicked: ${category}-${itemInfo.name}`);
                        e.preventDefault();
                        e.stopPropagation();
                        showModel(item);
                    });
                } else {
                    console.error(`Thumbnail not found: ${category}-${itemInfo.name}`);
                }
            }
        }

        // Add button event listeners
        placeButton.addEventListener("click", placeModel);
        cancelButton.addEventListener("click", cancelModel);

        // Touch Interaction Variables
        let initialTouchPositions = [];
        let initialDistance = 0;
        let initialScale = new THREE.Vector3();
        let lastTouchPosition = new THREE.Vector2();
        let initialRotation = 0;

        const getDistance = (touch1, touch2) => {
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        // Touch Event Handlers
        const onTouchStart = (event) => {
            if (event.touches.length === 1) {
                // Single touch - try to select a model
                const touch = event.touches[0];
                const didSelect = checkIntersection({
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });

                if (didSelect) {
                    lastTouchPosition.set(touch.clientX, touch.clientY);
                    initialRotation = selectedItem.rotation.y;
                }
            } 
            
            initialTouchPositions = Array.from(event.touches);
            if (event.touches.length === 2 && selectedItem) {
                initialDistance = getDistance(event.touches[0], event.touches[1]);
                initialScale.copy(selectedItem.scale);
            }
        };

        const onTouchMove = (event) => {
            if (event.touches.length === 1 && selectedItem) {
                const touch = event.touches[0];
                const dx = touch.clientX - lastTouchPosition.x;
                lastTouchPosition.set(touch.clientX, touch.clientY);

                const deltaRotationY = dx * 0.05;
                selectedItem.rotation.y += deltaRotationY;
            } else if (event.touches.length === 2 && selectedItem) {
                const newDistance = getDistance(event.touches[0], event.touches[1]);
                const scale = newDistance / initialDistance;

                selectedItem.scale.copy(initialScale.clone().multiplyScalar(scale * 0.3));

                const dx1 = event.touches[0].clientX - initialTouchPositions[0].clientX;
                const dy1 = event.touches[0].clientY - initialTouchPositions[0].clientY;
                const dx2 = event.touches[1].clientX - initialTouchPositions[1].clientX;
                const dy2 = event.touches[1].clientY - initialTouchPositions[1].clientY;

                const dx = (dx1 + dx2) / 2;
                const dy = (dy1 + dy2) / 2;

                selectedItem.position.x += dx * 0.0002;
                selectedItem.position.z -= dy * 0.0002;
            }
        };

        const onTouchEnd = (event) => {
            initialTouchPositions = [];
            if (event.touches.length === 0) {
                // No touches left, keep the current selection
            }
        };

        // Add event listeners
        window.addEventListener("touchstart", onTouchStart);
        window.addEventListener("touchmove", onTouchMove);
        window.addEventListener("touchend", onTouchEnd);
        window.addEventListener("click", checkIntersection);

        // Render loop
        renderer.setAnimationLoop(() => {
            renderer.render(scene, camera);
        });

        // Window resize handler
        window.addEventListener("resize", () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        });
    };

    initialize();
});
