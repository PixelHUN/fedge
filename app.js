// State Management
let state = {
    profile: {
        username: '',
        pfp: ''
    },
    playlists: [
        {
            id: 'default',
            name: 'e621 Favorites',
            tags: '',
            postIds: [],
            limit: 100,
            isDefault: true
        }
    ],
    lastPlaylistId: 'default',
    characterId: 'foxy',
    characterProfile: null,
    settings: {
        duration: 30,
        difficulty: 'normal',
        overrideTags: '',
        playlistOrder: 'shuffle'
    }
};

let availableCharacters = [];
let loadedPosts = [];

// DOM Elements
const views = {
    mainMenu: document.getElementById('main-menu-view'),
    sessionPlanner: document.getElementById('session-planner-view'),
    playlistEditor: document.getElementById('playlist-editor-view')
};

const profileBtn = document.getElementById('profile-btn');
const profilePfp = document.getElementById('profile-pfp');
const profileName = document.getElementById('profile-name');
const profileModal = document.getElementById('profile-modal');
const profileEditUsername = document.getElementById('profile-edit-username');
const profileEditPfp = document.getElementById('profile-edit-pfp');

const statusMsg = document.getElementById('status-message');
const setupForm = document.getElementById('setup-form');
const startBtn = document.getElementById('start-session');

const playlistSelect = document.getElementById('playlist-select');
const playlistOrder = document.getElementById('playlist-order');
const durationInput = document.getElementById('session-duration');
const difficultyInput = document.getElementById('difficulty');
const tagsInput = document.getElementById('tags-filter');
const characterInput = document.getElementById('instructor-character');

const editorPlaylistSelect = document.getElementById('editor-playlist-select');
const editPlaylistForm = document.getElementById('playlist-edit-form');
const editName = document.getElementById('edit-playlist-name');
const editTags = document.getElementById('edit-playlist-tags');
const editIds = document.getElementById('edit-playlist-ids');
const editLimit = document.getElementById('edit-playlist-limit');

// Initialization & Data Loading
async function init() {
    await fetchCharacters();
    loadState();
    updateUIProfile();
    populatePlaylistSelects();
    showView('main-menu');
}

function loadState() {
    const saved = localStorage.getItem('edge_runner_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            // Ensure default playlist exists
            if (!state.playlists.find(p => p.id === 'default')) {
                state.playlists.unshift({ id: 'default', name: 'e621 Favorites', tags: '', postIds: [], limit: 100, isDefault: true });
            }
        } catch (e) { console.error("Could not parse saved data", e); }
    }

    // Default form values from state
    durationInput.value = state.settings.duration;
    difficultyInput.value = state.settings.difficulty;
    tagsInput.value = state.settings.overrideTags;
    if (state.settings.playlistOrder) playlistOrder.value = state.settings.playlistOrder;
    if (state.characterId) characterInput.value = state.characterId;
}

function saveState() {
    state.settings = {
        duration: parseInt(durationInput.value),
        difficulty: difficultyInput.value,
        overrideTags: tagsInput.value.trim(),
        playlistOrder: playlistOrder.value
    };
    state.characterId = characterInput.value;
    state.characterProfile = availableCharacters.find(c => c.id === state.characterId);
    state.lastPlaylistId = playlistSelect.value;
    localStorage.setItem('edge_runner_data', JSON.stringify(state));
}

// View Routing
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    if (viewName === 'main-menu') views.mainMenu.classList.remove('hidden');
    else if (viewName === 'session-planner') views.sessionPlanner.classList.remove('hidden');
    else if (viewName === 'playlist-editor') {
        populatePlaylistSelects();
        views.playlistEditor.classList.remove('hidden');
    }
}

document.getElementById('btn-nav-session').onclick = () => showView('session-planner');
document.getElementById('btn-nav-playlists').onclick = () => showView('playlist-editor');
document.getElementById('btn-back-from-session').onclick = () => showView('main-menu');
document.getElementById('btn-back-from-playlists').onclick = () => showView('main-menu');

// Profile Logic
profileBtn.onclick = () => {
    profileEditUsername.value = state.profile.username || '';
    profileEditPfp.value = state.profile.pfp || '';
    profileModal.classList.remove('hidden');
};

document.getElementById('btn-close-profile').onclick = () => profileModal.classList.add('hidden');

