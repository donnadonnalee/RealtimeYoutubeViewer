import { db, auth } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { ref, set, get, onValue, push, child, onDisconnect, update, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";


// Configuration
const SYNC_THRESHOLD = 2; // seconds
const NAMIB_ROOM_ID = 'NAMIB_LIVE';
const NAMIB_VIDEO_ID = 'ydYDqZQpim8';

// State
let player;
let roomId = null;
let userId = null;
let username = "Guest";
let isHost = false;
let isRemoteUpdate = false; // Flag to prevent play/pause loops
const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); // Unique per tab



// DOM Elements (Updated)
const landingPage = document.getElementById('landing-page');
const roomView = document.getElementById('room-view');
const usernameInput = document.getElementById('username-input');
const createRoomBtn = document.getElementById('create-room-btn');
const youtubeUrlInput = document.getElementById('youtube-url-input');
const pasteUrlBtn = document.getElementById('paste-url-btn'); // New
const publicRoomCheckbox = document.getElementById('public-room-checkbox'); // New
const publicRoomsList = document.getElementById('public-rooms-list'); // New
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const currentRoomIdSpan = document.getElementById('current-room-id');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const copyInviteBtn = document.getElementById('copy-invite-btn');

// --- Initialization ---

// Paste Button Logic
if (pasteUrlBtn) {
    pasteUrlBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            youtubeUrlInput.value = text;
        } catch (err) {
            console.error('Failed to read clipboard: ', err);
            alert("Clipboard access failed. Please paste manually.");
        }
    });
}

// Check URL for room code
const urlParams = new URLSearchParams(window.location.search);
const urlRoomId = urlParams.get('room');
if (urlRoomId) {
    roomCodeInput.value = urlRoomId;
    document.getElementById('host-controls').style.display = 'none'; // Hide create controls if joining
    // Auto-focus name input
    usernameInput.focus();
}

// Auth Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        console.log("Logged in as:", userId);
        initPermanentRooms(); // Ensure permanent room exists
    } else {
        signInAnonymously(auth).catch((error) => {
            console.error("Auth Error:", error);
            alert("Authentication Error: " + error.message + "\nCheck if domain is authorized in Firebase Console.");
        });
    }
});

// --- Permanent Room Initialization ---
async function initPermanentRooms() {
    const roomRef = ref(db, 'rooms/' + NAMIB_ROOM_ID);
    try {
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) {
            console.log("Creating Permanent Room...");
            await set(roomRef, {
                videoId: NAMIB_VIDEO_ID,
                hostId: 'SYSTEM',
                hostName: 'System',
                roomName: '🔴 Namib Desert Live (Always On)',
                isPublic: true,
                status: 'playing',
                timestamp: 0,
                createdAt: serverTimestamp()
            });
            // NOTE: We do NOT set onDisconnect().remove() for this room.
        }
    } catch (e) {
        console.error("Error initializing permanent room:", e);
    }
}

// Load YouTube IFrame API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let apiReady = false;
window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    console.log("YouTube API Ready");
};

function initPlayer(videoId) {
    if (player) {
        player.loadVideoById(videoId);
        return;
    }

    if (!apiReady) {
        // Retry if API not ready yet (rare but possible)
        setTimeout(() => initPlayer(videoId), 500);
        return;
    }

    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            'playsinline': 1,
            'rel': 0,
            'modestbranding': 1,
            'controls': 1 // Enable controls so users can seek/pause
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("Player Ready");
    listenToRoomState();
}

// --- Room Management ---

