import * as THREE from 'three';

export class ActionRecorder {
    constructor() {
        this.frames = [];
        this.trackData = [];
        this.isRecording = false;
    }

    start(trackManager) {
        this.frames = [];
        this.trackData = []; // Will be grabbed at end or beginning
        this.isRecording = true;
    }

    recordFrame(car) {
        if (!this.isRecording) return;
        this.frames.push(car.getFrameData());
    }

    stop(trackManager) {
        this.isRecording = false;
        // Capture total track state
        this.trackData = trackManager.segmentHistory;
        
        return {
            track: this.trackData,
            frames: this.frames
        };
    }
}

export class ReplaySystem {
    constructor(car, trackManager, cameraManager) {
        this.car = car;
        this.trackManager = trackManager;
        this.cameraManager = cameraManager;
        
        this.data = null;
        this.isPlaying = false;
        this.currentFrameIndex = 0;
        this.accumTime = 0;
        this.frameRate = 1/60; // Assuming 60fps recording
    }

    load(jsonData) {
        this.data = jsonData;
        // Rebuild Track
        this.trackManager.rebuildFromHistory(this.data.track);
        this.currentFrameIndex = 0;
        this.isPlaying = true;
        
        // Initial state
        if (this.data.frames.length > 0) {
            this.car.applyFrameData(this.data.frames[0]);
            this.cameraManager.reset(this.car.position);
        }
    }

    update(dt) {
        if (!this.isPlaying || !this.data || this.currentFrameIndex >= this.data.frames.length) {
            // Loop
            this.currentFrameIndex = 0;
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

        // Simple playback: advance one frame per engine update (assuming locked 60 for now)
        // For better timing, could implement time accumulation, but 1:1 frame mapping is smoothest for replay
        
        const frameData = this.data.frames[this.currentFrameIndex];
        this.car.applyFrameData(frameData);
        
        // Update Camera
        this.cameraManager.updateFollow(this.car.position, dt);

        this.currentFrameIndex++;
    }
}