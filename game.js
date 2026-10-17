const Game = {
    isRunning: false, isDead: false, isDroneMode: false, isMultiplayer: false,
    scene: null, camera: null, renderer: null, clock: new THREE.Clock(),
    drones: [], bots: [], projectiles: [], buildings: [],
    playerPos: new THREE.Vector3(0, 2, 0), velocityY: 0, isGrounded: true,
    keys: { w: false, a: false, s: false, d: false, e: false },
    mouse: { x: 0, y: 0 }, joystickLeft: { x: 0, y: 0 },
    isTargeting: false, targetDrone: null,
    textures: {},
    rpgMesh: null, bunkerDoor: null, isBunkerOpen: false,

    init: function() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 300);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 3, 0);
        this.camera.rotation.order = 'YXZ';

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        this.loadTextures();
        this.setupAudio();
        this.setupEvents();
        this.animate();
    },

    loadTextures: function() {
        const loader = new THREE.TextureLoader();
        this.textures.ground = loader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
        this.textures.building = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
        
        this.textures.ground.wrapS = this.textures.ground.wrapT = THREE.RepeatWrapping;
        this.textures.ground.repeat.set(50, 50);
        this.textures.building.wrapS = this.textures.building.wrapT = THREE.RepeatWrapping;
        this.textures.building.repeat.set(2, 4);
    },

    generateCity: function() {
        if (this.cityGroup) this.scene.remove(this.cityGroup);
        this.cityGroup = new THREE.Group();
        this.scene.add(this.cityGroup);
        this.buildings = [];

        // Земля
        const groundGeo = new THREE.PlaneGeometry(1000, 1000);
        const groundMat = new THREE.MeshStandardMaterial({ map: this.textures.ground });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.cityGroup.add(ground);

        // Дома
        for (let i = 0; i < 30; i++) {
            const w = 10 + Math.random() * 20;
            const h = 20 + Math.random() * 40;
            const d = 10 + Math.random() * 20;
            const geo = new THREE.BoxGeometry(w, h, d);
            const mat = new THREE.MeshStandardMaterial({ map: this.textures.building });
            const building = new THREE.Mesh(geo, mat);
            
            let x = (Math.random() - 0.5) * 300;
            let z = (Math.random() - 0.5) * 300;
            if (Math.sqrt(x*x + z*z) < 20) { x += 50; z += 50; } 
            
            building.position.set(x, h / 2, z);
            building.castShadow = true;
            building.receiveShadow = true;
            this.cityGroup.add(building);
            this.buildings.push(building);
        }
    },

    spawnPlayer: function() {
        this.playerPos.set(0, 2, 0);
        this.camera.position.copy(this.playerPos);
        this.velocityY = 0;
        this.isGrounded = true;
        
        if (!this.rpgMesh) {
            const rpgGeo = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
            const rpgMat = new THREE.MeshStandardMaterial({ color: 0x556b2f });
            this.rpgMesh = new THREE.Mesh(rpgGeo, rpgMat);
            this.rpgMesh.position.set(0.5, -0.5, -1.5);
            this.rpgMesh.rotation.x = Math.PI / 2;
            this.camera.add(this.rpgMesh);
            this.scene.add(this.camera);
        }
    },

    startAsDrone: function() {
        this.isDroneMode = true;
        document.getElementById('drone-select-menu').style.display = 'none';
        document.getElementById('drone-hud').style.display = 'block';
        document.getElementById('weapon-info').style.display = 'none';
        document.getElementById('btn-open-drone-menu').style.display = 'none';
        
        if (this.rpgMesh) this.rpgMesh.visible = false;
        if (document.pointerLockElement !== document.body) document.body.requestPointerLock();

        this.playerPos.set(0, 40, 0);
        this.camera.position.copy(this.playerPos);
        this.playDroneSound();
    },

    closeDroneMenu: function() {
        document.getElementById('drone-select-menu').style.display = 'none';
        if (this.isRunning) document.body.requestPointerLock();
    },

    openInGameDroneMenu: function() {
        document.exitPointerLock();
        document.getElementById('drone-select-menu').style.display = 'flex';
    },

    // --- СПАВН БОТОВ ---
    spawnBotDrone: function() {
        const group = new THREE.Group();
        const geo = new THREE.ConeGeometry(1.5, 5, 8);
        geo.rotateX(Math.PI / 2);
        const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x000000 })); // Черный
        const wings = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0xff8800 })); // Оранжевые
        group.add(body); group.add(wings);
        
        // Прямо перед игроком в небе
        group.position.set(this.playerPos.x + (Math.random() - 0.5) * 10, 15, this.playerPos.z - 20);
        group.userData = { speed: 0.15 };
        
        this.scene.add(group);
        this.drones.push(group);
        this.playDroneSound();
    },

    spawnBotHuman: function() {
        const geo = new THREE.CapsuleGeometry(1, 2, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Красный, чтобы не сливаться с травой
        const bot = new THREE.Mesh(geo, mat);
        
        // Прямо перед игроком
        bot.position.set(this.playerPos.x + (Math.random() - 0.5) * 5, 2, this.playerPos.z - 5);
        bot.castShadow = true;
        bot.userData = { isDead: false, moveDirection: Math.random() * Math.PI * 2 };
        
        this.scene.add(bot);
        this.bots.push(bot);
    },

    setupAudio: function() {
        try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    },
    playDroneSound: function() {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
        osc.connect(gain); gain.connect(this.audioCtx.destination);
        osc.start(); osc.stop(this.audioCtx.currentTime + 1.5);
    },
    playExplosionSound: function() {
        if (!this.audioCtx) return;
        const bufferSize = this.audioCtx.sampleRate * 1;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 1);
        noise.connect(gain); gain.connect(this.audioCtx.destination);
        noise.start();
    },

    createExplosion: function(pos) {
        this.playExplosionSound();
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(30 * 3);
        for(let i=0; i<30; i++) { pPos[i*3]=pos.x; pPos[i*3+1]=pos.y; pPos[i*3+2]=pos.z; }
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xff4400, size: 2 }));
        this.scene.add(particles);
        setTimeout(() => this.scene.remove(particles), 500);
    },

    shoot: function() {
        if (this.isDroneMode || !this.isTargeting || !this.targetDrone) return;
        
        const rocketGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const rocketMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const rocket = new THREE.Mesh(rocketGeo, rocketMat);
        rocket.position.copy(this.camera.position);
        rocket.position.y -= 0.5;
        
        const dir = this.targetDrone.position.clone().sub(this.camera.position).normalize();
        rocket.lookAt(this.targetDrone.position);
        rocket.rotateX(Math.PI / 2);
        
        this.scene.add(rocket);
        this.projectiles.push({ mesh: rocket, dir: dir, target: this.targetDrone });
        
        this.isTargeting = false;
        document.getElementById('crosshair').classList.remove('targeting');
    },

    jump: function() {
        if (this.isGrounded && !this.isDroneMode) {
            this.velocityY = 10;
            this.isGrounded = false;
        }
    },

    die: function() {
        this.isDead = true;
        document.getElementById('game-ui').style.display = 'none';
        document.getElementById('death-screen').style.display = 'flex';
        document.exitPointerLock();
    },

    // --- РАДАР ---
    drawRadar: function() {
        const canvas = document.getElementById('radar');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const range = 30;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Игрок
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Боты (Красные)
        this.bots.forEach(bot => {
            if (bot.userData.isDead) return;
            const dx = (bot.position.x - this.playerPos.x) / range * cx;
            const dz = (bot.position.z - this.playerPos.z) / range * cy;
            if (Math.abs(dx) < cx && Math.abs(dz) < cy) {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(cx + dx, cy + dz, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Дроны (Оранжевые)
        this.drones.forEach(drone => {
            const dx = (drone.position.x - this.playerPos.x) / range * cx;
            const dz = (drone.position.z - this.playerPos.z) / range * cy;
            if (Math.abs(dx) < cx && Math.abs(dz) < cy) {
                ctx.fillStyle = '#ff8800';
                ctx.beginPath();
                ctx.arc(cx + dx, cy + dz, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    },

    animate: function() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();

        if (this.isRunning && !this.isDead) {
            this.drawRadar();

            const speed = this.isDroneMode ? 40 * delta : 15 * delta;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            if (!this.isDroneMode) forward.y = 0; 
            forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            right.y = 0; right.normalize();

            if (this.keys.w || this.joystickLeft.y > 0.2) this.playerPos.add(forward.clone().multiplyScalar(speed));
            if (this.keys.s || this.joystickLeft.y < -0.2) this.playerPos.sub(forward.clone().multiplyScalar(speed));
            if (this.keys.a || this.joystickLeft.x < -0.2) this.playerPos.sub(right.clone().multiplyScalar(speed));
            if (this.keys.d || this.joystickLeft.x > 0.2) this.playerPos.add(right.clone().multiplyScalar(speed));

            if (!this.isDroneMode) {
                this.velocityY -= 9.8 * delta * 2;
                this.playerPos.y += this.velocityY * delta;
                if (this.playerPos.y <= 2) {
                    this.playerPos.y = 2;
                    this.velocityY = 0;
                    this.isGrounded = true;
                }
            } else {
                if (this.playerPos.y < 2) {
                    this.createExplosion(this.playerPos);
                    this.die();
                }
            }

            this.camera.position.copy(this.playerPos);
            if (!this.isDroneMode) this.camera.position.y = this.playerPos.y + 1;

            this.camera.rotation.y -= this.mouse.x * 0.002;
            this.camera.rotation.x -= this.mouse.y * 0.002;
            this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
            this.mouse.x = 0; this.mouse.y = 0;

            // Ракеты
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.mesh.position.add(p.dir.clone().multiplyScalar(0.8));
                if (p.target && p.mesh.position.distanceTo(p.target.position) < 3) {
                    this.createExplosion(p.target.position);
                    this.scene.remove(p.target);
                    this.drones = this.drones.filter(d => d !== p.target);
                    this.scene.remove(p.mesh);
                    this.projectiles.splice(i, 1);
                    continue;
                }
                if (p.mesh.position.length() > 500) {
                    this.scene.remove(p.mesh);
                    this.projectiles.splice(i, 1);
                }
            }

            // Боты
            for (let i = 0; i < this.bots.length; i++) {
                const bot = this.bots[i];
                if (bot.userData.isDead) continue;
                bot.position.x += Math.cos(bot.userData.moveDirection) * 2 * delta;
                bot.position.z += Math.sin(bot.userData.moveDirection) * 2 * delta;
            }

            // Дроны
            for (let i = this.drones.length - 1; i >= 0; i--) {
                const drone = this.drones[i];
                let targetPos = this.camera.position;
                if (this.bots.length > 0 && Math.random() < 0.3) {
                    targetPos = this.bots[0].position; 
                }

                const dir = new THREE.Vector3().subVectors(targetPos, drone.position).normalize();
                drone.position.add(dir.multiplyScalar(drone.userData.speed)); 
                drone.lookAt(targetPos);

                if (drone.position.distanceTo(targetPos) < 3) {
                    this.createExplosion(drone.position);
                    this.scene.remove(drone);
                    this.drones.splice(i, 1);
                    if (targetPos === this.camera.position && !this.isDead) {
                        this.die();
                    }
                }
            }

            if (!this.isDroneMode) this.checkTargeting();
        }

        this.renderer.render(this.scene, this.camera);
    },

    checkTargeting: function() {
        if (this.drones.length === 0) {
            document.getElementById('crosshair').classList.remove('targeting');
            return;
        }
        let closest = null; let minDist = 100;

        this.drones.forEach(drone => {
            const vector = drone.position.clone().project(this.camera);
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
            const dist = Math.sqrt(Math.pow(x - window.innerWidth/2, 2) + Math.pow(y - window.innerHeight/2, 2));
            if (dist < minDist) { minDist = dist; closest = drone; }
        });

        const ch = document.getElementById('crosshair');
        if (closest) {
            this.isTargeting = true;
            this.targetDrone = closest;
            ch.classList.add('targeting');
        } else {
            this.isTargeting = false;
            this.targetDrone = null;
            ch.classList.remove('targeting');
        }
    },

    setupEvents: function() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        document.addEventListener('keydown', (e) => { 
            if (e.key.toLowerCase() in this.keys) this.keys[e.key.toLowerCase()] = true; 
            if (e.key.toLowerCase() === 'e' && this.isRunning) this.openInGameDroneMenu();
            if (e.code === 'Space' && this.isRunning) this.jump();
        });
        document.addEventListener('keyup', (e) => { if (e.key.toLowerCase() in this.keys) this.keys[e.key.toLowerCase()] = false; });

        document.getElementById('click-to-play').addEventListener('click', () => {
            document.getElementById('click-to-play').style.display = 'none';
            document.body.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== document.body && this.isRunning && !this.isDroneMode && document.getElementById('drone-select-menu').style.display === 'none') {
                document.getElementById('click-to-play').style.display = 'flex';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body) {
                this.mouse.x = e.movementX || 0;
                this.mouse.y = e.movementY || 0;
            }
        });

        document.addEventListener('mousedown', (e) => { 
            if (this.isRunning && document.pointerLockElement === document.body && e.button === 0) this.shoot(); 
        });

        if ('ontouchstart' in window) {
            document.getElementById('joystick-zone-left').style.display = 'block';
            document.getElementById('btn-jump').style.display = 'block';
            const leftZone = document.getElementById('joystick-zone-left');
            const leftKnob = leftZone.querySelector('.joystick-knob');
            leftZone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const rect = leftZone.getBoundingClientRect();
                const x = touch.clientX - rect.left - 60;
                const y = touch.clientY - rect.top - 60;
                leftKnob.style.transform = `translate(${x}px, ${y}px)`;
                this.joystickLeft.x = x / 60;
                this.joystickLeft.y = -y / 60;
            });
            leftZone.addEventListener('touchend', () => {
                leftKnob.style.transform = 'translate(-50%, -50%)';
                this.joystickLeft.x = 0; this.joystickLeft.y = 0;
            });
        }
    },

    showDroneMenu: function() {
        document.getElementById('drone-select-menu').style.display = 'flex';
    },

    start: function(mode) {
        this.isMultiplayer = (mode === 'multi');
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('click-to-play').style.display = 'flex';
        document.getElementById('btn-open-drone-menu').style.display = this.isMultiplayer ? 'block' : 'none';
        
        if (!this.scene) this.init();
        this.generateCity();
        this.spawnPlayer();
        
        this.drones.forEach(d => this.scene.remove(d));
        this.bots.forEach(b => this.scene.remove(b));
        this.projectiles.forEach(p => this.scene.remove(p.mesh));
        this.drones = []; this.bots = []; this.projectiles = [];

        this.isRunning = true;
        this.isDead = false;
        this.isDroneMode = false;
        this.playerPos.set(0, 2, 0);
        this.camera.position.copy(this.playerPos);
        this.camera.rotation.set(0, 0, 0);
        if (this.rpgMesh) this.rpgMesh.visible = true;

        for (let i = 0; i < 5; i++) {
            this.spawnBotHuman();
        }
        
        setTimeout(() => { 
            if(this.isRunning && !this.isDroneMode) {
                this.spawnBotDrone(); 
                this.spawnBotDrone();
            }
        }, 2000);
    },

    respawn: function() {
        document.getElementById('death-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
        this.isRunning = false;
        this.isDead = false;
        this.isDroneMode = false;
        this.drones.forEach(d => this.scene.remove(d));
        this.bots.forEach(b => this.scene.remove(b));
        this.projectiles.forEach(p => this.scene.remove(p.mesh));
        this.drones = []; this.bots = []; this.projectiles = [];
        if (this.scene) {
            while(this.scene.children.length > 0){ this.scene.remove(this.scene.children[0]); }
            this.scene = null;
        }
    }
};

window.onload = () => {
    console.log("Игра загружена. Ожидание.");
};