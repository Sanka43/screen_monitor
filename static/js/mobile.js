// Mobile screen capture and WebRTC streaming logic
let websocket = null;
let peerConnection = null;
let localStream = null;
let sessionId = SESSION_ID;

// DOM elements
const permissionPrompt = document.getElementById('permissionPrompt');
const sharingActive = document.getElementById('sharingActive');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const statusText = document.getElementById('statusText');
const startSharingBtn = document.getElementById('startSharingBtn');
const stopSharingBtn = document.getElementById('stopSharingBtn');
const retryBtn = document.getElementById('retryBtn');
const localVideo = document.getElementById('localVideo');

// WebRTC configuration
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Connect to WebSocket on page load
connectWebSocket();

// Start screen sharing
startSharingBtn.addEventListener('click', startScreenCapture);
stopSharingBtn.addEventListener('click', stopScreenCapture);
retryBtn.addEventListener('click', () => {
    errorMessage.classList.add('hidden');
    startScreenCapture();
});

// Connect to WebSocket for signaling
function connectWebSocket() {
    const wsUrl = `ws://${window.location.host}/ws/${sessionId}`;
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
        console.log('WebSocket connected');
        statusText.textContent = 'Connected';
        statusText.className = 'status-connected';
        
        // Notify server that mobile is connected
        sendWebSocketMessage({
            type: 'mobile_connected',
            role: 'mobile'
        });
    };
    
    websocket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        await handleSignalingMessage(message);
    };
    
    websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusText.textContent = 'Connection error';
        statusText.className = 'status-error';
        showError('Failed to connect to server. Please check your connection.');
    };
    
    websocket.onclose = () => {
        console.log('WebSocket disconnected');
        statusText.textContent = 'Disconnected';
        statusText.className = 'status-disconnected';
    };
}

// Start screen capture
async function startScreenCapture() {
    try {
        statusText.textContent = 'Requesting screen access...';
        
        // Request screen capture
        // Note: getDisplayMedia() may not be available on all mobile browsers
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('Screen capture is not supported on this device/browser. Please use a supported browser like Chrome or Firefox.');
        }
        
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                mediaSource: 'screen',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        
        // Display local preview
        localVideo.srcObject = localStream;
        
        // Update UI
        permissionPrompt.classList.add('hidden');
        sharingActive.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        statusText.textContent = 'Screen captured';
        statusText.className = 'status-active';
        
        // Initialize WebRTC and start streaming
        initializePeerConnection();
        
        // Handle when user stops sharing from browser UI
        localStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopScreenCapture();
        });
        
    } catch (error) {
        console.error('Error starting screen capture:', error);
        let errorMsg = 'Failed to start screen capture. ';
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMsg += 'Permission was denied. Please allow screen sharing and try again.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMsg += 'No screen source found.';
        } else if (error.name === 'NotSupportedError') {
            errorMsg += 'Screen capture is not supported on this device/browser.';
        } else {
            errorMsg += error.message || 'Unknown error occurred.';
        }
        
        showError(errorMsg);
    }
}

// Initialize WebRTC peer connection (sender side)
function initializePeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfiguration);
    
    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendWebSocketMessage({
                type: 'ice-candidate',
                candidate: event.candidate,
                role: 'mobile'
            });
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            statusText.textContent = 'Streaming to dashboard';
            statusText.className = 'status-streaming';
        } else if (peerConnection.connectionState === 'failed') {
            statusText.textContent = 'Connection failed';
            statusText.className = 'status-error';
        }
    };
    
    // Create and send offer
    createOffer();
}

// Create WebRTC offer
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        sendWebSocketMessage({
            type: 'offer',
            offer: offer,
            role: 'mobile'
        });
    } catch (error) {
        console.error('Error creating offer:', error);
        showError('Failed to establish connection. Please try again.');
    }
}

// Handle signaling messages from dashboard
async function handleSignalingMessage(message) {
    if (!peerConnection) {
        return;
    }
    
    switch (message.type) {
        case 'answer':
            // Receive answer from dashboard
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
            break;
            
        case 'ice-candidate':
            // Add ICE candidate from dashboard
            if (message.candidate && message.role === 'dashboard') {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (error) {
                    console.error('Error adding ICE candidate:', error);
                }
            }
            break;
    }
}

// Stop screen sharing
function stopScreenCapture() {
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Clear video
    localVideo.srcObject = null;
    
    // Update UI
    permissionPrompt.classList.remove('hidden');
    sharingActive.classList.add('hidden');
    statusText.textContent = 'Stopped';
    statusText.className = 'status-stopped';
    
    // Notify server
    sendWebSocketMessage({
        type: 'disconnect',
        role: 'mobile'
    });
}

// Show error message
function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
    statusText.textContent = 'Error';
    statusText.className = 'status-error';
}

// Send message via WebSocket
function sendWebSocketMessage(message) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopScreenCapture();
    if (websocket) {
        websocket.close();
    }
});
