// script.js

// --- CONFIGURATION ---
// const API_BASE_URL = 'http://localhost:3001/api';
const API_BASE_URL = 'https://eletube.homespi.org/api'

// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const welcomeMessage = document.getElementById('welcome-message');
const logoutButton = document.getElementById('logout-button');
const uploadForm = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');
const clipsList = document.getElementById('clips-list');

// --- STATE & HELPERS ---

/**
 * Gets the JWT from localStorage.
 * @returns {string|null} The token or null if not found.
 */
function getToken() {
    return localStorage.getItem('jwt');
}

/**
 * Decodes the payload from a JWT.
 * NOTE: This does NOT verify the token. It's just for reading data on the client.
 * @param {string} token
 * @returns {object|null} The decoded payload.
 */
function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

async function populateGamesDropdown() {
    const gameSelects = document.querySelectorAll('#game-select, #url-game-select');

    // Simple check to prevent populating multiple times
    if ([...gameSelects].some(gameSelect => gameSelect.options.length > 1)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/games`);
        if (!response.ok) throw new Error('Failed to fetch games.');

        const games = await response.json();

        games.forEach(game => {
            const option = document.createElement('option');
            option.value = game._id; // The value is the important MongoDB ID
            option.textContent = game.name; // The text is the human-readable name
            gameSelects.forEach(select => select.appendChild(option.cloneNode(true)));
        });

    } catch (error) {
        console.error(error);
        // If it fails, show an error in the dropdown
        const option = document.createElement('option');
        option.textContent = 'Could not load games';
        option.disabled = true;
        gameSelects.forEach(select => select.appendChild(option.cloneNode(true)));
    }
}

// --- CORE LOGIC ---

/**
 * Handles the page load. Checks for auth callback, then checks login state.
 */
function onPageLoad() {
    // 1. Check if we're coming back from a Discord login
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
        // We have a token from the URL. Store it.
        localStorage.setItem('jwt', tokenFromUrl);
        // Clean the URL so the token isn't visible
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 2. Check the overall login state
    checkLoginState();

    document.getElementById("login-button").setAttribute("href", `${API_BASE_URL}/auth/discord`)
}

/**
 * Checks if the user is logged in and updates the UI accordingly.
 */
function checkLoginState() {
    const token = getToken();
    if (token) {
        // User is logged in
        const user = parseJwt(token);
        if (user) {
            welcomeMessage.textContent = `Welcome, ${user.username}!`;
            showAppView();
            fetchClips();
        } else {
            // Token is invalid, log them out
            logout();
        }
    } else {
        // User is logged out
        showLoginView();
    }
}

/**
 * Fetches all clips from the API and renders them.
 */
async function fetchClips() {
    clipsList.innerHTML = 'Loading clips...';
    try {
        const response = await fetch(`${API_BASE_URL}/clips`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch clips.');

        const clips = await response.json();
        renderClips(clips);
    } catch (error) {
        clipsList.innerHTML = `Error: ${error.message}`;
    }
}

/**
 * Renders an array of clip objects to the DOM.
 * @param {Array<object>} clips
 */
function renderClips(clips) {
    clipsList.innerHTML = ''; // Clear previous content
    if (clips.length === 0) {
        clipsList.innerHTML = '<p>No clips have been uploaded yet.</p>';
        return;
    }

    const loggedInUser = parseJwt(getToken()); // Get current user info
    console.log(clips)
    clips.data.forEach(clip => {
        const clipElement = document.createElement('div');
        clipElement.className = 'clip-item';

        // Check if the current user owns this clip
        const isOwner = loggedInUser && loggedInUser.id === clip.uploader?._id;

        clipElement.innerHTML = `
        <h4>${clip.title}</h4>
        <p><strong>Uploader:</strong> ${clip.uploader?.username}</p>
        <p><strong>Game:</strong> ${clip.game?.name ?? clip.game} ${clip.subGame ? `(${clip.subGame})` : ''}</p>
        <p>${clip.description || ''}</p>
        <video controls src="${clip.videoUrl}"></video>
        <div class="clip-actions">
            <button class="share-btn" data-id="${clip._id}">Share</button>
            ${isOwner ? `<button class="edit-btn" data-id="${clip._id}">Edit</button>` : ''}
            ${isOwner ? `<button class="delete-btn" data-id="${clip._id}">Delete</button>` : ''}
        </div>
    `;
        clipsList.appendChild(clipElement);
    });
}

/**
 * Handles the form submission for uploading a new clip.
 * @param {Event} event
 */
async function handleUpload(event) {
    event.preventDefault();
    const uploadButton = document.getElementById('upload-button');
    uploadButton.disabled = true;
    uploadStatus.textContent = 'Uploading, please wait...';

    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const gameId = document.getElementById('game-select').value;
    const subGame = document.getElementById('subgame').value;
    const videoFile = document.getElementById('video-file').files[0];

    // We use FormData because we are sending a file
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('gameId', gameId); // IMPORTANT: Use 'gameId' to match backend
    formData.append('subGame', subGame);
    formData.append('video', videoFile);

    try {
        const response = await fetch(`${API_BASE_URL}/clips`, {
            method: 'POST',
            headers: {
                // Don't set Content-Type, the browser does it for FormData
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Upload failed.');
        }

        uploadStatus.textContent = 'Upload successful!';
        uploadForm.reset(); // Clear the form
        fetchClips(); // Refresh the clips list

    } catch (error) {
        uploadStatus.textContent = `Error: ${error.message}`;
    } finally {
        uploadButton.disabled = false;
        // Optional: clear the status message after a few seconds
        setTimeout(() => { uploadStatus.textContent = ''; }, 5000);
    }
}

async function handleDelete(clipId) {
    try {
        const response = await fetch(`${API_BASE_URL}/clips/${clipId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!response.ok) throw new Error('Failed to delete.');
        fetchClips(); // Refresh the list
    } catch (error) {
        alert(error.message);
    }
}