document.getElementById('btn-save-profile').onclick = async () => {
    const btn = document.getElementById('btn-save-profile');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    state.profile.username = profileEditUsername.value.trim();
    let pfpInput = profileEditPfp.value.trim();

    // Treat as Post ID if it's strictly numbers
    if (/^\d+$/.test(pfpInput)) {
        try {
            const res = await fetch(`https://e621.net/posts.json?tags=id:${pfpInput}`);
            const data = await res.json();
            if (data.posts && data.posts.length > 0) {
                pfpInput = data.posts[0].sample?.url || data.posts[0].file?.url || pfpInput;
            }
        } catch (e) { console.error("Failed to fetch PFP by ID", e); }
    }

    state.profile.pfp = pfpInput;
    saveState();
    updateUIProfile();

    profileModal.classList.add('hidden');
    btn.textContent = 'Save';
    btn.disabled = false;
};

function updateUIProfile() {
    profileName.textContent = state.profile.username || 'Guest';
    if (state.profile.pfp) {
        profilePfp.src = state.profile.pfp;
    } else {
        profilePfp.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    }
}

// Playlist Logic
function populatePlaylistSelects() {
    playlistSelect.innerHTML = '';
    editorPlaylistSelect.innerHTML = '';

    state.playlists.forEach(p => {
        const opt1 = document.createElement('option');
        opt1.value = p.id;
        opt1.textContent = p.name;
        playlistSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = p.id;
        opt2.textContent = p.name;
        editorPlaylistSelect.appendChild(opt2);
    });

    playlistSelect.value = state.lastPlaylistId || 'default';
    if (!playlistSelect.value) playlistSelect.value = 'default';

    editorPlaylistSelect.value = state.playlists[0].id; // Trigger load
    loadPlaylistIntoEditor(editorPlaylistSelect.value);
}

function loadPlaylistIntoEditor(id) {
    const p = state.playlists.find(x => x.id === id);
    if (!p) {
        editPlaylistForm.classList.add('hidden');
        return;
    }
    editPlaylistForm.classList.remove('hidden');
    editName.value = p.name;
    editTags.value = p.tags;
    editIds.value = p.postIds.join(', ');
    editLimit.value = p.limit;

    const delBtn = document.getElementById('btn-delete-playlist');
    if (p.isDefault) {
        editName.disabled = true;
        editTags.disabled = true;
        delBtn.style.display = 'none';
        editTags.placeholder = "Uses your e621 Username Favorites automatically";
    } else {
        editName.disabled = false;
        editTags.disabled = false;
        delBtn.style.display = 'block';
        editTags.placeholder = "e.g. fox solo animated";
    }
}

editorPlaylistSelect.addEventListener('change', (e) => loadPlaylistIntoEditor(e.target.value));

document.getElementById('btn-new-playlist').onclick = () => {
    const newId = 'pl_' + Date.now();
    state.playlists.push({
        id: newId,
        name: 'New Custom Playlist',
        tags: '',
        postIds: [],
        limit: 100
    });
    saveState();
    populatePlaylistSelects();
    editorPlaylistSelect.value = newId;
    loadPlaylistIntoEditor(newId);
};

document.getElementById('btn-save-playlist').onclick = () => {
    const id = editorPlaylistSelect.value;
    const p = state.playlists.find(x => x.id === id);
    if (p) {
        if (!p.isDefault) {
            p.name = editName.value.trim() || 'Untitled Playlist';
            p.tags = editTags.value.trim();
        }

        p.limit = parseInt(editLimit.value) || 100;

        // Parse IDs (comma separated, numbers only)
        const rawIds = editIds.value.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
        p.postIds = [...new Set(rawIds)]; // deduplicate

        saveState();
        populatePlaylistSelects();
        editorPlaylistSelect.value = id;

        const saveBtn = document.getElementById('btn-save-playlist');
        const origText = saveBtn.textContent;
        saveBtn.textContent = 'Saved!';
        setTimeout(() => saveBtn.textContent = origText, 1500);
    }
};

document.getElementById('btn-delete-playlist').onclick = () => {
    const id = editorPlaylistSelect.value;
    const pIndex = state.playlists.findIndex(x => x.id === id);
    if (pIndex > -1 && !state.playlists[pIndex].isDefault) {
        if (confirm(`Delete playlist "${state.playlists[pIndex].name}"?`)) {
            state.playlists.splice(pIndex, 1);
            if (state.lastPlaylistId === id) state.lastPlaylistId = 'default';
            saveState();
            populatePlaylistSelects();
        }
    }
};

// Session Loader
function showStatus(msg, type = 'info') {
    statusMsg.textContent = msg;
    statusMsg.className = `status-info ${type}`;
}

