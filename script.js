// script.js

// --- CONFIGURATION ---
//const API_BASE_URL = "http://localhost:3001/api"
const API_BASE_URL = "https://eletube.homespi.org/api"

// --- DOM ELEMENTS ---
const loadingScreen = document.getElementById("loading-screen")
const loginView = document.getElementById("login-view")
const appView = document.getElementById("app-view")
const welcomeMessage = document.getElementById("welcome-message")
const logoutButton = document.getElementById("logout-button")
const uploadPanel = document.getElementById("upload-panel")
const uploadToggle = document.getElementById("upload-toggle")
const gridToggle = document.getElementById("grid-toggle")
const uploadForm = document.getElementById("upload-form")
const urlUploadForm = document.getElementById("url-upload-form")
const uploadStatus = document.getElementById("upload-status")
const urlUploadStatus = document.getElementById("url-upload-status")
const clipsList = document.getElementById("clips-list")
const clipsContainer = document.getElementById("clips-container")
const fullscreenModal = document.getElementById("fullscreen-modal")
const fullscreenVideo = document.getElementById("fullscreen-video")
const searchInput = document.getElementById("search-input")

// --- STATE & HELPERS ---
let currentGridSize = "normal"
let currentView = "grid"
let allClips = []
let filteredClips = []

/**
 * Gets the JWT from localStorage.
 * @returns {string|null} The token or null if not found.
 */
function getToken() {
  return localStorage.getItem("jwt")
}

/**
 * Decodes the payload from a JWT.
 * NOTE: This does NOT verify the token. It's just for reading data on the client.
 * @param {string} token
 * @returns {object|null} The decoded payload.
 */
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]))
  } catch (e) {
    return null
  }
}

async function populateGamesDropdown() {
  const gameSelects = document.querySelectorAll("#game-select, #url-game-select")

  // Simple check to prevent populating multiple times
  if ([...gameSelects].some((gameSelect) => gameSelect.options.length > 1)) {
    return
  }

  try {
    const response = await fetch(`${API_BASE_URL}/games`)
    if (!response.ok) throw new Error("Failed to fetch games.")

    const games = await response.json()

    games.forEach((game) => {
      const option = document.createElement("option")
      option.value = game._id
      option.textContent = game.name
      gameSelects.forEach((select) => select.appendChild(option.cloneNode(true)))
    })
  } catch (error) {
    console.error(error)
    const option = document.createElement("option")
    option.textContent = "Could not load games"
    option.disabled = true
    gameSelects.forEach((select) => select.appendChild(option.cloneNode(true)))
  }
}

// --- CORE LOGIC ---

/**
 * Handles the page load. Shows loading screen, then checks auth.
 */
function onPageLoad() {
  // Show loading screen for 2 seconds
  setTimeout(() => {
    loadingScreen.style.display = "none"

    // Check if we're coming back from a Discord login
    const urlParams = new URLSearchParams(window.location.search)
    const tokenFromUrl = urlParams.get("token")

    if (tokenFromUrl) {
      localStorage.setItem("jwt", tokenFromUrl)
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    checkLoginState()
  }, 2000)

  document.getElementById("login-button").setAttribute("href", `${API_BASE_URL}/auth/discord`)
}

/**
 * Checks if the user is logged in and updates the UI accordingly.
 */
function checkLoginState() {
  const token = getToken()
  if (token) {
    const user = parseJwt(token)
    if (user) {
      welcomeMessage.textContent = `Welcome, ${user.username}!`
      showAppView()
      fetchClips()
    } else {
      logout()
    }
  } else {
    showLoginView()
  }
}

/**
 * Fetches all clips from the API and renders them.
 */
async function fetchClips() {
  clipsList.innerHTML = '<div class="loading-message">Loading clips...</div>'
  try {
    const response = await fetch(`${API_BASE_URL}/clips`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    })

    if (!response.ok) throw new Error("Failed to fetch clips.")

    const clips = await response.json()
    allClips = clips.data || []
    filteredClips = [...allClips]
    renderClips(filteredClips)
  } catch (error) {
    clipsList.innerHTML = `<div class="error-message">Error: ${error.message}</div>`
  }
}

/**
 * Renders an array of clip objects to the DOM.
 * @param {Array<object>} clips
 */
