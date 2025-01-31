import { loadGLTF } from "../libs/loader.js";
import * as THREE from "../libs/three123/three.module.js";
import { ARButton } from "../libs/jsm/ARButton.js";

// Constants and Enums
const InteractionMode = {
    NONE: 'none',
    ROTATE: 'rotate',
    DRAG: 'drag',
    SCALE: 'scale'
};

const itemCategories = {
    table: [
        { name: "table1", height: 0.3 },
        { name: "table2", height: 0.35 },
        { name: "table3", height: 0.28 }
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

// Utility Functions
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

class ARFurnitureApp {
    constructor() {
        this.initialize();
    }

    async initialize() {
        // Scene Setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;

        document.body.appendChild(this.renderer.domElement);

        // Lighting
        this.setupLighting();

        // AR Setup
        this.setupAR();

        // Initialize Variables
        this.currentMode = InteractionMode.NONE;
        this.loadedModels = new Map();
        this.placedItems = [];
        this.previewItem = null;
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        this.selectedObject = null;
        this.previousTouchX = 0;
        this.previousTouchY = 0;
        this.previousPinchDistance = 0;

        // Setup Components
        this.setupRaycaster();
        this.setupReticle();
        this.setupEventListeners();
        await this.loadModelsAndSetupThumbnails();

        // Start Render Loop
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    setupLighting() {
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.scene.add(light);
        this.scene.add(directionalLight);
    }

    setupAR() {
        const arButton = ARButton.createButton(this.renderer, {
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: document.body }
        });
        document.body.appendChild(arButton);

        this.controller = this.renderer.xr.getController(0);
        this.scene.add(this.controller);
    }

    setupRaycaster() {
        this.raycaster = new THREE.Raycaster();
        this.touches = new THREE.Vector2();
    }

    setupReticle() {
        this.reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        this.reticle.visible = false;
        this.reticle.matrixAutoUpdate = false;
        this.scene.add(this.reticle);
    }

    setupEventListeners() {
        // Touch Events
        this.renderer.domElement.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.renderer.domElement.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.renderer.domElement.addEventListener('touchend', this.onTouchEnd.bind(this));

        // Window Resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // UI Elements
        this.setupUIElements();
    }

    setupUIElements() {
        // Initialize Mode Buttons
        const modeButtons = {
            rotate: document.getElementById('rotate-btn'),
            drag: document.getElementById('drag-btn'),
            scale: document.getElementById('scale-btn')
        };

        Object.entries(modeButtons).forEach(([mode, button]) => {
            if (button) {
                button.addEventListener('click', () => this.handleModeChange(mode));
            }
        });

        // Menu Setup
        const menuButton = document.getElementById('menu-button');
        const closeButton = document.getElementById('close-button');
        const sidebarMenu = document.getElementById('sidebar-menu');
        
        if (menuButton && closeButton && sidebarMenu) {
            this.setupMenu(menuButton, closeButton, sidebarMenu);
        }

        // Confirm Buttons
        const placeButton = document.getElementById('place');
        const cancelButton = document.getElementById('cancel');
        
        if (placeButton) {
            placeButton.addEventListener('click', () => this.placeModel());
        }
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.cancelModel());
        }
    }

    setupMenu(menuButton, closeButton, sidebarMenu) {
        menuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebarMenu.classList.add('open');
            menuButton.style.display = 'none';
            closeButton.style.display = 'block';
        });

        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebarMenu.classList.remove('open');
            closeButton.style.display = 'none';
            menuButton.style.display = 'block';
        });

        document.addEventListener('click', (e) => {
            if (!sidebarMenu.contains(e.target) && !menuButton.contains(e.target)) {
                sidebarMenu.classList.remove('open');
                closeButton.style.display = 'none';
                menuButton.style.display = 'block';
            }
        });
    }

    async loadModelsAndSetupThumbnails() {
        for (const [category, items] of Object.entries(itemCategories)) {
            for (const item of items) {
                try {
                    const model = await loadGLTF(`../assets/models/${category}/${item.name}/scene.gltf`);
                    normalizeModel(model.scene, item.height);

                    const modelGroup = new THREE.Group();
                    modelGroup.add(model.scene);
                    
                    this.loadedModels.set(`${category}-${item.name}`, modelGroup);

                    const thumbnail = document.querySelector(`#${category}-${item.name}`);
                    if (thumbnail) {
                        thumbnail.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.showModel(`${category}-${item.name}`);
                        });
                    }
                } catch (error) {
                    console.error(`Error loading model ${category}/${item.name}:`, error);
                }
            }
        }
    }

    showModel(modelId) {
        const model = this.loadedModels.get(modelId);
        if (!model) return;

        if (this.previewItem) {
            this.scene.remove(this.previewItem);
        }

        this.previewItem = deepClone(model);
        this.scene.add(this.previewItem);
        setOpacity(this.previewItem, 0.5);
        
        const confirmButtons = document.getElementById('confirm-buttons');
        if (confirmButtons) {
            confirmButtons.style.display = 'flex';
        }
    }

    placeModel() {
        if (this.previewItem && this.reticle.visible) {
            const clone = deepClone(this.previewItem);
            setOpacity(clone, 1.0);
            
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            this.reticle.matrix.decompose(position, rotation, scale);
            
            clone.position.copy(position);
            clone.quaternion.copy(rotation);
            
            this.scene.add(clone);
            this.placedItems.push(clone);
            this.cancelModel();
        }
    }

    cancelModel() {
        const confirmButtons = document.getElementById('confirm-buttons');
        if (confirmButtons) {
            confirmButtons.style.display = 'none';
        }
        
        if (this.previewItem) {
            this.scene.remove(this.previewItem);
            this.previewItem = null;
        }
    }

    handleModeChange(mode) {
        this.currentMode = this.currentMode === mode ? InteractionMode.NONE : mode;
        
        document.querySelectorAll('.mode-button').forEach(btn => {
            btn.style.backgroundColor = '#ffffff';
            btn.classList.remove('active');
        });
        
        if (this.currentMode !== InteractionMode.NONE) {
            const activeButton = document.getElementById(`${mode}-btn`);
            if (activeButton) {
                activeButton.style.backgroundColor = '#a0a0a0';
                activeButton.classList.add('active');
            }
        }
    }

    getTouchDistance(touch1, touch2) {
        const dx = touch1.pageX - touch2.pageX;
        const dy = touch1.pageY - touch2.pageY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    onTouchStart(event) {
        event.preventDefault();
        
        this.touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
        this.touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.touches, this.camera);
        const intersects = this.raycaster.intersectObjects(this.placedItems, true);
        
        if (intersects.length > 0) {
            this.selectedObject = intersects[0].object.parent;
            this.previousTouchX = event.touches[0].pageX;
            this.previousTouchY = event.touches[0].pageY;
            
            if (event.touches.length === 2) {
                this.previousPinchDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
            }
        }
    }

    onTouchMove(event) {
        event.preventDefault();
        
        if (!this.selectedObject) return;

        switch (this.currentMode) {
            case InteractionMode.ROTATE:
                if (event.touches.length === 1) {
                    const deltaX = event.touches[0].pageX - this.previousTouchX;
                    this.selectedObject.rotation.y += deltaX * 0.01;
                    this.previousTouchX = event.touches[0].pageX;
                }
                break;

            case InteractionMode.DRAG:
                if (event.touches.length === 1) {
                    const deltaX = (event.touches[0].pageX - this.previousTouchX) * 0.01;
                    const deltaY = (event.touches[0].pageY - this.previousTouchY) * 0.01;
                    
                    this.selectedObject.position.x += deltaX;
                    this.selectedObject.position.z += deltaY;
                    
                    this.previousTouchX = event.touches[0].pageX;
                    this.previousTouchY = event.touches[0].pageY;
                }
                break;

            case InteractionMode.SCALE:
                if (event.touches.length === 2) {
                    const currentPinchDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
                    const scaleFactor = currentPinchDistance / this.previousPinchDistance;
                    
                    if (scaleFactor !== 1) {
                        const newScale = this.selectedObject.scale.x * scaleFactor;
                        if (newScale >= 0.5 && newScale <= 2) {
                            this.selectedObject.scale.multiplyScalar(scaleFactor);
                        }
                    }
                    
                    this.previousPinchDistance = currentPinchDistance;
                }
                break;
        }
    }

    onTouchEnd() {
        this.selectedObject = null;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render(timestamp, frame) {
        if (frame) {
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const session = this.renderer.xr.getSession();

            if (!this.hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then((referenceSpace) => {
                    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                        this.hitTestSource = source;
                    });
                });
                this.hitTestSourceRequested = true;
            }

            if (this.hitTestSource) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);
                if (hitTestResults.length > 0) {
                    const hit = hitTestResults[0];
                    this.reticle.visible = true;
                    this.reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

                    if (this.previewItem) {
                        const position = new THREE.Vector3();
                        const rotation = new THREE.Quaternion();
                        const scale = new THREE.Vector3();
                        this.reticle.matrix.decompose(position, rotation, scale);
                            
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
            camera.updateProjection();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    };

    initialize().catch(console.error);
});
