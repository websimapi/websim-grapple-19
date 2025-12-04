<<<<<<< SEARCH
    updateCrash(dt) {
        if (!this.explosionTriggered) {
            // Gravity
            this.fallVelocity.y -= 80 * dt; 
            
            // Apply velocity
            this.car.position.add(this.fallVelocity.clone().multiplyScalar(dt));
            this.car.mesh.position.copy(this.car.position);
            
            // Tumble rotation
            this.car.mesh.rotation.x += 5 * dt;
            this.car.mesh.rotation.z += 3 * dt;

            // Spawn Interceptor if falling deep enough
            if (!this.interceptorSpawned && this.car.position.y < -5) {
                this.spaceEnvironment.spawnInterceptor(this.car.position, this.fallVelocity);
                this.interceptorSpawned = true;
            }

            // Check Collision with Asteroids
            const hit = this.spaceEnvironment.checkCollisions(this.car.position);
            
            // Trigger explosion on hit OR failsafe depth
            if (hit || this.car.position.y < -200) {
                this.triggerExplosion();
            }
        }

        // Camera follow logic
        this.cameraManager.updateCrashZoom(
            dt, 
            this.car.position, 
            this.explosionTriggered, 
            this.explosionTime, 
            this.clock, 
            this.trackManager,
            this.scene
        );
    }

    triggerExplosion() {
        this.explosionTriggered = true;
        this.explosionTime = this.clock.getElapsedTime();

        // Spawn Explosion at current car position
        const explosion = new Explosion(this.scene, this.car.position.clone());
        this.explosions.push(explosion);
        
        // Hide car mesh as it exploded
        this.car.hide();

        // Play explosion sound (repurposed skidSound)
        this.audioManager.playSkid(true);

        // Delay showing game over overlay so explosion is visible
        setTimeout(() => {
            this.showGameOverScreen();
        }, 3000); // Reduced delay slightly
    }
=======
    updateCrash(dt) {
        if (!this.explosionTriggered) {
            // Gravity
            this.fallVelocity.y -= 80 * dt; 
            
            // Apply velocity
            this.car.position.add(this.fallVelocity.clone().multiplyScalar(dt));
            this.car.mesh.position.copy(this.car.position);
            
            // Tumble rotation
            this.car.mesh.rotation.x += 5 * dt;
            this.car.mesh.rotation.z += 3 * dt;

            // Spawn Interceptor if falling deep enough
            if (!this.interceptorSpawned && this.car.position.y < -5) {
                this.spaceEnvironment.spawnInterceptor(this.car.position, this.fallVelocity);
                this.interceptorSpawned = true;
            }

            // Check Collision with Asteroids
            const hit = this.spaceEnvironment.checkCollisions(this.car.position);
            
            // Trigger explosion on hit OR failsafe depth
            if (hit || this.car.position.y < -200) {
                this.triggerExplosion();
            }
        }

        const timeSinceExplosion = this.explosionTriggered ? (this.clock.getElapsedTime() - this.explosionTime) : 0;

        // Camera follow logic
        this.cameraManager.updateCrashZoom(
            dt, 
            this.car.position, 
            this.explosionTriggered, 
            timeSinceExplosion, 
            this.trackManager,
            this.scene
        );
    }

    triggerExplosion() {
        this.explosionTriggered = true;
        this.explosionTime = this.clock.getElapsedTime();

        // Mark in recorder
        this.recorder.markExplosion();

        // Spawn Explosion at current car position
        const explosion = new Explosion(this.scene, this.car.position.clone());
        this.explosions.push(explosion);
        
        // Hide car mesh as it exploded
        this.car.hide();

        // Play explosion sound (repurposed skidSound)
        this.audioManager.playSkid(true);

        // Delay showing game over overlay so explosion is visible
        setTimeout(() => {
            this.showGameOverScreen();
        }, 5000); // 5 seconds to allow for full zoom out
    }
>>>>>>> REPLACE

<<<<<<< SEARCH
        else if (this.isCrashing) {
            this.updateCrash(dt);
        }
        else if (this.isReplaying) {
=======
        else if (this.isCrashing) {
            this.updateCrash(dt);
            // Continue recording the crash sequence
            this.recorder.recordFrame(this.car);
        }
        else if (this.isReplaying) {
>>>>>>> REPLACE

