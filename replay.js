import * as THREE from 'three';
import { Explosion } from './effects.js';

export class ActionRecorder {
    constructor() {
        this.frames = [];
        this.trackData = [];
        this.isRecording = false;
        this.explosionFrame = -1;
    }

    start(trackManager) {
        this.frames = [];
        this.trackData = []; 
        this.isRecording = true;
        this.explosionFrame = -1;
    }

    recordFrame(car) {
        if (!this.isRecording) return;
        this.frames.push(car.getFrameData());
    }

    markExplosion() {
        if (this.isRecording) {
            this.explosionFrame = this.frames.length;
        }
    }

    stop(trackManager) {
        this.isRecording = false;
        // Capture total track state
        this.trackData = trackManager.segmentHistory;
        
        return {
            track: this.trackData,
            frames: this.frames,
            explosionFrame: this.explosionFrame
        };
    }
}

export class ReplaySystem {
    constructor(car, trackManager, cameraManager, scene) {
        this.car = car;
        this.trackManager = trackManager;
        this.cameraManager = cameraManager;
        this.scene = scene;
        
        this.data = null;
        this.isPlaying = false;
        this.currentFrameIndex = 0;
        this.explosionFrame = -1;
        this.timeSinceExplosion = 0;
        this.hasExploded = false;
        this.explosions = []; // Keep track to update/cleanup
    }

    load(jsonData) {
        this.data = jsonData;
        this.explosionFrame = typeof jsonData.explosionFrame === 'number' ? jsonData.explosionFrame : -1;
        
        // Rebuild Track
        this.trackManager.rebuildFromHistory(this.data.track);
        this.currentFrameIndex = 0;
        this.isPlaying = true;
        this.timeSinceExplosion = 0;
        this.hasExploded = false;
        this.explosions = [];

        // Initial state
        if (this.data.frames.length > 0) {
            this.car.applyFrameData(this.data.frames[0]);
            this.cameraManager.reset(this.car.position);
        }
    }

    update(dt) {
        if (!this.isPlaying || !this.data || this.currentFrameIndex >= this.data.frames.length) {
            // Loop logic
            this.currentFrameIndex = 0;
            this.timeSinceExplosion = 0;
            this.hasExploded = false;
            
            // Clean up explosions
            while(this.explosions.length > 0) {
                const exp = this.explosions.pop();
                this.scene.remove(exp.mesh);
                this.scene.remove(exp.light);
            }
            this.car.mesh.visible = true; // Show car again if it was hidden by explosion

            // Reset camera on loop
            if (this.data && this.data.frames.length > 0) {
                 this.cameraManager.reset(new THREE.Vector3(
                     this.data.frames[0][0],
                     this.data.frames[0][1],
                     this.data.frames[0][2]
                 ));
            }
            return;
        }

        // Apply Frame Data
        const frameData = this.data.frames[this.currentFrameIndex];
        this.car.applyFrameData(frameData);

        // Check for Explosion
        if (this.explosionFrame !== -1 && this.currentFrameIndex === this.explosionFrame) {
            this.triggerExplosion();
        }

        // Update Explosions
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
            // Use crash zoom logic
            this.cameraManager.updateCrashZoom(
                dt, 
                this.car.position, 
                true, // explosionTriggered
                this.timeSinceExplosion, 
                this.trackManager, 
                this.scene
            );
        } else {
            this.cameraManager.updateFollow(this.car.position, dt);
        }

        this.currentFrameIndex++;
    }

    triggerExplosion() {
        this.hasExploded = true;
        this.car.hide(); // Hide car mesh
        const explosion = new Explosion(this.scene, this.car.position.clone());
        this.explosions.push(explosion);
    }
}