async function prepareSession() {
    saveState();
    const playlistId = playlistSelect.value;
    const playlist = state.playlists.find(x => x.id === playlistId);

    if (playlist.isDefault && !state.profile.username) {
        showStatus('Please set your e621 username in the Profile Settings first.', 'error');
        return;
    }

    startBtn.disabled = true;
    showStatus('Fetching posts...', 'info');
    loadedPosts = [];

    try {
        let baseTags = playlist.tags;
        if (playlist.isDefault) {
            baseTags = `fav:${state.profile.username}`;
        }

        const override = state.settings.overrideTags;
        const finalTags = override ? `${baseTags} ${override}`.trim() : baseTags.trim();

        let idsToFetch = [...playlist.postIds];
        let fetchedIds = new Set();

        // 1. Fetch exact IDs in batches (e621 allows chunked id searches)
        if (idsToFetch.length > 0) {
            const batches = [];
            while (idsToFetch.length > 0) {
                batches.push(idsToFetch.splice(0, 40));
            }

            for (const batch of batches) {
                const idTag = `id:${batch.join(',')}`;
                const r = await fetch(`https://e621.net/posts.json?tags=${idTag} ${override}`.trim());
                if (r.ok) {
                    const data = await r.json();
                    if (data.posts) {
                        loadedPosts.push(...data.posts);
                        data.posts.forEach(p => fetchedIds.add(p.id));
                    }
                }
            }
        }

        // We only fetch what we need, up to a max of 320 to respect API limits in one call.
        const remainingLimit = playlist.limit - loadedPosts.length;
        if (remainingLimit > 0 && finalTags) {
            const limitToFetch = Math.min(remainingLimit, 320);

            // Build the URL based on whether it's the exact default fav query
            let url;
            if (playlist.isDefault && !override) {
                // Optimization: Don't force unnecessary tag computations on e621 for raw favorites
                url = `https://e621.net/posts.json?tags=fav:${state.profile.username}&limit=${limitToFetch}`;
            } else {
                url = `https://e621.net/posts.json?tags=${encodeURIComponent(finalTags)}&limit=${limitToFetch}`;
            }

            const r = await fetch(url);
            if (r.ok) {
                const data = await r.json();
                if (data.posts) {
                    // Add only unique posts
                    data.posts.forEach(p => {
                        if (!fetchedIds.has(p.id) && loadedPosts.length < playlist.limit) {
                            loadedPosts.push(p);
                            fetchedIds.add(p.id);
                        }
                    });
                }
            }
        }

        if (loadedPosts.length === 0) {
            showStatus('No posts found for this playlist.', 'error');
            startBtn.disabled = false;
            return;
        }

        showStatus(`Loaded ${loadedPosts.length} posts! Starting session...`, 'success');
        setTimeout(() => {
            const session = new GameSession(loadedPosts, state.settings, state.characterProfile);
            session.start();
            showStatus('', 'info');
            startBtn.disabled = false;
        }, 800);

    } catch (e) {
        console.error(e);
        showStatus('Network error occurred.', 'error');
        startBtn.disabled = false;
    }
}

setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    prepareSession();
});

// Utilities
async function fetchCharacters() {
    try {
        const response = await fetch('characters.json');
        if (!response.ok) throw new Error('Could not load characters config');
        const data = await response.json();
        availableCharacters = data.characters || [];

        // Fetch the instructor images from e621
        await Promise.all(availableCharacters.map(async char => {
            if (char.avatarId) {
                try {
                    const r = await fetch(`https://e621.net/posts.json?tags=id:${char.avatarId}`);
                    if (r.ok) {
                        const postData = await r.json();
                        if (postData.posts && postData.posts.length > 0) {
                            char.avatarUrl = postData.posts[0].sample?.url || postData.posts[0].file?.url;
                        }
                    }
                } catch (e) { console.error("Avatar fetch error", e); }
            }
        }));

        characterInput.innerHTML = '';
        availableCharacters.forEach(char => {
            const option = document.createElement('option');
            option.value = char.id;
            // No emoji, just the name in the dropdown (it's hard to put images in native <select>s)
            option.textContent = char.name;
            characterInput.appendChild(option);
        });
    } catch (err) {
        console.error("Failed to fetch characters.json:", err);
    }
}

// Auto-save form inputs
[durationInput, difficultyInput, tagsInput, characterInput, playlistOrder].forEach(el => {
    el.addEventListener('change', saveState);
});

init();