function renderClips(clips) {
  clipsList.innerHTML = ""

  if (clips.length === 0) {
    clipsList.innerHTML = '<div class="empty-message">No clips found.</div>'
    return
  }

  const loggedInUser = parseJwt(getToken())

  clips.forEach((clip, index) => {
    const clipElement = document.createElement("div")
    clipElement.className = "clip-item"
    clipElement.style.animationDelay = `${index * 0.1}s`

    const isOwner = loggedInUser && loggedInUser.id === clip.uploader?._id

    clipElement.innerHTML = `
            <div class="clip-thumbnail">
                <video class="clip-video" 
                       src="${clip.videoUrl}" 
                       muted 
                       preload="metadata"
                       data-clip-id="${clip._id}">
                </video>
                <button class="play-button" data-clip-id="${clip._id}">
                    <i class="fas fa-play"></i>
                </button>
                <div class="clip-overlay">
                    <div class="overlay-info">
                        <h4>${clip.title}</h4>
                        <p>${clip.description || ""}</p>
                    </div>
                </div>
            </div>
            <div class="clip-info">
                <h3 class="clip-title">${clip.title}</h3>
                <div class="clip-meta">
                    <span><i class="fas fa-user"></i> ${clip.uploader?.username || "Unknown"}</span>
                    <span><i class="fas fa-gamepad"></i> ${clip.game?.name || clip.game}</span>
                </div>
                ${clip.description ? `<p class="clip-description">${clip.description}</p>` : ""}
                <div class="clip-actions">
                    <button class="action-btn share-btn" data-id="${clip._id}">
                        <i class="fas fa-share"></i> Share
                    </button>
                    ${
                      isOwner
                        ? `
                        <button class="action-btn edit-btn" data-id="${clip._id}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="action-btn delete-btn" data-id="${clip._id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    `
                        : ""
                    }
                </div>
            </div>
        `

    clipsList.appendChild(clipElement)
  })

  // Add hover effects for video preview
  addVideoHoverEffects()
}

/**
 * Adds hover effects to play video previews
 */
function addVideoHoverEffects() {
  const videos = document.querySelectorAll(".clip-video")

  videos.forEach((video) => {
    let hoverTimeout
    let isHovering = false

    video.addEventListener("mouseenter", () => {
      isHovering = true
      hoverTimeout = setTimeout(() => {
        if (isHovering) {
          video.currentTime = 0
          video.muted = true // Ensure it's muted for preview
          video.play().catch((e) => console.log("Video preview failed:", e))

          // Add preview styling
          video.style.transform = "scale(1.05)"
          video.style.filter = "brightness(1.1)"
        }
      }, 300) // Reduced delay for faster preview
    })

    video.addEventListener("mouseleave", () => {
      isHovering = false
      clearTimeout(hoverTimeout)
      video.pause()
      video.currentTime = 0

      // Remove preview styling
      video.style.transform = "scale(1)"
      video.style.filter = "brightness(1)"
    })

    // Add click handler directly to video
    video.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const clipId = video.dataset.clipId
      if (clipId) {
        openFullscreen(clipId)
      }
    })
  })

  // Also add click handlers to play buttons
  const playButtons = document.querySelectorAll(".play-button")
  playButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const clipId = button.dataset.clipId
      if (clipId) {
        openFullscreen(clipId)
      }
    })
  })
}

/**
 * Opens fullscreen modal for a clip
 */
function openFullscreen(clipId) {
  const clip = allClips.find((c) => c._id === clipId)
  if (!clip) return

  document.getElementById("modal-title").textContent = clip.title
  document.getElementById("modal-description").textContent = clip.description || ""
  document.getElementById("modal-uploader").textContent = `By: ${clip.uploader?.username || "Unknown"}`
  document.getElementById("modal-game").textContent = `Game: ${clip.game?.name || clip.game}`

  fullscreenVideo.src = clip.videoUrl
  fullscreenVideo.muted = false // Unmute for fullscreen
  fullscreenModal.classList.remove("hidden")
  document.body.style.overflow = "hidden"

  // Auto-play the video in fullscreen
  setTimeout(() => {
    fullscreenVideo.play().catch((e) => console.log("Fullscreen video play failed:", e))
  }, 100)
}

/**
 * Closes fullscreen modal
 */
function closeFullscreen() {
  fullscreenModal.classList.add("hidden")
  fullscreenVideo.pause()
  fullscreenVideo.src = ""
  document.body.style.overflow = "auto"
}

/**
 * Handles the form submission for uploading a new clip.
 */
