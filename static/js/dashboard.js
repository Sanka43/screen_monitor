// Dashboard WebRTC and UI logic
let currentSessionId = null;
let websocket = null;
let peerConnection = null;
let remoteVideo = document.getElementById('remoteVideo');
let noStreamMessage = document.getElementById('noStreamMessage');
let connectionStatus = document.getElementById('connectionStatus');

// Configuration for WebRTC
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// DOM elements
const createSessionBtn = document.getElementById('createSessionBtn');
const sessionInfo = document.getElementById('sessionInfo');
const sessionLink = document.getElementById('sessionLink');
const sessionId = document.getElementById('sessionId');
const sessionStatus = document.getElementById('sessionStatus');
const copyLinkBtn = document.getElementById('copyLinkBtn');

// Create new session
createSessionBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to create session');
        }
        
        const data = await response.json();
        currentSessionId = data.session_id;
        
        // Update UI
        sessionLink.value = data.mobile_url;
        sessionId.textContent = data.session_id;
        sessionInfo.classList.remove('hidden');
        sessionStatus.textContent = 'Pending';
        
        // Connect to WebSocket
        connectWebSocket();
        
    } catch (error) {
        console.error('Error creating session:', error);
        alert('Failed to create session. Please try again.');
    }
});

// Copy link to clipboard
copyLinkBtn.addEventListener('click', () => {
    sessionLink.select();
    document.execCommand('copy');
    
    // Visual feedback
    const originalText = copyLinkBtn.textContent;
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyLinkBtn.textContent = originalText;
    }, 2000);
});

// WebSocket connection for signaling
function connectWebSocket() {
    if (!currentSessionId) return;
    
    const wsUrl = `ws://${window.location.host}/ws/${currentSessionId}`;
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
        console.log('WebSocket connected');
        connectionStatus.textContent = 'Connected (waiting for mobile)';
        connectionStatus.className = 'status-connected';
        
        // Notify server that dashboard is connected
        sendWebSocketMessage({
            type: 'dashboard_connected',
            role: 'dashboard'
        });
        
        // Initialize WebRTC peer connection
        initializePeerConnection();
    };
    
    websocket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        await handleSignalingMessage(message);
    };
    
    websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectionStatus.textContent = 'Connection error';
        connectionStatus.className = 'status-error';
    };
    
    websocket.onclose = () => {
        console.log('WebSocket disconnected');
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'status-disconnected';
    };
}

// Initialize WebRTC peer connection (receiver side)
function initializePeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfiguration);
    
    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        console.log('Received remote stream');
        remoteVideo.srcObject = event.streams[0];
        noStreamMessage.style.display = 'none';
        connectionStatus.textContent = 'Streaming active';
        connectionStatus.className = 'status-streaming';
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendWebSocketMessage({
                type: 'ice-candidate',
                candidate: event.candidate,
                role: 'dashboard'
            });
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
            connectionStatus.textContent = 'Connection failed';
            connectionStatus.className = 'status-error';
        }
    };
}

// Handle signaling messages from mobile
async function handleSignalingMessage(message) {
    if (!peerConnection) {
        initializePeerConnection();
    }
    
    switch (message.type) {
        case 'offer':
            // Receive offer from mobile, create answer
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            sendWebSocketMessage({
                type: 'answer',
                answer: answer,
                role: 'dashboard'
            });
            break;
            
        case 'ice-candidate':
            // Add ICE candidate from mobile
            if (message.candidate && message.role === 'mobile') {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (error) {
                    console.error('Error adding ICE candidate:', error);
                }
            }
            break;
            
        case 'mobile_connected':
            sessionStatus.textContent = 'Mobile connected';
            connectionStatus.textContent = 'Mobile device connected';
            break;
            
        case 'disconnect':
            if (message.role === 'mobile') {
                sessionStatus.textContent = 'Mobile disconnected';
                connectionStatus.textContent = 'Mobile disconnected';
                noStreamMessage.style.display = 'block';
                remoteVideo.srcObject = null;
            }
            break;
    }
}

// Send message via WebSocket
function sendWebSocketMessage(message) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (websocket) {
        sendWebSocketMessage({
            type: 'disconnect',
            role: 'dashboard'
        });
        websocket.close();
    }
    if (peerConnection) {
        peerConnection.close();
    }
});