// Event Listener for the simulation button (unchanged logic)
const simulateBtn = document.getElementById('simulate-btn');
if (simulateBtn) {
    simulateBtn.addEventListener('click', () => {
        saveState();
        const runs = 10000;
        const settings = state.settings;
        const targetSecs = settings.duration * 60;

        const difficulties = {
            easy: { fap: [15, 30], stop: [20, 40] },
            normal: { fap: [15, 40], stop: [10, 20] },
            hard: { fap: [25, 60], stop: [5, 15] }
        };
        const config = difficulties[settings.difficulty];

        const random_range_float = (min, max) => Math.random() * (max - min) + min;
        const random_range = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        let results = [];

        for (let i = 0; i < runs; i++) {
            let elapsed = 0;
            let delay = random_range_float(0.25, 0.6);
            let delaySecs = delay * targetSecs;
            let currentStage = 'FAP';

            while (true) {
                const range = currentStage === 'FAP' ? config.fap : config.stop;
                const duration = random_range(range[0], range[1]);
                elapsed += duration;

                if (currentStage === 'FAP') {
                    let chance = 0;
                    if (elapsed > delaySecs) {
                        const activeTime = elapsed - delaySecs;
                        const targetActiveTime = targetSecs - delaySecs;

                        if (activeTime < targetActiveTime) {
                            const progress = activeTime / targetActiveTime;
                            const curveExponent = 8.0;
                            const curve = Math.pow(progress, curveExponent);
                            chance = curve * 0.15;
                        } else {
                            const postTargetTime = activeTime - targetActiveTime;
                            const maxOvertime = targetSecs * 0.35;
                            const linearProgress = Math.min(1.0, postTargetTime / maxOvertime);
                            chance = 0.15 + (linearProgress * 0.75);
                        }
                    }

                    if (Math.random() < chance) {
                        results.push(elapsed);
                        break;
                    }
                    currentStage = 'STOP';
                } else {
                    currentStage = 'FAP';
                }
            }
        }

        const sortedResults = [...results].sort((a, b) => a - b);
        const midIndex = Math.floor(sortedResults.length / 2);
        const median = (sortedResults.length % 2 !== 0
            ? sortedResults[midIndex]
            : (sortedResults[midIndex - 1] + sortedResults[midIndex]) / 2) / 60;

        const actualMin = sortedResults[0] / 60;
        const actualMax = sortedResults[sortedResults.length - 1] / 60;
        const avg = (results.reduce((a, b) => a + b, 0) / results.length) / 60;

        document.getElementById('sim-min').textContent = actualMin.toFixed(2) + 'm';
        document.getElementById('sim-avg').textContent = avg.toFixed(2) + 'm';
        document.getElementById('sim-med').textContent = median.toFixed(2) + 'm';
        document.getElementById('sim-max').textContent = actualMax.toFixed(2) + 'm';
        document.getElementById('simulation-results').classList.remove('hidden');

        const container = document.getElementById('histogram-container');
        container.innerHTML = '';

        const targetMins = settings.duration;
        const maxDist = Math.max(Math.abs(targetMins - actualMin), Math.abs(actualMax - targetMins));
        const min = Math.max(0, targetMins - maxDist);
        const max = targetMins + (targetMins - min);

        const bucketCount = 51;
        const bucketSize = (max - min) / bucketCount;
        let buckets = new Array(bucketCount).fill(0);

        results.forEach(val => {
            let m = val / 60;
            let idx = Math.floor((m - min) / bucketSize);
            if (idx < 0) idx = 0;
            if (idx >= bucketCount) idx = bucketCount - 1;
            buckets[idx]++;
        });

        const maxBucket = Math.max(...buckets);
        buckets.forEach((count, i) => {
            const bar = document.createElement('div');
            bar.className = 'histogram-bar';
            const heightPct = count === 0 ? 0 : Math.max(1, (count / maxBucket) * 100);
            bar.style.height = `${heightPct}%`;
            const timeVal = (min + (i * bucketSize)).toFixed(1);
            bar.title = `${timeVal}m: ${count} runs`;
            container.appendChild(bar);
        });

        const labelsContainer = document.getElementById('histogram-labels');
        if (labelsContainer) {
            labelsContainer.innerHTML = '';
            const labelSegments = 5;
            for (let i = 0; i <= labelSegments; i++) {
                const timeVal = min + ((max - min) * (i / labelSegments));
                const label = document.createElement('span');
                label.textContent = timeVal.toFixed(1) + 'm';
                labelsContainer.appendChild(label);
            }
        }
    });
}
