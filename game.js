class GameSession {
    constructor(favorites, settings, characterProfile) {
        this.settings = settings;
        this.favorites = [...favorites];
        if (this.settings.playlistOrder === 'shuffle') {
            this.favorites.sort(() => Math.random() - 0.5);
        }

        this.fireList = [];
        this.activeList = this.favorites;
        this.preloadedImages = new Map(); // Store preloaded Image objects

        // Load passed character or fallback
        this.characterProfile = characterProfile || {
            id: 'foxy', name: 'Foxy', avatar: '🦊', dialogue: {
                READY: ["Get ready!"], FAP: ["Keep going!"], STOP: ["Hands off!"], CUM: ["CUM FOR ME!"]
            }
        };
        this.currentIndex = 0;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.picturesSeen = 0; // Track pictures
        this.currentStage = 'READY'; // 'FAP', 'STOP', or 'CUM'
        this.timer = null;
        this.stageTimer = null;
        this.isPaused = false;
        this.isActive = true;
        this.currentUpdateId = 0;
        this.currentDisplayedChancePercent = 0; // tracking for visual lerp
        this.delay = this.random_range_float(0.275, 0.6);

        this.difficulties = {
            easy: { fap: [15, 30], stop: [20, 40] },
            normal: { fap: [15, 40], stop: [10, 20] },
            hard: { fap: [25, 60], stop: [5, 15] },
            extreme: { fap: [40, 120], stop: [5, 10] }
        };

        if (this.settings.mode === 'swipe') {
            const diffCurves = {
                easy: [10, 15],
                normal: [25, 40],
                hard: [40, 60],
                extreme: [60, 90]
            };
            const range = diffCurves[this.settings.difficulty] || diffCurves['normal'];
            this.targetSwipeSecs = this.random_range(range[0], range[1]) * 60;
            this.swipeRightCount = 0;
            this.swipeModeImageCount = 0;
        }

        this.initDOM();
    }

    initDOM() {
        this.setupContainer = document.querySelector('.container');
        this.view = document.getElementById('gameplay-view');
        this.imgContainer = document.getElementById('image-container');
        this.currentImgElement = null; // Track current dynamic image
        this.stageText = document.getElementById('stage-text');
        this.stageProgressBar = document.getElementById('stage-progress-bar');
        this.timerDisplay = document.getElementById('session-timer');
        this.chancePath = document.getElementById('finish-chance-path');
        this.chanceText = document.getElementById('finish-chance-text');
        this.finishScreen = document.getElementById('finish-screen');
        this.statTime = document.getElementById('stat-time');
        this.statPictures = document.getElementById('stat-pictures');

        // Character Instructor elements
        this.instructorBubble = document.getElementById('instructor-bubble');
        this.instructorAvatar = document.getElementById('instructor-avatar');

        if (this.characterProfile.avatarUrl) {
            this.instructorAvatar.innerHTML = `<img src="${this.characterProfile.avatarUrl}" style="width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-glow); box-shadow: 0 0 15px var(--accent-glow), 0 8px 20px rgba(0,0,0,0.6);">`;
        } else {
            this.instructorAvatar.textContent = this.characterProfile.avatar || '🦊';
        }

        document.getElementById('quit-btn').onclick = () => this.end();
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) {
            pauseBtn.onclick = () => this.togglePause();
        }
        document.getElementById('restart-btn').onclick = () => {
            this.finishScreen.classList.add('hidden');
            this.end();
        };

        // Keyboard navigation
        window.onkeydown = (e) => {
            if (!this.isActive || this.isPaused) return;
            const mode = this.settings.mode || 'edge';

            if (mode === 'swipe') {
                if (this.currentStage !== 'CUM') {
                    if (e.key === 'ArrowRight') this.handleSwipeChoice('right');
                    else if (e.key === 'ArrowLeft') this.handleSwipeChoice('left');
                }
                return;
            }

            if (this.currentStage === 'FAP' || this.currentStage === 'CUM') {
                if (e.key === 'ArrowRight') this.nextImage();
                if (e.key === 'ArrowLeft') this.prevImage();
            }

            if (this.currentStage === 'FAP') {
                if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    this.markFire();
                }

                // Debug trigger for CUM stage
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    this.triggerCumStage();
                }
            }
        };

        // Swipe support via touch events
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        const handleSwipe = () => {
            if (!this.isActive || this.isPaused) return;
            const mode = this.settings.mode || 'edge';

            const distX = touchEndX - touchStartX;
            const distY = touchEndY - touchStartY;
            const minSwipeDistance = 50;

            if (mode === 'swipe') {
                if (this.currentStage !== 'CUM') {
                    if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) > minSwipeDistance) {
                        this.handleSwipeChoice(distX < 0 ? 'left' : 'right');
                    }
                }
                return;
            }

            if (this.currentStage !== 'FAP' && this.currentStage !== 'CUM') return;

            if (Math.abs(distX) > Math.abs(distY)) {
                // Horizontal swipe
                if (distX < -minSwipeDistance) {
                    this.nextImage();
                } else if (distX > minSwipeDistance) {
                    this.prevImage();
                }
            } else if (this.currentStage === 'FAP') {
                // Vertical swipe
                if (distY < -minSwipeDistance) {
                    // Swipe up implies marking fire
                    this.markFire();
                }
            }
        };

        this.view.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        this.view.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });

        // Prevent native scrolling on the game view
        this.view.addEventListener('touchmove', (e) => {
            if (this.isActive) {
                e.preventDefault();
            }
        }, { passive: false });

    }

    start() {
        this.isActive = true;
        this.setupContainer.classList.add('hidden');
        this.view.classList.remove('hidden');
        document.body.classList.add('game-active');
        this.startSessionTimer();
        this.preloadUpcomingImages(); // Kick off preload
        this.speak(this.getPhrase('READY'));
        this.nextStage();
    }

    getPhrase(stage) {
        const phrases = this.characterProfile.dialogue[stage];
        if (!phrases || phrases.length === 0) return "...";
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    speak(message, duration = 3000) {
        if (!this.isActive) return;
        this.instructorBubble.textContent = message;
        this.instructorBubble.classList.add('active');

        clearTimeout(this.speechTimer);

        // CUM message stays active longer/indefinitely, others fade out
        if (duration > 0) {
            this.speechTimer = setTimeout(() => {
                this.instructorBubble.classList.remove('active');
            }, duration);
        }
    }

    startSessionTimer() {
        this.timer = setInterval(() => {
            if (!this.isActive || this.isPaused) return;
            this.elapsedSeconds++;
            const mins = Math.floor(this.elapsedSeconds / 60);
            const secs = this.elapsedSeconds % 60;
            this.timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }

    togglePause() {
        if (!this.isActive) return;
        if (this.currentStage === 'CUM') return; // Do not pause during end phase

        this.isPaused = !this.isPaused;
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) {
            pauseBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
            pauseBtn.classList.toggle('active', this.isPaused);
        }

        if (this.isPaused) {
            // Keep the previous current stage message for resume? Let's just override with pause.
            this.speak("Session paused.", 0);
            this.imgContainer.classList.add('stage-stop'); // Visual pause effect
        } else {
            this.speak("Resuming!", 2000);
            this.imgContainer.classList.remove('stage-stop');

            // Re-apply correct stage styling
            if (this.currentStage === 'FAP') {
                this.view.className = 'stage-fap';
            } else if (this.currentStage === 'STOP') {
                this.view.className = 'stage-stop';
            }
        }
    }

    updateFinishChance() {
        const chance = this.currentChance();
        const maxOffset = 188.5; // Stroke dash length
        this.chancePath.style.strokeDashoffset = maxOffset - (chance * maxOffset);

        // Lerp the text visualization
        const targetPercent = Math.round(chance * 100);
        const startPercent = this.currentDisplayedChancePercent;
        const durationMs = 1000; // Matches CSS transition exactly
        const startTime = performance.now();

        const animateText = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / durationMs, 1);

            // Fast easeOut to roughly match JS visuals with CSS cubic bezier
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const currentVal = Math.round(startPercent + (targetPercent - startPercent) * easeOutQuart);

            this.chanceText.textContent = `${currentVal}%`;

            if (progress < 1 && this.isActive) {
                requestAnimationFrame(animateText);
            } else {
                this.currentDisplayedChancePercent = targetPercent;
                this.chanceText.textContent = `${targetPercent}%`;
            }
        };
        requestAnimationFrame(animateText);
    }

    random_range(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    random_range_float(min, max) {
        return Math.random() * (max - min) + min;
    }

    nextStage() {
        if (!this.isActive) return;

        const mode = this.settings.mode || 'edge';

        if (this.currentStage === 'CUM') {
            // In Swipe mode, keep playing until session time is hit
            if (mode === 'swipe' && this.elapsedSeconds < this.settings.duration * 60) {
                this.currentStage = 'FAP';
                this.view.className = 'stage-fap';

                // 20% Penalty: add 20% to our current effective target time
                this.targetSwipeSecs += (this.targetSwipeSecs * 0.10);

                this.updateFinishChance();
                this.stageText.textContent = 'SWIPE';
                this.stageProgressBar.style.width = '100%';

                // Allow them to start swiping again, clear overlay
                if (this.currentImgElement) {
                    const overlay = this.currentImgElement.querySelector('.matched-overlay');
                    if (overlay) overlay.remove();
                }
                this.nextImage();
                return;
            } else {
                // Otherwise normal behavior: win screen
                this.win();
                return;
            }
        }

        if (mode === 'fap') {
            const wasReady = this.currentStage === 'READY';
            this.currentStage = 'FAP';
            this.view.className = 'stage-fap';

            if (wasReady) {
                this.updateImage();
            } else {
                if (this.checkFinishRoll()) {
                    this.triggerCumStage();
                    return;
                }
                this.nextImage();
            }
            this.updateFinishChance();
            this.stageText.textContent = 'FAP';
            this.stageDuration = this.settings.strokePace || 5;
            this.stageRemaining = this.stageDuration;

            clearTimeout(this.stageTimer);
            this.cycleStageProgress();
            return;
        }

        if (mode === 'swipe') {
            const wasReady = this.currentStage === 'READY';
            this.currentStage = 'FAP';
            this.view.className = 'stage-fap';

            if (wasReady) {
                this.updateImage();
            }

            this.updateFinishChance();
            this.stageText.textContent = 'SWIPE';
            clearTimeout(this.stageTimer);
            this.stageProgressBar.style.width = '100%';
            return;
        }

        if (this.currentStage === 'STOP' || this.currentStage === 'READY') {
            const wasReady = this.currentStage === 'READY';
            this.currentStage = 'FAP';
            this.view.className = 'stage-fap';

            if (wasReady) {
                this.updateImage(); // Show first image
            } else {
                this.nextImage(); // Advance to next image automatically
                this.speak(this.getPhrase('FAP'));
            }
            this.updateFinishChance(); // Update circular meter visually
        } else {
            // End of FAP stage, check for finish
            if (this.checkFinishRoll()) {
                this.triggerCumStage();
                return;
            }

            this.currentStage = 'STOP';
            this.view.className = 'stage-stop';
            this.speak(this.getPhrase('STOP'));
        }

        this.stageText.textContent = this.currentStage;

        const config = this.difficulties[this.settings.difficulty];
        const range = this.currentStage === 'FAP' ? config.fap : config.stop;
        const duration = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];

        this.stageDuration = duration;
        this.stageRemaining = duration;

        clearTimeout(this.stageTimer);
        this.cycleStageProgress();
    }

    triggerCumStage() {
        const currentMode = this.settings.mode || 'edge';

        // Time to CUM
        this.currentStage = 'CUM';
        this.view.className = 'stage-cum';

        this.speak(this.getPhrase('CUM'), 10000); // 0 duration means it stays until end

        if (currentMode !== 'swipe') {
            // Transition active pool to fire list if available
            if (this.fireList.length > 0) {
                this.activeList = this.fireList;
                this.activeList.sort(() => Math.random() - 0.5);
                this.currentIndex = 0;
                this.updateImage();
            }
        } else {
            // SWIPE MODE: Lock picture
            if (this.currentImgElement) {
                this.currentImgElement.style.transition = 'none';
                this.currentImgElement.style.transform = 'none';
                this.currentImgElement.style.opacity = '1';

                // Add a cute "IT'S A MATCH!" visual marker
                const matchVisual = document.createElement('div');
                matchVisual.className = 'matched-overlay';
                matchVisual.textContent = "IT'S A MATCH!";
                matchVisual.style.position = 'absolute';
                matchVisual.style.top = '10%';
                matchVisual.style.width = '100%';
                matchVisual.style.textAlign = 'center';
                matchVisual.style.fontSize = '3rem';
                matchVisual.style.fontWeight = 'bold';
                matchVisual.style.color = '#ff4b4b';
                matchVisual.style.textShadow = '2px 2px 5px rgba(0,0,0,0.8)';
                matchVisual.style.transform = 'rotate(-10deg)';
                matchVisual.style.pointerEvents = 'none';
                matchVisual.style.zIndex = '10';
                this.currentImgElement.appendChild(matchVisual);
            }
        }

        // Random duration between 10 and 45 seconds
        const duration = currentMode === 'swipe' ? 10 : Math.floor(Math.random() * (45 - 10 + 1)) + 10;
        this.stageDuration = duration;
        this.stageRemaining = duration;

        this.stageText.textContent = 'CUM!';
        clearTimeout(this.stageTimer);
        this.cycleStageProgress();
    }

    cycleStageProgress() {
        const tick = 100; // ms
        const step = tick / 1000;

        const updateBar = () => {
            if (!this.isActive) return;
            if (this.isPaused) {
                this.stageTimer = setTimeout(updateBar, tick);
                return;
            }

            this.stageRemaining -= step;
            const percentage = Math.max(0, (this.stageRemaining / this.stageDuration) * 100);
            this.stageProgressBar.style.width = `${percentage}%`;

            if (this.stageRemaining <= 0) {
                this.nextStage();
            } else {
                this.stageTimer = setTimeout(updateBar, tick);
            }
        };

        this.stageTimer = setTimeout(updateBar, tick);
    }

    checkFinishRoll() {
        // Use the visually displayed percentage for the roll
        const chance = this.currentDisplayedChancePercent / 100;

        if (Math.random() < chance) {
            return true; // Will trigger CUM stage
        }
        return false;
    }

    currentChance() {
        const currentMode = this.settings.mode || 'edge';
        let targetSecs;
        let delaySecs;

        if (currentMode === 'swipe') {
            delaySecs = 0.1 * this.targetSwipeSecs;
            targetSecs = this.targetSwipeSecs + delaySecs;
        } else {
            targetSecs = this.settings.duration * 60;
            delaySecs = this.delay * targetSecs;
        }

        if (this.elapsedSeconds <= delaySecs) {
            return 0.0;
        }

        let activeTime = this.elapsedSeconds - delaySecs;
        // exponential decay
        if (currentMode === 'swipe') activeTime += this.swipeRightCount * (15 / (Math.pow(this.swipeRightCount, 0.175)));

        if (activeTime <= 0) return 0.0;

        const targetActiveTime = targetSecs - delaySecs;

        if (activeTime < targetActiveTime) {
            const progress = activeTime / targetActiveTime;
            const curveExponent = currentMode === 'swipe' ? 10.0 : 8.0;
            const curve = Math.pow(progress, curveExponent);
            return curve * 0.15;
        } else {
            const postTargetTime = activeTime - targetActiveTime;
            const maxOvertime = targetSecs * 0.35;
            const linearProgress = Math.min(1.0, postTargetTime / maxOvertime);

            return 0.15 + (linearProgress * 0.75);
        }
    }

    handleSwipeChoice(direction) {
        if (!this.isActive || this.currentStage === 'CUM') return;

        let shouldTriggerCum = false;

        if (direction === 'right') {
            this.swipeRightCount++;

            // Mark right swiped picture as fire automatically so it can repopulate
            const post = this.activeList[this.currentIndex];
            if (!this.fireList.some(p => p.id === post.id)) {
                this.fireList.push(post);
                if (this.currentImgElement) this.applyFireOverlay(this.currentImgElement);
            }

            this.updateFinishChance();
            if (this.checkFinishRoll()) {
                shouldTriggerCum = true;
            }
        }

        if (!shouldTriggerCum) {
            // Apply visual swipe OUT
            if (this.currentImgElement) {
                this.currentImgElement.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease';
                this.currentImgElement.style.transform = `translateX(${direction === 'right' ? '100vw' : '-100vw'}) rotate(${direction === 'right' ? '15deg' : '-15deg'})`;
                this.currentImgElement.style.opacity = '0';
            }

            setTimeout(() => {
                this.nextImage();
            }, 300);
        } else {
            // Give a tiny delay for dramatic effect without swiping away
            setTimeout(() => this.triggerCumStage(), 300);
        }
    }

    async updateImage() {
        if (this.activeList.length === 0 || !this.isActive) return;

        const updateId = ++this.currentUpdateId;

        // 1. Immediately start fading OUT the old image (if it exists)
        const oldImg = this.currentImgElement;
        if (oldImg) {
            oldImg.classList.add('fading');
            this.imgContainer.classList.add('loading');

            // Wait exactly for the CSS fade-out transition (0.4s)
            await new Promise(resolve => setTimeout(resolve, 400));

            // Abort if interrupted
            if (!this.isActive || updateId !== this.currentUpdateId) return;

            // 2. Destroy the old image wrapper from DOM to definitively clear graphics memory
            if (oldImg.parentNode) {
                oldImg.parentNode.removeChild(oldImg);
            }
            this.currentImgElement = null;
        } else {
            this.imgContainer.classList.add('loading');
        }

        const post = this.activeList[this.currentIndex];
        let url = post.sample?.url || post.file?.url;
        if (!url && post.preview?.url) url = post.preview.url;

        if (!url) {
            console.warn('No valid URL found for post:', post.id);
            this.nextImage();
            return;
        }

        // Trigger preload for upcoming images
        this.preloadUpcomingImages();

        try {
            // 3. Use preloaded image if available, else load now
            let newImg;
            if (this.preloadedImages.has(url)) {
                newImg = this.preloadedImages.get(url);
                // We're using it, so don't need it in the preload map anymore 
                // (though keeping it wouldn't hurt, removing it might save a tiny bit of mem over long sessions)
                this.preloadedImages.delete(url);

                // If it's a completely cached Image object with `complete=true`, we don't strictly *need* to wait, 
                // but if it's still downloading in the background, we should attach an onload to this exact ref.
                if (!newImg.complete) {
                    await new Promise((resolve, reject) => {
                        newImg.onload = resolve;
                        newImg.onerror = reject;
                    });
                }
            } else {
                newImg = new Image();
                newImg.src = url;
                newImg.className = 'image-layer';

                await new Promise((resolve, reject) => {
                    newImg.onload = resolve;
                    newImg.onerror = reject;
                });
            }

            if (!this.isActive || updateId !== this.currentUpdateId) return;

            // 4. Create a wrapper div to tightly couple the image and its specific fire overlay
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper fading'; // Wrapper handles the fade
            wrapper.appendChild(newImg);

            // Append the wrapper
            this.imgContainer.appendChild(wrapper);
            this.currentImgElement = wrapper; // Track the wrapper instead

            // Force browser to register the new element before fading in
            wrapper.offsetHeight;

            if (!this.isActive || updateId !== this.currentUpdateId) return;

            // 5. Fade IN the new image wrapper
            wrapper.classList.remove('fading');
            this.imgContainer.classList.remove('loading');

            // Apply persistent fire effect to this specific wrapper if marked
            if (this.fireList.some(p => p.id === post.id)) {
                this.applyFireOverlay(wrapper);
            }

            this.picturesSeen++; // Increment stat when successfully shown

        } catch (e) {
            if (this.isActive && updateId === this.currentUpdateId) {
                console.warn('Failed to load image, skipping...');
                this.nextImage();
            }
        }
    }

    preloadUpcomingImages() {
        // Preload next 3 images
        if (this.activeList.length === 0) return;

        for (let i = 1; i <= 3; i++) {
            const nextIdx = (this.currentIndex + i) % this.activeList.length;
            const post = this.activeList[nextIdx];
            let url = post.sample?.url || post.file?.url;
            if (!url && post.preview?.url) url = post.preview.url;

            if (url && !this.preloadedImages.has(url)) {
                const img = new Image();
                img.src = url;
                img.className = 'image-layer'; // Apply class early so it's ready when inserted
                this.preloadedImages.set(url, img);
            }
        }

        // Optional: clear out old preloaded images if the map gets too big (e.g., > 10) to save memory
        if (this.preloadedImages.size > 10) {
            const keysToRemove = Array.from(this.preloadedImages.keys()).slice(0, this.preloadedImages.size - 5);
            keysToRemove.forEach(key => this.preloadedImages.delete(key));
        }
    }

    nextImage() {
        if (this.activeList.length === 0) return;

        const mode = this.settings.mode || 'edge';

        if (mode === 'swipe' && this.fireList.length > 0 && this.currentStage !== 'CUM') {
            this.swipeModeImageCount++;

            // Probability of injecting a Liked image scales with current chance (up to 100%)
            // When chance is 100%, we want ALL pictures to be from fireList.
            const chancePct = Math.min(this.currentDisplayedChancePercent, 45);

            // Map 0 -> 0 injection
            // Map 100 -> 100% injection rate
            const injectionThreshold = (chancePct / 45);

            if (Math.random() < injectionThreshold) {
                // Inject from fireList
                const randomFireImage = this.fireList[Math.floor(Math.random() * this.fireList.length)];
                // Find its index in activeList to properly shift to it
                const foundIndex = this.activeList.findIndex(p => p.id === randomFireImage.id);
                if (foundIndex !== -1) {
                    // Save the user's spot in the normal sequence before jumping to the random fire image
                    if (this.savedSequenceIndex === undefined) {
                        this.savedSequenceIndex = this.currentIndex;
                    }
                    this.currentIndex = foundIndex;
                    this.updateImage();
                    return;
                }
            }
        }

        // Standard sequence flow
        // Restore sequence spot if we were previously viewing an injected fire image
        if (this.savedSequenceIndex !== undefined) {
            this.currentIndex = this.savedSequenceIndex;
            this.savedSequenceIndex = undefined;
        }

        this.currentIndex = (this.currentIndex + 1) % this.activeList.length;
        this.updateImage();
    }

    prevImage() {
        if (this.activeList.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.activeList.length) % this.activeList.length;
        this.updateImage();
    }

    markFire() {
        if (!this.isActive || this.currentStage === 'CUM' || this.activeList.length === 0) return;

        const post = this.activeList[this.currentIndex];
        const existingIndex = this.fireList.findIndex(p => p.id === post.id);

        if (existingIndex > -1) {
            // Remove from fire list
            this.fireList.splice(existingIndex, 1);
            this.removeFireOverlay();
        } else {
            // Add to fire list
            this.fireList.push(post);
            if (this.currentImgElement) {
                this.applyFireOverlay(this.currentImgElement);
            }
        }
    }

    applyFireOverlay(wrapperElement) {
        // Prevent multiple overlays within this wrapper
        if (wrapperElement.querySelector('.fire-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'fire-overlay active';

        // Generate flames
        for (let i = 0; i < 6; i++) {
            const flame = document.createElement('div');
            flame.className = 'fire-flame';
            flame.style.setProperty('--left', `${20 + Math.random() * 60}%`);
            flame.style.setProperty('--delay', `-${Math.random() * 2}s`); // Negative delay starts them immediately
            flame.style.setProperty('--duration', `${1 + Math.random() * 1.5}s`);
            overlay.appendChild(flame);
        }

        // Generate glowing embers
        for (let i = 0; i < 15; i++) {
            const ember = document.createElement('div');
            ember.className = 'fire-ember';
            ember.style.setProperty('--left', `${10 + Math.random() * 80}%`);
            ember.style.setProperty('--delay', `-${Math.random() * 3}s`);
            ember.style.setProperty('--duration', `${1.5 + Math.random() * 2}s`);
            ember.style.setProperty('--tx', `${Math.random() * 60 - 30}px`);
            overlay.appendChild(ember);
        }

        // Append to the specific image's wrapper div
        wrapperElement.appendChild(overlay);
    }

    removeFireOverlay() {
        if (!this.currentImgElement) return;

        const overlay = this.currentImgElement.querySelector('.fire-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            // Remove from DOM after transition
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
    }

    win() {
        this.isActive = false;
        this.stopTimers();

        // Populate stats
        const mins = Math.floor(this.elapsedSeconds / 60);
        const secs = this.elapsedSeconds % 60;
        this.statTime.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        this.statPictures.textContent = this.picturesSeen.toString();

        // Calculate XP
        let targetSecs;
        if (this.settings.mode === 'swipe') {
            targetSecs = this.targetSwipeSecs + (0.1 * this.targetSwipeSecs);
        } else {
            targetSecs = this.settings.duration * 60;
        }

        if (window.completeSession) {
            const results = window.completeSession(this.elapsedSeconds, targetSecs, false);
            this.showXpResults(results);
        }

        this.finishScreen.classList.remove('hidden');
    }

    end() {
        if (!this.isActive && !this.finishScreen.classList.contains('hidden')) {
            // If already ended via win and we are just closing the finish screen
            this.finishScreen.classList.add('hidden');
        } else if (this.isActive) {
            // If aborting early
            if (this.elapsedSeconds > 60 && window.completeSession) {
                let targetSecs;
                if (this.settings.mode === 'swipe') {
                    targetSecs = this.targetSwipeSecs + (0.1 * this.targetSwipeSecs);
                } else {
                    targetSecs = this.settings.duration * 60;
                }
                window.completeSession(this.elapsedSeconds, targetSecs, true);
            }
        }

        this.isActive = false;
        this.stopTimers();
        clearTimeout(this.speechTimer);
        this.instructorBubble.classList.remove('active');
        this.view.classList.add('hidden');
        this.setupContainer.classList.remove('hidden');
        document.body.classList.remove('game-active');

        // Clean up the image container so it's fresh for the next session
        const imageWrappers = this.imgContainer.querySelectorAll('.image-wrapper');
        imageWrappers.forEach(el => el.remove());
        if (this.stageText) this.stageText.textContent = 'READY';
        this.currentImgElement = null;
    }

    showXpResults(results) {
        const xpGained = document.getElementById('finish-xp-gained');
        const streakText = document.getElementById('finish-streak-text');
        const streakDay = document.getElementById('finish-streak-day');
        const streakStatus = document.getElementById('finish-streak-status');
        const levelText = document.getElementById('finish-levelup-text');
        const newLevel = document.getElementById('finish-new-level');

        if (xpGained) xpGained.textContent = results.xpAdded;

        if (streakText) {
            streakText.classList.remove('hidden');
            streakDay.textContent = results.currentStreak;
            if (results.isNewStreak) {
                streakStatus.textContent = 'Increased';
            } else if (results.streakMaintained) {
                streakStatus.textContent = 'Maintained';
            } else {
                streakStatus.textContent = 'Started';
            }
        }

        if (levelText) {
            if (results.leveledUp) {
                levelText.classList.remove('hidden');
                newLevel.textContent = results.currentLevel;
            } else {
                levelText.classList.add('hidden');
            }
        }
    }

    stopTimers() {
        clearInterval(this.timer);
        clearTimeout(this.stageTimer);
    }
}