async function handleUpdate(clipId, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/clips/${clipId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Failed to update.');
        fetchClips(); // Refresh the list
    } catch (error) {
        alert(error.message);
    }
}

function handleShare(clipId, buttonElement) {
    // NOTE: This is the base URL of your backend, not the API url
    const shareableLink = `https://eletube.homespi.org/view/${clipId}`;

    navigator.clipboard.writeText(shareableLink).then(() => {
        // Provide feedback to the user
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Copied!';
        setTimeout(() => {
            buttonElement.textContent = originalText;
        }, 2000); // Revert back after 2 seconds
    }).catch(err => {
        console.error('Failed to copy link: ', err);
        alert('Could not copy link to clipboard.');
    });
}

/**
 * Logs the user out by clearing the token and showing the login view.
 */
function logout() {
    localStorage.removeItem('jwt');
    showLoginView();
}

// --- UI VIEW SWITCHING ---

function showLoginView() {
    loginView.classList.remove('hidden');
    appView.classList.add('hidden');
}

function showAppView() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    populateGamesDropdown()
}

// --- EVENT LISTENERS ---
logoutButton.addEventListener('click', logout);
uploadForm.addEventListener('submit', handleUpload);
clipsList.addEventListener('click', (event) => {
    if (event.target.classList.contains('share-btn')) {
        const clipId = event.target.dataset.id;
        handleShare(clipId, event.target);
    }
    if (event.target.classList.contains('delete-btn')) {
        const clipId = event.target.dataset.id;
        if (confirm('Are you sure you want to delete this clip?')) {
            handleDelete(clipId);
        }
    }
    if (event.target.classList.contains('edit-btn')) {
        const clipId = event.target.dataset.id;
        // For an MVP, a simple prompt is fine.
        const newTitle = prompt("Enter new title:");
        if (newTitle) { // Only update if user entered something
            handleUpdate(clipId, { title: newTitle });
        }
    }
});

const urlUploadForm = document.getElementById('url-upload-form');
urlUploadForm.addEventListener('submit', handleUrlUpload);

async function handleUrlUpload(event) {
    event.preventDefault();
    const statusEl = document.getElementById('url-upload-status');
    const buttonEl = document.getElementById('url-upload-button');

    buttonEl.disabled = true;
    statusEl.textContent = 'Submitting job...';

    const payload = {
        clipUrl: document.getElementById('clip-url').value,
        title: document.getElementById('url-title').value,
        gameId: document.getElementById('url-game-select').value,
        subGame: document.getElementById('url-subgame').value,
        description: document.getElementById('url-description').value,
    };

    try {
        // Kick off the job
        const response = await fetch(`${API_BASE_URL}/clips/from-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Failed to start job.');

        const { jobId } = await response.json();
        
        // Start polling for the status
        statusEl.textContent = 'Processing started... checking status.';
        const pollInterval = setInterval(() => {
            pollJobStatus(jobId, pollInterval, statusEl, buttonEl);
        }, 3000); // Check every 3 seconds

    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
        buttonEl.disabled = false;
    }
}

async function pollJobStatus(jobId, pollInterval, statusEl, buttonEl) {
    try {
        const response = await fetch(`${API_BASE_URL}/clips/status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            // If the job itself isn't found, stop polling.
            clearInterval(pollInterval);
            statusEl.textContent = 'Error: Job not found.';
            buttonEl.disabled = false;
            return;
        }

        const { status, error } = await response.json();
        statusEl.textContent = `Status: ${status}...`;

        if (status === 'completed') {
            clearInterval(pollInterval);
            statusEl.textContent = 'Success! Clip created.';
            buttonEl.disabled = false;
            urlUploadForm.reset();
            fetchClips(); // Refresh the main clips list
        } else if (status === 'failed') {
            clearInterval(pollInterval);
            statusEl.textContent = `Failed: ${error}`;
            buttonEl.disabled = false;
        }
        // If status is still pending/downloading/etc, do nothing and let it poll again.

    } catch (pollError) {
        clearInterval(pollInterval);
        statusEl.textContent = 'Error checking status.';
        buttonEl.disabled = false;
    }
}

// --- INITIALIZE THE APP ---
document.addEventListener('DOMContentLoaded', onPageLoad);