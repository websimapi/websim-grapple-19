import * as THREE from 'three';
import { Explosion } from './effects.js';

export class ActionRecorder {
    constructor() {
        this.frames = [];
        this.trackData = [];
        this.isRecording = false;
        this.explosionFrame = -1;
        this.interceptorData = null;
    }

    start(trackManager) {
        this.frames = [];
        this.trackData = []; 
        this.isRecording = true;
        this.explosionFrame = -1;
        this.interceptorData = null;
    }

    recordFrame(car, interceptor, dt) {
        if (!this.isRecording) return;
        
        const data = car.getFrameData();
        
        // Append Frame Duration (for playback speed sync)
        // Index 11
        data.push(Number(dt.toFixed(5)));

        // Append Interceptor Position (for collision sync)
        if (interceptor && interceptor.mesh) {
            const p = interceptor.mesh.position;
            // Index 12: Has Interceptor Flag
            data.push(1); 
            // Index 13, 14, 15: Position
            data.push(Number(p.x.toFixed(3)));
            data.push(Number(p.y.toFixed(3)));
            data.push(Number(p.z.toFixed(3)));
        } else {
            data.push(0);
        }

        this.frames.push(data);
    }

    markExplosion() {
        if (this.isRecording) {
            this.explosionFrame = this.frames.length;
        }
    }

    recordInterceptor(pos, vel) {
        if (!this.isRecording) return;
        this.interceptorData = {
            frame: this.frames.length,
            pos: { x: pos.x, y: pos.y, z: pos.z },
            vel: { x: vel.x, y: vel.y, z: vel.z }
        };
    }

    stop(trackManager) {
        this.isRecording = false;
        // Capture total track state
        this.trackData = trackManager.segmentHistory;
        
        return {
            track: this.trackData,
            frames: this.frames,
            explosionFrame: this.explosionFrame,
            interceptorData: this.interceptorData
        };
    }
}

export class ReplaySystem {
    constructor(car, trackManager, cameraManager, scene, spaceEnvironment, audioManager) {
        this.car = car;
        this.trackManager = trackManager;
        this.cameraManager = cameraManager;
        this.scene = scene;
        this.spaceEnvironment = spaceEnvironment;
        this.audioManager = audioManager;
        
        this.data = null;
        this.isPlaying = false;
        this.currentFrameIndex = 0;
        this.accumulatedTime = 0;
        this.explosionFrame = -1;
        this.timeSinceExplosion = 0;
        this.hasExploded = false;
        this.explosions = []; // Keep track to update/cleanup
        this.interceptorData = null;
        this.interceptorSpawned = false;
        this.interceptorMesh = null;
    }

    load(jsonData) {
        this.data = jsonData;
        this.explosionFrame = typeof jsonData.explosionFrame === 'number' ? jsonData.explosionFrame : -1;
        this.interceptorData = jsonData.interceptorData || null;
        this.interceptorSpawned = false;
        this.interceptorMesh = null;
        
        if (this.spaceEnvironment) this.spaceEnvironment.reset();

        // Rebuild Track
        this.trackManager.rebuildFromHistory(this.data.track);
        this.currentFrameIndex = 0;
        this.accumulatedTime = 0;
        this.isPlaying = true;
        this.timeSinceExplosion = 0;
        this.hasExploded = false;
        this.explosions = [];

        // Initial state
        this.initializePlayback();
    }

    initializePlayback() {
        if (this.data.frames.length > 0) {
            // Setup start state
            this.applyFrame(this.data.frames[0]);
            this.cameraManager.reset(this.car.position);
            
            // Use frame 0 as the "previous" frame for the first segment
            this.prevFrameData = this.data.frames[0];
        } else {
             // Fallback
            this.prevFrameData = this.car.getFrameData(); 
            this.prevFrameData.push(0.016); // Dummy DT
        }
    }

    update(dt) {
        if (!this.isPlaying || !this.data || this.currentFrameIndex >= this.data.frames.length) {
            this.resetLoop();
            return;
        }

        this.accumulatedTime += dt;

        let framesProcessed = 0;
        const maxFramesPerTick = 10;

        // Catch up logic: Advance frames if accumulated time exceeds frame duration
        while (this.currentFrameIndex < this.data.frames.length && framesProcessed < maxFramesPerTick) {
            const frameData = this.data.frames[this.currentFrameIndex];
            const frameDuration = (frameData.length > 11) ? frameData[11] : 0.0166;

            if (this.accumulatedTime >= frameDuration) {
                this.accumulatedTime -= frameDuration;
                
                // Events (Audio, Spawn, etc)
                this.handleEvents();
                
                // Advance
                this.prevFrameData = frameData;
                this.currentFrameIndex++;
                framesProcessed++;
            } else {
                break;
            }
        }
        
        if (framesProcessed >= maxFramesPerTick) {
            this.accumulatedTime = 0; // Prevent spiral
        }

        // Render Interpolation
        if (this.currentFrameIndex < this.data.frames.length) {
            const nextFrameData = this.data.frames[this.currentFrameIndex];
            const frameDuration = (nextFrameData.length > 11) ? nextFrameData[11] : 0.0166;
            
            const alpha = frameDuration > 0.00001 ? (this.accumulatedTime / frameDuration) : 1.0;
            
            // Interpolate Car
            this.car.applyInterpolatedFrame(this.prevFrameData, nextFrameData, alpha);

            // Interpolate Interceptor (if present in target frame)
            this.applyInterceptorInterpolation(this.prevFrameData, nextFrameData, alpha);
        } else {
            // End of replay
            this.resetLoop();
            return;
        }

        this.updateContinuousEffects(dt);
    }
    