// Listen for public rooms
const publicRoomsRef = ref(db, 'rooms');
onValue(publicRoomsRef, (snapshot) => {
    if (!publicRoomsList) return;
    publicRoomsList.innerHTML = '';
    const data = snapshot.val();

    if (!data) {
        publicRoomsList.innerHTML = '<p>No public rooms available.</p>';
        return;
    }

    let hasPublicRooms = false;
    Object.keys(data).forEach(key => {
        const room = data[key];
        if (room.isPublic) {
            hasPublicRooms = true;

            // Calculate participant count
            const participantCount = room.participants ? Object.keys(room.participants).length : 0;

            // Filter out empty rooms (Zombie rooms), but ALWAYS show the Permanent Room
            if (participantCount === 0 && key !== NAMIB_ROOM_ID) {
                return; // Skip this iteration
            }

            const div = document.createElement('div');
            div.style.cssText = "padding: 10px; background: #444; margin-bottom: 5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;";

            // Update display text to include participant count
            div.innerHTML = `<span><strong>${room.roomName || 'Room'}</strong> (Host: ${room.hostName || 'Unknown'}) - <small>👥 ${participantCount}</small></span> <button style='padding: 2px 10px;'>Join</button>`;

            div.onclick = () => {
                roomCodeInput.value = key;
                joinRoomBtn.click();
            };
            publicRoomsList.appendChild(div);
        }
    });

    if (!hasPublicRooms) {
        publicRoomsList.innerHTML = '<p>No public rooms available.</p>';
    }
});

createRoomBtn.addEventListener('click', async () => {
    const name = usernameInput.value.trim();
    const url = youtubeUrlInput.value.trim();
    const isPublic = publicRoomCheckbox.checked;

    if (!name) { alert("Please enter your name."); return; }
    if (!url) { alert("Please enter a YouTube URL."); return; }

    // Check Auth
    if (!userId) { alert("Connecting to server... please wait."); return; }

    const videoId = extractVideoId(url);
    if (!videoId) { alert("Invalid YouTube URL."); return; }

    username = name;
    isHost = true;
    roomId = generateRoomId();

    try {
        // Initialize Room Data in Firebase
        const roomRef = ref(db, 'rooms/' + roomId);
        await set(roomRef, {
            videoId: videoId,
            hostId: userId,
            hostName: username,
            roomName: `${username}'s Room`,
            isPublic: isPublic,
            status: 'paused',
            timestamp: 0,
            createdAt: serverTimestamp()
        });

        // REMOVED: onDisconnect(roomRef).remove(); 
        // We rely on participant count for deletion now.

        await addParticipant(roomId, userId, username);
        enterRoom(roomId, videoId);
    } catch (e) {
        console.error(e);
        alert("Error creating room. Check console/API Key.");
    }
});

joinRoomBtn.addEventListener('click', async () => {
    const name = usernameInput.value.trim();
    const code = roomCodeInput.value.trim();

    if (!name) { alert("Please enter your name."); return; }
    if (!code) { alert("Please enter a Room Code."); return; }

    if (!userId) { alert("Connecting to server... please wait."); return; }

    username = name;
    roomId = code;
    isHost = false;

    const roomRef = ref(db, 'rooms/' + roomId);
    try {
        const snapshot = await get(roomRef);
        if (snapshot.exists()) {
            const val = snapshot.val();
            await addParticipant(roomId, userId, username);
            enterRoom(roomId, val.videoId);
        } else {
            alert("Room not found.");
        }
    } catch (e) {
        console.error(e);
        alert("Error joining room. Check console/API Key.");
    }
});

leaveRoomBtn.addEventListener('click', async () => {
    if (confirm("Are you sure you want to leave?")) {
        await leaveAndCleanUp();
    }
});

async function leaveAndCleanUp() {
    if (!roomId) { // Removed userId check as we use sessionId now
        location.replace(window.location.pathname);
        return;
    }

    const roomRef = ref(db, 'rooms/' + roomId);
    // Use sessionId for unique participant removal
    const userRef = ref(db, `rooms/${roomId}/participants/${sessionId}`);

    try {
        await remove(userRef);

        // Check if room is empty
        const participantsRef = ref(db, `rooms/${roomId}/participants`);
        const snapshot = await get(participantsRef);

        if (!snapshot.exists()) {
            // No participants left, delete room (UNLESS it's the permanent room)
            if (roomId !== NAMIB_ROOM_ID) {
                await remove(roomRef);
                console.log("Room deleted as last user left.");
            } else {
                console.log("Namib Room empty but kept alive.");
            }
        }
    } catch (e) {
        console.error("Error leaving room:", e);
    }

    location.replace(window.location.pathname);
}

