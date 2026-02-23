class GameSession {
    constructor(favorites, settings, characterProfile) {
        this.favorites = [...favorites].sort(() => Math.random() - 0.5);
        this.fireList = [];
        this.activeList = this.favorites;
        this.settings = settings;

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
        this.delay = this.random_range_float(0.3, 0.45);

        this.difficulties = {
            easy: { fap: [15, 30], stop: [20, 40] },
            normal: { fap: [15, 40], stop: [10, 20] },
            hard: { fap: [25, 60], stop: [5, 15] }
        };

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
        this.instructorAvatar.textContent = this.characterProfile.avatar;

        document.getElementById('quit-btn').onclick = () => this.end();
        document.getElementById('restart-btn').onclick = () => {
            this.finishScreen.classList.add('hidden');
            this.end();
        };

        // Keyboard navigation
        window.onkeydown = (e) => {
            if (!this.isActive) return;
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
            if (!this.isActive) return;
            if (this.currentStage !== 'FAP' && this.currentStage !== 'CUM') return;

            const distX = touchEndX - touchStartX;
            const distY = touchEndY - touchStartY;
            const minSwipeDistance = 50;

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
            if (!this.isActive) return;
            this.elapsedSeconds++;
            const mins = Math.floor(this.elapsedSeconds / 60);
            const secs = this.elapsedSeconds % 60;
            this.timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
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

        if (this.currentStage === 'CUM') {
            // CUM stage finished naturally, go to stats screen
            this.win();
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
        // Time to CUM
        this.currentStage = 'CUM';
        this.view.className = 'stage-cum';

        this.speak(this.getPhrase('CUM'), 0); // 0 duration means it stays until end

        // Transition active pool to fire list if available
        if (this.fireList.length > 0) {
            this.activeList = this.fireList;
            this.activeList.sort(() => Math.random() - 0.5);
            this.currentIndex = 0;
            this.updateImage();
        }

        // Random duration between 10 and 45 seconds
        const duration = Math.floor(Math.random() * (45 - 10 + 1)) + 10;
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
            if (!this.isActive || this.isPaused) return;

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
        const targetSecs = this.settings.duration * 60;

        // Ensure delay is properly scaled
        const delaySecs = this.delay * targetSecs;

        if (this.elapsedSeconds <= delaySecs) {
            return 0.0;
        }

        const activeTime = this.elapsedSeconds - delaySecs;
        const targetActiveTime = targetSecs - delaySecs;

        if (activeTime < targetActiveTime) {
            // Exponential phase: from 0% at delay, curving up to 40% at target duration
            const progress = activeTime / targetActiveTime;
            const curveExponent = 4.5;
            const curve = Math.pow(progress, curveExponent);
            return curve * 0.40; // Maxes out at 40% at the target duration
        } else {
            // Linear phase: from 40% at target duration, climbing linearly to 100% after an additional buffer
            // Let's say it reaches 100% after an extra 35% of the target time
            const postTargetTime = activeTime - targetActiveTime;
            const maxOvertime = targetSecs * 0.35;
            const linearProgress = Math.min(1.0, postTargetTime / maxOvertime);

            return 0.35 + (linearProgress * 0.60); // Starts at 40%, adds up to 60%
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

        try {
            // 3. Preload the new image
            const newImg = new Image();
            newImg.src = url;
            newImg.className = 'image-layer';

            await new Promise((resolve, reject) => {
                newImg.onload = resolve;
                newImg.onerror = reject;
            });

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

    nextImage() {
        if (this.activeList.length === 0) return;
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

        this.finishScreen.classList.remove('hidden');
    }

    end() {
        this.isActive = false;
        this.stopTimers();
        clearTimeout(this.speechTimer);
        this.instructorBubble.classList.remove('active');
        this.view.classList.add('hidden');
        this.setupContainer.classList.remove('hidden');
        document.body.classList.remove('game-active');

        // Clean up the image container so it's fresh for the next session
        this.imgContainer.innerHTML = '<div id="stage-overlay" class="stage-overlay"><span id="stage-text">READY</span></div>';
    }

    stopTimers() {
        clearInterval(this.timer);
        clearTimeout(this.stageTimer);
    }
}