async function handleUpload(event) {
  event.preventDefault()
  const uploadButton = document.getElementById("upload-button")
  uploadButton.disabled = true
  uploadButton.classList.add("loading")
  uploadStatus.textContent = "Launching clip..."

  const title = document.getElementById("title").value
  const description = document.getElementById("description").value
  const gameId = document.getElementById("game-select").value
  const subGame = document.getElementById("subgame").value
  const videoFile = document.getElementById("video-file").files[0]

  const formData = new FormData()
  formData.append("title", title)
  formData.append("description", description)
  formData.append("gameId", gameId)
  formData.append("subGame", subGame)
  formData.append("video", videoFile)

  try {
    const response = await fetch(`${API_BASE_URL}/clips`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || "Upload failed.")
    }

    uploadStatus.textContent = "Clip successfully launched!"
    uploadForm.reset()
    fetchClips()

    // Hide upload panel after success
    setTimeout(() => {
      uploadPanel.classList.remove("active")
    }, 2000)
  } catch (error) {
    uploadStatus.textContent = `Launch failed: ${error.message}`
  } finally {
    uploadButton.disabled = false
    uploadButton.classList.remove("loading")
    setTimeout(() => {
      uploadStatus.textContent = ""
    }, 5000)
  }
}

async function handleUrlUpload(event) {
  event.preventDefault()
  const statusEl = urlUploadStatus
  const buttonEl = document.getElementById("url-upload-button")

  buttonEl.disabled = true
  buttonEl.classList.add("loading")
  statusEl.textContent = "Initiating download..."

  const payload = {
    clipUrl: document.getElementById("clip-url").value,
    title: document.getElementById("url-title").value,
    gameId: document.getElementById("url-game-select").value,
    subGame: document.getElementById("url-subgame").value,
    description: document.getElementById("url-description").value,
  }

  try {
    const response = await fetch(`${API_BASE_URL}/clips/from-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) throw new Error("Failed to start job.")

    const { jobId } = await response.json()

    statusEl.textContent = "Processing to cloud..."
    const pollInterval = setInterval(() => {
      pollJobStatus(jobId, pollInterval, statusEl, buttonEl)
    }, 3000)
  } catch (error) {
    statusEl.textContent = `error: ${error.message}`
    buttonEl.disabled = false
    buttonEl.classList.remove("loading")
  }
}

async function pollJobStatus(jobId, pollInterval, statusEl, buttonEl) {
  try {
    const response = await fetch(`${API_BASE_URL}/clips/status/${jobId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })

    if (!response.ok) {
      clearInterval(pollInterval)
      statusEl.textContent = "job lost error."
      buttonEl.disabled = false
      buttonEl.classList.remove("loading")
      return
    }

    const { status, error } = await response.json()
    statusEl.textContent = `Status: ${status}...`

    if (status === "completed") {
      clearInterval(pollInterval)
      statusEl.textContent = "Clip successfully sent!"
      buttonEl.disabled = false
      buttonEl.classList.remove("loading")
      urlUploadForm.reset()
      fetchClips()

      setTimeout(() => {
        uploadPanel.classList.remove("active")
      }, 2000)
    } else if (status === "failed") {
      clearInterval(pollInterval)
      statusEl.textContent = `failure: ${error}`
      buttonEl.disabled = false
      buttonEl.classList.remove("loading")
    }
  } catch (pollError) {
    clearInterval(pollInterval)
    statusEl.textContent = "Lost connection to servers."
    buttonEl.disabled = false
    buttonEl.classList.remove("loading")
  }
}

