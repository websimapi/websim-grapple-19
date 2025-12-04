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
        if (this.data.frames.length > 0) {
            this.applyFrame(this.data.frames[0]);
            this.cameraManager.reset(this.car.position);
        }
    }

    update(dt) {
        if (!this.isPlaying || !this.data || this.currentFrameIndex >= this.data.frames.length) {
            this.resetLoop();
            return;
        }

        this.accumulatedTime += dt;

        // Process frames to catch up to accumulated time
        let framesProcessed = 0;
        
        // Safety Break (max 10 frames per tick to prevent freeze on lag)
        while (this.currentFrameIndex < this.data.frames.length && framesProcessed < 10) {
            const frameData = this.data.frames[this.currentFrameIndex];
            
            // Backward compatibility: If no dt stored (old replays), assume 60fps
            const frameDuration = (frameData.length > 11) ? frameData[11] : 0.0166;

            if (this.accumulatedTime >= frameDuration) {
                this.accumulatedTime -= frameDuration;
                
                // EVENTS: Spawn, Audio, Explosion
                this.handleEvents(dt); // Passing dt mostly for explosion update logic if needed
                
                // APPLY STATE
                this.applyFrame(frameData);

                this.currentFrameIndex++;
                framesProcessed++;
            } else {
                // We don't have enough time accumulator to show the *next* frame yet.
                // Keep showing the current state (interpolated ideally, but stepped for now)
                
                // Force apply current frame again to ensure smooth updates if we aren't advancing
                // (Mostly to ensure Interceptor overrides are applied every frame against SpaceEnv)
                if (framesProcessed === 0) {
                     this.applyFrame(frameData);
                     // Events for continuous things (Explosions) still need updates
                     this.updateContinuousEffects(dt);
                }
                break;
            }
        }
        
        if (framesProcessed >= 10) {
            // We are lagging too much, snap to current
            this.accumulatedTime = 0;
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

        if (this.data && this.data.frames.length > 0) {
             this.applyFrame(this.data.frames[0]);
             this.cameraManager.reset(this.car.position);
        }
    }

    handleEvents(dt) {
        const frameData = this.data.frames[this.currentFrameIndex];
        const prevGrappleState = this.car.grappleState;
        
        // We peek at next state in applyFrame, but we need to check transitions.
        // Since we are iterating, 'this.car.grappleState' is currently the *previous* frame's state
        // because we haven't called applyFrame yet for this index in the loop logic above?
        // Wait, loop structure: check time -> handleEvents -> applyFrame -> increment.
        // Yes. So this.car is currently at (currentFrameIndex - 1).

        // Audio Triggers
        // We need to know what the NEW state will be to detect transition
        // frameData[10] is state index
        const newStateIndex = frameData[10];
        let newGrappleState = 'IDLE';
        if (newStateIndex === 1) newGrappleState = 'FIRING';
        
        if (this.audioManager) {
            if (newGrappleState === 'FIRING' && prevGrappleState === 'IDLE') {
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
        
        this.updateContinuousEffects(dt);
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