    applyInterceptorInterpolation(dataA, dataB, alpha) {
        // Interceptor data: Index 12=flag, 13,14,15 = x,y,z
        const hasB = dataB.length > 12 && dataB[12] === 1;
        
        if (hasB) {
            // Ensure mesh exists
            if (!this.interceptorMesh && this.spaceEnvironment) {
                // Maybe it just spawned or we missed the spawn frame ref
                const found = this.spaceEnvironment.asteroids.find(a => a.isInterceptor);
                if (found) this.interceptorMesh = found.mesh;
            }

            if (this.interceptorMesh) {
                const posB = new THREE.Vector3(dataB[13], dataB[14], dataB[15]);
                
                // Check if A also has it for interpolation
                const hasA = dataA.length > 12 && dataA[12] === 1;
                
                if (hasA) {
                    const posA = new THREE.Vector3(dataA[13], dataA[14], dataA[15]);
                    this.interceptorMesh.position.lerpVectors(posA, posB, alpha);
                } else {
                    // Just snap to B (just spawned)
                    this.interceptorMesh.position.copy(posB);
                }
            }
        }
    }

    resetLoop() {
        this.currentFrameIndex = 0;
        this.accumulatedTime = 0;
        this.timeSinceExplosion = 0;
        this.hasExploded = false;
        this.interceptorSpawned = false;
        this.interceptorMesh = null;
        
        while(this.explosions.length > 0) {
            const exp = this.explosions.pop();
            this.scene.remove(exp.mesh);
            this.scene.remove(exp.light);
        }
        if (this.spaceEnvironment) this.spaceEnvironment.reset();

        if (this.audioManager) this.audioManager.stopEngine();

        this.car.mesh.visible = true;

        if (this.data) {
             this.initializePlayback();
        }
    }

    handleEvents() {
        const frameData = this.data.frames[this.currentFrameIndex];
        const newStateIndex = frameData[10];
        const oldStateIndex = this.prevFrameData ? this.prevFrameData[10] : 0;
        
        if (this.audioManager) {
            // IDLE (0) -> FIRING (1)
            if (newStateIndex === 1 && oldStateIndex === 0) {
                 this.audioManager.playGrapple();
            }
            this.audioManager.playEngine();
        }

        // Interceptor Spawn
        if (this.interceptorData && !this.interceptorSpawned && this.currentFrameIndex === this.interceptorData.frame) {
            if (this.spaceEnvironment) {
                const p = this.interceptorData.pos;
                const v = this.interceptorData.vel;
                const pos = new THREE.Vector3(p.x, p.y, p.z);
                const vel = new THREE.Vector3(v.x, v.y, v.z);
                const asteroid = this.spaceEnvironment.spawnInterceptor(pos, vel, pos, vel);
                this.interceptorMesh = asteroid.mesh;
            }
            this.interceptorSpawned = true;
        }

        // Explosion Trigger
        if (this.explosionFrame !== -1 && this.currentFrameIndex === this.explosionFrame) {
            this.triggerExplosion();
        }
    }
    
    updateContinuousEffects(dt) {
        // Update active explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.update(dt);
            if (!exp.alive) {
                this.explosions.splice(i, 1);
            }
        }

        // Update Camera
        if (this.hasExploded) {
            this.timeSinceExplosion += dt;
            this.cameraManager.updateCrashZoom(
                dt, 
                this.car.position, 
                true, 
                this.timeSinceExplosion, 
                this.trackManager, 
                this.scene
            );
        } else {
            this.cameraManager.updateFollow(this.car.position, dt);
        }
    }

    applyFrame(frameData) {
        // Apply Car State
        this.car.applyFrameData(frameData);

        // Apply Interceptor Position if available (Sync correction)
        // [..., dt, hasInt, ix, iy, iz]
        if (frameData.length > 12 && frameData[12] === 1) {
            const ix = frameData[13];
            const iy = frameData[14];
            const iz = frameData[15];

            // If we don't have the mesh ref yet (maybe missed spawn frame or logic drift), try to find it
            if (!this.interceptorMesh && this.spaceEnvironment) {
                const found = this.spaceEnvironment.asteroids.find(a => a.isInterceptor);
                if (found) this.interceptorMesh = found.mesh;
            }

            if (this.interceptorMesh) {
                this.interceptorMesh.position.set(ix, iy, iz);
            }
        }
    }

    triggerExplosion() {
        this.hasExploded = true;
        this.car.hide(); // Hide car mesh
        const explosion = new Explosion(this.scene, this.car.position.clone());
        this.explosions.push(explosion);
        if (this.audioManager) this.audioManager.playSkid(true);
    }
}