async function handleDelete(clipId) {
  try {
    const response = await fetch(`${API_BASE_URL}/clips/${clipId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!response.ok) throw new Error("Failed to delete.")
    fetchClips()
  } catch (error) {
    alert(`Deletion failed: ${error.message}`)
  }
}

async function handleUpdate(clipId, data) {
  try {
    const response = await fetch(`${API_BASE_URL}/clips/${clipId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error("Failed to update.")
    fetchClips()
  } catch (error) {
    alert(`Update failed: ${error.message}`)
  }
}

function handleShare(clipId, buttonElement) {
  const shareableLink = `https://eletube.homespi.org/view/${clipId}`

  navigator.clipboard
    .writeText(shareableLink)
    .then(() => {
      const originalText = buttonElement.innerHTML
      buttonElement.innerHTML = '<i class="fas fa-check"></i> Copied!'
      setTimeout(() => {
        buttonElement.innerHTML = originalText
      }, 2000)
    })
    .catch((err) => {
      console.error("Failed to copy link: ", err)
      alert("Could not copy link to clipboard.")
    })
}

/**
 * Filters clips based on search query
 */
function filterClips(query) {
  if (!query.trim()) {
    filteredClips = [...allClips]
  } else {
    const searchTerm = query.toLowerCase()
    filteredClips = allClips.filter(
      (clip) =>
        clip.title.toLowerCase().includes(searchTerm) ||
        clip.description?.toLowerCase().includes(searchTerm) ||
        clip.uploader?.username.toLowerCase().includes(searchTerm) ||
        clip.game?.name?.toLowerCase().includes(searchTerm),
    )
  }
  renderClips(filteredClips)
}

/**
 * Toggles grid size
 */
function toggleGridSize() {
  const sizes = ["small", "normal", "large"]
  const currentIndex = sizes.indexOf(currentGridSize)
  currentGridSize = sizes[(currentIndex + 1) % sizes.length]

  // Remove all grid size classes
  clipsList.classList.remove("grid-small", "grid-normal", "grid-large")
  // Add the new grid size class
  clipsList.classList.add(`grid-${currentGridSize}`)

  // Update the grid toggle button icon to show current state
  const gridIcon = gridToggle.querySelector("i")
  switch (currentGridSize) {
    case "small":
      gridIcon.className = "fas fa-th"
      break
    case "normal":
      gridIcon.className = "fas fa-th-large"
      break
    case "large":
      gridIcon.className = "fas fa-stop"
      break
  }
}

/**
 * Logs the user out
 */
function logout() {
  localStorage.removeItem("jwt")
  showLoginView()
}

// --- UI VIEW SWITCHING ---

function showLoginView() {
  loginView.classList.remove("hidden")
  appView.classList.add("hidden")
}

function showAppView() {
  loginView.classList.add("hidden")
  appView.classList.remove("hidden")
  populateGamesDropdown()
}

// --- EVENT LISTENERS ---

// Upload panel toggle
uploadToggle.addEventListener("click", () => {
  uploadPanel.classList.toggle("active")
})

// Grid size toggle
gridToggle.addEventListener("click", toggleGridSize)

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab

    // Update active tab button
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"))
    btn.classList.add("active")

    // Update active tab content
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active")
    })
    document.getElementById(`${tabName}-tab`).classList.add("active")
  })
})

// View controls
document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const viewType = btn.dataset.view

    document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"))
    btn.classList.add("active")

    clipsContainer.className = `clips-container ${viewType}-view`
    currentView = viewType
  })
})

// Search functionality
searchInput.addEventListener("input", (e) => {
  filterClips(e.target.value)
})

// Form submissions
uploadForm.addEventListener("submit", handleUpload)
urlUploadForm.addEventListener("submit", handleUrlUpload)

// Logout
logoutButton.addEventListener("click", logout)

// Clips interactions - Updated to handle clicks better
clipsList.addEventListener("click", (event) => {
  // Prevent event bubbling for video and play button clicks
  if (event.target.classList.contains("clip-video") || event.target.classList.contains("play-button")) {
    return // These are handled by their own event listeners
  }

  const clipId = event.target.dataset.id || event.target.closest("[data-id]")?.dataset.id

  if (event.target.classList.contains("share-btn")) {
    handleShare(clipId, event.target)
  }

  if (event.target.classList.contains("delete-btn")) {
    if (confirm("Are you sure you want to delete this clip?")) {
      handleDelete(clipId)
    }
  }

  if (event.target.classList.contains("edit-btn")) {
    const newTitle = prompt("Enter new title:")
    if (newTitle) {
      handleUpdate(clipId, { title: newTitle })
    }
  }
})

// Fullscreen modal
document.querySelector(".modal-close").addEventListener("click", closeFullscreen)
fullscreenModal.addEventListener("click", (e) => {
  if (e.target === fullscreenModal) {
    closeFullscreen()
  }
})

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (uploadPanel.classList.contains("active")) {
      uploadPanel.classList.remove("active")
    }
    if (!fullscreenModal.classList.contains("hidden")) {
      closeFullscreen()
    }
  }
})

// File upload label update
document.getElementById("video-file").addEventListener("change", (e) => {
  const label = document.querySelector(".file-label span")
  if (e.target.files.length > 0) {
    label.textContent = e.target.files[0].name
  } else {
    label.textContent = "Choose Video File"
  }
})

// --- INITIALIZE THE APP ---
document.addEventListener("DOMContentLoaded", onPageLoad)
