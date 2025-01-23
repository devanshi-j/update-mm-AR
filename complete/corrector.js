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

        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");

        menuButton.addEventListener("click", () => {
            sidebarMenu.classList.add("open");
            menuButton.style.display = "none";
            closeButton.style.display = "block";
        });

        closeButton.addEventListener("click", () => {
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

        const placedItems = [];
        let selectedItem = null;

        for (const category in itemCategories) {
            for (const itemInfo of itemCategories[category]) {
                const model = await loadGLTF(`../assets/models/${category}/${itemInfo.name}/scene.gltf`);
                normalizeModel(model.scene, itemInfo.height);

                const item = new THREE.Group();
                item.add(model.scene);
                item.visible = false;
                setOpacity(item, 0.5);
                scene.add(item);

                const thumbnail = document.querySelector(`#${category}-${itemInfo.name}`);
                if (thumbnail) {
                    thumbnail.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showModel(item);
                    });
                }
            }
        }

        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");

        const showModel = (item) => {
            selectedItem = item;
            selectedItem.visible = true;
            setOpacity(selectedItem, 0.5);
            placeButton.style.display = "block";
            cancelButton.style.display = "block";
        };

        const placeModel = () => {
            if (selectedItem) {
                const clone = deepClone(selectedItem);
                setOpacity(clone, 1.0);
                scene.add(clone);
                placedItems.push(clone);
                cancelModel();
            }
        };

        const cancelModel = () => {
            placeButton.style.display = "none";
            cancelButton.style.display = "none";
            if (selectedItem) {
                selectedItem.visible = false;
                selectedItem = null;
            }
        };

        placeButton.addEventListener("click", placeModel);
        cancelButton.addEventListener("click", cancelModel);

        const raycaster = new THREE.Raycaster();
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

        const onTouchStart = (event) => {
            initialTouchPositions = Array.from(event.touches);
            if (event.touches.length === 1) {
                lastTouchPosition.set(event.touches[0].clientX, event.touches[0].clientY);
                if (selectedItem) {
                    initialRotation = selectedItem.rotation.y;
                }
            } else if (event.touches.length === 2) {
                initialDistance = getDistance(event.touches[0], event.touches[1]);
                if (selectedItem) {
                    initialScale.copy(selectedItem.scale);
                }
            }
        };

       const onTouchMove = (event) => {
    if (event.touches.length === 1 && initialTouchPositions.length === 1) {
        const touch = event.touches[0];
        const dx = touch.clientX - lastTouchPosition.x;
        lastTouchPosition.set(touch.clientX, touch.clientY);

        if (selectedItem) {
            const deltaRotationY = dx * 0.05; // Increased from 0.01 to 0.05 for faster rotation
            selectedItem.rotation.y = initialRotation + deltaRotationY;
        }
    } else if (event.touches.length === 2 && initialTouchPositions.length === 2) {
        const newDistance = getDistance(event.touches[0], event.touches[1]);
        const scale = newDistance / initialDistance;

        if (selectedItem) {
            selectedItem.scale.copy(initialScale.clone().multiplyScalar(scale * 0.5)); // Decreased scaling speed by multiplying with 0.5
        }

        const dx1 = event.touches[0].clientX - initialTouchPositions[0].clientX;
        const dy1 = event.touches[0].clientY - initialTouchPositions[0].clientY;
        const dx2 = event.touches[1].clientX - initialTouchPositions[1].clientX;
        const dy2 = event.touches[1].clientY - initialTouchPositions[1].clientY;

        const dx = (dx1 + dx2) / 2;
        const dy = (dy1 + dy2) / 2;

        if (selectedItem) {
            selectedItem.position.x += dx * 0.005; // Decreased dragging speed by reducing the factor
            selectedItem.position.z -= dy * 0.005;
        }
    }
};


        const onTouchEnd = (event) => {
            initialTouchPositions = [];
        };

        window.addEventListener("touchstart", onTouchStart);
        window.addEventListener("touchmove", onTouchMove);
        window.addEventListener("touchend", onTouchEnd);

        renderer.setAnimationLoop(() => {
            renderer.render(scene, camera);
        });

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
