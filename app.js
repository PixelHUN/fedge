// State Management
let state = {
    username: '',
    favorites: [],
    characterId: 'foxy',
    characterProfile: null,
    settings: {
        duration: 30,
        difficulty: 'normal',
        limit: 100,
        tags: ''
    }
};

let availableCharacters = [];

// DOM Elements
const usernameInput = document.getElementById('username');
const loadFavsBtn = document.getElementById('load-favorites');
const statusMsg = document.getElementById('status-message');
const setupForm = document.getElementById('setup-form');
const startBtn = document.getElementById('start-session');
const durationInput = document.getElementById('session-duration');
const difficultyInput = document.getElementById('difficulty');
const limitInput = document.getElementById('post-limit');
const tagsInput = document.getElementById('tags-filter');
const characterInput = document.getElementById('instructor-character');

// Load saved data from localStorage
async function init() {
    await fetchCharacters();

    const saved = localStorage.getItem('edge_runner_data');
    if (saved) {
        const parsed = JSON.parse(saved);
        usernameInput.value = parsed.username || '';
        durationInput.value = parsed.settings?.duration || 30;
        difficultyInput.value = parsed.settings?.difficulty || 'normal';
        limitInput.value = parsed.settings?.limit || 100;
        tagsInput.value = parsed.settings?.tags || '';
        if (parsed.characterId) {
            characterInput.value = parsed.characterId;
        }
    }
    updateState();
}

function updateState() {
    state.username = usernameInput.value.trim();
    state.characterId = characterInput.value;
    state.characterProfile = availableCharacters.find(c => c.id === state.characterId);
    state.settings = {
        duration: parseInt(durationInput.value),
        difficulty: difficultyInput.value,
        limit: parseInt(limitInput.value),
        tags: tagsInput.value.trim()
    };
    saveState();
}

function saveState() {
    localStorage.setItem('edge_runner_data', JSON.stringify(state));
}

function showStatus(msg, type = 'info') {
    statusMsg.textContent = msg;
    statusMsg.className = `status-info ${type}`;
}

async function fetchCharacters() {
    try {
        const response = await fetch('characters.json');
        if (!response.ok) throw new Error('Could not load characters config');
        const data = await response.json();
        availableCharacters = data.characters || [];

        // Populate dropdown
        characterInput.innerHTML = '';
        availableCharacters.forEach(char => {
            const option = document.createElement('option');
            option.value = char.id;
            option.textContent = `${char.avatar} ${char.name}`;
            characterInput.appendChild(option);
        });
    } catch (err) {
        console.error("Failed to fetch characters.json:", err);
    }
}

async function fetchFavorites() {
    const username = usernameInput.value.trim();
    if (!username) {
        showStatus('Please enter a username', 'error');
        return;
    }

    showStatus('Fetching favorites...', 'info');
    loadFavsBtn.disabled = true;

    try {
        // e621 requires a User-Agent. Since this is a browser fetch, 
        // it uses the browser's UA, but we should be aware of CORS.
        // For development, we might hit CORS issues depending on how e621 handles it.
        // Note: fav:username is the standard way to fetch favorites for a user.
        const response = await fetch(`https://e621.net/posts.json?tags=fav:${username}&limit=${state.settings.limit}`, {
            headers: {
                // In a browser, you can't set the User-Agent header directly.
                // e621 might block generic browser requests depending on their policy.
                // However, for an "HTML game" it might be intended for local use or a specific host.
            }
        });

        if (!response.ok) {
            if (response.status === 404) throw new Error('User not found');
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const posts = data.posts || [];

        if (posts.length === 0) {
            showStatus('No favorites found or profile is private.', 'error');
            startBtn.disabled = true;
        } else {
            state.favorites = posts;
            state.username = username;
            saveState();
            showStatus(`Loaded ${posts.length} favorites! Ready to start.`, 'success');
            startBtn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        showStatus(`Error: ${err.message}`, 'error');
    } finally {
        loadFavsBtn.disabled = false;
    }
}

// Event Listeners
loadFavsBtn.addEventListener('click', fetchFavorites);

setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    updateState();

    if (state.favorites.length === 0) {
        showStatus('Please load favorites first!', 'error');
        return;
    }

    const session = new GameSession(state.favorites, state.settings, state.characterProfile);
    session.start();
});

// Auto-save on change
[usernameInput, durationInput, difficultyInput, limitInput, tagsInput, characterInput].forEach(el => {
    el.addEventListener('change', updateState);
});

init();