async function addParticipant(roomId, uid, name) {
    // USE sessionId as the key to allow multiple tabs from same user
    const userRef = ref(db, `rooms/${roomId}/participants/${sessionId}`);
    await set(userRef, {
        name: name,
        userId: uid // Store actual userId for reference
    });
    onDisconnect(userRef).remove();
    sendSystemMessage(`${name} has joined.`);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function enterRoom(rId, vId) {
    landingPage.style.display = 'none';
    roomView.style.display = 'flex';
    currentRoomIdSpan.textContent = rId;

    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + rId;
    window.history.pushState({ path: newUrl }, '', newUrl);

    // Invite button
    if (copyInviteBtn) {
        copyInviteBtn.onclick = () => {
            navigator.clipboard.writeText(newUrl).then(() => {
                alert("Invite link copied to clipboard!");
            });
        };
    }

    initPlayer(vId);
    listenToChat();
}

// --- Realtime Sync ---

function listenToRoomState() {
    const roomRef = ref(db, 'rooms/' + roomId);

    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Video Change check (if host changed it)
        if (player.getVideoData && data.videoId !== player.getVideoData().video_id) {
            console.log("Video changed to:", data.videoId);
            player.loadVideoById(data.videoId);
            return;
        }

        const playerState = player.getPlayerState();
        const currentTime = player.getCurrentTime();

        // Sync Play/Pause
        if (data.status === 'playing' && playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
            isRemoteUpdate = true;
            player.playVideo();
        } else if (data.status === 'paused' && playerState !== YT.PlayerState.PAUSED) {
            isRemoteUpdate = true;
            player.pauseVideo();
        }

        // Sync Time
        if (Math.abs(currentTime - data.timestamp) > SYNC_THRESHOLD) {
            console.log(`Syncing time: Local=${currentTime}, Remote=${data.timestamp}`);
            isRemoteUpdate = true;
            player.seekTo(data.timestamp);
        }
    });
}

function onPlayerStateChange(event) {
    if (isRemoteUpdate) {
        setTimeout(() => { isRemoteUpdate = false; }, 500);
        return;
    }

    const state = event.data;
    const time = player.getCurrentTime();
    const roomRef = ref(db, 'rooms/' + roomId);

    // Only update if we are active (not initial load artifacts)
    // And if we are playing or paused.

    if (state === YT.PlayerState.PLAYING) {
        update(roomRef, { status: 'playing', timestamp: time });
        sendSystemMessage(`${username} played the video.`);
    } else if (state === YT.PlayerState.PAUSED) {
        update(roomRef, { status: 'paused', timestamp: time });
        sendSystemMessage(`${username} paused the video.`);
    }
}

// Periodic sync for play time (Heartbeat)
// Only correct drift if playing
setInterval(() => {
    if (player && roomId && player.getPlayerState && player.getPlayerState() === YT.PlayerState.PLAYING) {
        // Ideally only one person updates timestamp to avoid fighting. 
        // If isHost, update.
        if (isHost) {
            update(ref(db, 'rooms/' + roomId), { timestamp: player.getCurrentTime() });
        }
    }
}, 3000);


// --- Chat ---

sendChatBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !roomId) return;

    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    push(messagesRef, {
        userId: userId,
        username: username,
        text: text,
        timestamp: serverTimestamp(),
        type: 'user'
    });

    chatInput.value = '';
}

function sendSystemMessage(text) {
    if (!roomId) return;
    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    push(messagesRef, {
        text: text,
        timestamp: serverTimestamp(),
        type: 'system'
    });
}

function listenToChat() {
    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    onValue(messagesRef, (snapshot) => {
        chatMessages.innerHTML = '';
        const validData = [];
        snapshot.forEach(child => {
            validData.push(child.val());
        });

        validData.slice(-50).forEach(msg => {
            renderMessage(msg);
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function renderMessage(msg) {
    const div = document.createElement('div');
    if (msg.type === 'system') {
        div.className = 'message system-message';
        div.textContent = msg.text;
    } else {
        div.className = 'message';
        // Sanitize text
        const content = document.createElement('span');
        content.textContent = msg.text;
        div.innerHTML = `<strong>${msg.username}:</strong> `;
        div.appendChild(content);
    }
    chatMessages.appendChild(div);
}
