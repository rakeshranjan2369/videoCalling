let localStream;
let peer;
let currentCall;
let isAudioMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let originalStream;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// DOM elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const roomIdElement = document.getElementById('roomId');
const peerIdInput = document.getElementById('peerIdInput');
const connectBtn = document.getElementById('connectBtn');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const endCallBtn = document.getElementById('endCallBtn');
const connectionStatus = document.getElementById('connectionStatus');
const notification = document.getElementById('notification');

// Show notification
function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = 'notification ' + type;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Initialize the app
async function init() {
    try {
        connectionStatus.textContent = 'Requesting camera and microphone access...';
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        }).catch(err => {
            if (err.name === 'NotAllowedError') {
                throw new Error('Camera and microphone access denied. Please allow access to use this app.');
            } else if (err.name === 'NotFoundError') {
                throw new Error('No camera or microphone found. Please check your device connections.');
            } else {
                throw err;
            }
        });
        
        // Save original stream for toggling screen share
        originalStream = localStream;
        
        // Show local video
        localVideo.srcObject = localStream;
        
        // Enable control buttons once we have media
        muteBtn.disabled = false;
        videoBtn.disabled = false;
        screenShareBtn.disabled = false;
        
        connectionStatus.textContent = 'Initializing connection...';
        
        // Initialize peer connection with more robust error handling
        initializePeerConnection();
        
        // Set up the connect button
        connectBtn.addEventListener('click', connectToPeer);
        
        // Set up control buttons
        muteBtn.addEventListener('click', toggleAudio);
        videoBtn.addEventListener('click', toggleVideo);
        screenShareBtn.addEventListener('click', toggleScreenShare);
        endCallBtn.addEventListener('click', endCall);
        
        showNotification('Video call app initialized successfully', 'success');
        
    } catch (err) {
        console.error('Initialization error:', err);
        connectionStatus.textContent = 'Error: ' + err.message;
        connectionStatus.className = 'status-disconnected';
        showNotification(err.message, 'error');
    }
}

// Initialize PeerJS connection with error handling
function initializePeerConnection() {
    try {
        // Close any existing peer connection
        if (peer) {
            peer.destroy();
        }
        
        // Create new peer connection with more reliable STUN/TURN servers
        peer = new Peer({
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    // Add free STUN servers from Twilio or other providers if needed
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            },
            debug: 3, // Increased debug level for better troubleshooting
            // Ensure connection is reliable
            host: 'peerjs.com', // Use the public PeerJS server (or replace with your own)
            secure: true, // Use HTTPS
            port: 443
        });
        
        // When peer is open, show the ID
        peer.on('open', (id) => {
            roomIdElement.textContent = id;
            connectionStatus.textContent = 'Ready to connect';
            connectionStatus.className = '';
            
            // Reset reconnect attempts on successful connection
            reconnectAttempts = 0;
            
            console.log("PeerJS connection established with ID:", id);
        });
        
        // Handle incoming calls
        peer.on('call', (call) => {
            connectionStatus.textContent = 'Incoming call...';
            connectionStatus.className = 'status-connecting';
            showNotification('Incoming call', 'info');
            console.log("Incoming call from peer:", call.peer);
            
            // Answer the call with explicit media stream to ensure connection
            call.answer(localStream);
            currentCall = call;
            
            // Enable end call button
            endCallBtn.disabled = false;
            
            // Handle stream event
            handleCallStream(call);
        });
        
        // Handle disconnections
        peer.on('disconnected', () => {
            connectionStatus.textContent = 'Connection lost. Attempting to reconnect...';
            connectionStatus.className = 'status-disconnected';
            console.log("Peer disconnected. Attempting to reconnect...");
            
            // Try to reconnect
            setTimeout(() => {
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(`Reconnect attempt ${reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS}`);
                    peer.reconnect();
                } else {
                    connectionStatus.textContent = 'Could not reconnect after multiple attempts. Please refresh the page.';
                    showNotification('Connection failed. Please refresh the page.', 'error');
                }
            }, 2000);
        });
        
        // Handle connection closing
        peer.on('close', () => {
            connectionStatus.textContent = 'Connection closed';
            connectionStatus.className = 'status-disconnected';
            endCallBtn.disabled = true;
            console.log("Peer connection closed");
        });
        
        // Handle errors
        peer.on('error', (err) => {
            console.error('Peer connection error:', err);
            let errorMessage = 'Connection error';
            
            // Handle specific error types
            if (err.type === 'peer-unavailable') {
                errorMessage = 'Peer not found. Check the ID and try again.';
            } else if (err.type === 'network') {
                errorMessage = 'Network error. Please check your connection.';
            } else if (err.type === 'server-error') {
                errorMessage = 'Server error. Please try again later.';
            } else if (err.type === 'browser-incompatible') {
                errorMessage = 'Your browser may not fully support WebRTC. Try using Chrome or Firefox.';
            } else if (err.type === 'socket-error') {
                errorMessage = 'Socket connection error. Please refresh and try again.';
                // Try to re-initialize the connection
                setTimeout(initializePeerConnection, 3000);
            } else if (err.type === 'socket-closed') {
                errorMessage = 'Connection to server lost. Attempting to reconnect...';
                // Try to re-initialize the connection
                setTimeout(initializePeerConnection, 3000);
            }
            
            connectionStatus.textContent = errorMessage;
            connectionStatus.className = 'status-disconnected';
            showNotification(errorMessage, 'error');
            
            // If we're in a call, end it
            if (currentCall) {
                currentCall = null;
                remoteVideo.srcObject = null;
                endCallBtn.disabled = true;
            }
        });
        
    } catch (err) {
        console.error('Error initializing peer connection:', err);
        connectionStatus.textContent = 'Connection initialization failed';
        connectionStatus.className = 'status-disconnected';
        showNotification('Failed to initialize connection', 'error');
    }
}

// Connect to a peer
function connectToPeer() {
    const peerId = peerIdInput.value.trim();
    
    if (!peerId) {
        showNotification('Please enter a valid Peer ID', 'error');
        return;
    }
    
    connectionStatus.textContent = 'Connecting...';
    connectionStatus.className = 'status-connecting';
    console.log("Attempting to connect to peer:", peerId);
    
    try {
        // Make sure we're not already in a call
        if (currentCall) {
            currentCall.close();
        }
        
        // Verify peer connection is ready
        if (!peer || !peer.id) {
            console.log("Peer connection not ready, reinitializing...");
            initializePeerConnection();
            setTimeout(() => connectToPeer(), 2000);
            return;
        }
        
        // Call the peer with reliable options
        const callOptions = {
            metadata: {
                callerName: "User", // Optional: Can be used to display caller name
                timestamp: Date.now()
            },
            sdpTransform: (sdp) => {
                // This can be used to modify SDP if needed for compatibility
                return sdp;
            }
        };
        
        const call = peer.call(peerId, localStream, callOptions);
        
        if (!call) {
            throw new Error('Failed to initiate call');
        }
        
        console.log("Call initiated to peer:", peerId);
        currentCall = call;
        
        // Enable end call button
        endCallBtn.disabled = false;
        
        // Handle stream event
        handleCallStream(call);
        
    } catch (err) {
        console.error('Error connecting to peer:', err);
        connectionStatus.textContent = 'Connection failed';
        connectionStatus.className = 'status-disconnected';
        showNotification('Failed to connect: ' + err.message, 'error');
    }
}

// Handle call stream
function handleCallStream(call) {
    console.log("Setting up call handlers for", call.peer);
    
    // Set timeout for connection
    const connectionTimeout = setTimeout(() => {
        if (!remoteVideo.srcObject) {
            connectionStatus.textContent = 'Connection timed out';
            connectionStatus.className = 'status-disconnected';
            showNotification('Connection timed out. The other user may not be available.', 'error');
            call.close();
            currentCall = null;
            endCallBtn.disabled = true;
        }
    }, 30000);
    
    call.on('stream', (remoteStream) => {
        // Clear timeout as we got the stream
        clearTimeout(connectionTimeout);
        
        console.log("Received remote stream");
        
        // Show remote video - with additional checks to ensure proper display
        remoteVideo.srcObject = remoteStream;
        
        // Make sure video track is enabled and playing
        if (remoteStream.getVideoTracks().length > 0) {
            const videoTrack = remoteStream.getVideoTracks()[0];
            if (videoTrack.enabled) {
                console.log("Remote video track is enabled");
            } else {
                console.log("Remote video track is disabled");
                videoTrack.enabled = true;
            }
        } else {
            console.log("No video tracks in remote stream");
        }
        
        // Ensure audio is playing (if available)
        if (remoteStream.getAudioTracks().length > 0) {
            const audioTrack = remoteStream.getAudioTracks()[0];
            if (audioTrack.enabled) {
                console.log("Remote audio track is enabled");
            } else {
                console.log("Remote audio track is disabled");
                audioTrack.enabled = true;
            }
        } else {
            console.log("No audio tracks in remote stream");
        }
        
        // Additional check to ensure video is playing
        remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(err => {
                console.error("Error playing remote video:", err);
                showNotification("Error displaying remote video. Try refreshing.", "error");
            });
        };
        
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status-connected';
        showNotification('Call connected successfully', 'success');
    });
    
    call.on('close', () => {
        // Clear timeout if call closes before connection
        clearTimeout(connectionTimeout);
        
        console.log("Call closed");
        connectionStatus.textContent = 'Call ended';
        connectionStatus.className = 'status-disconnected';
        remoteVideo.srcObject = null;
        currentCall = null;
        endCallBtn.disabled = true;
        showNotification('Call ended', 'info');
    });
    
    call.on('error', (err) => {
        // Clear timeout if error occurs
        clearTimeout(connectionTimeout);
        
        console.error('Call error:', err);
        connectionStatus.textContent = 'Call error: ' + (err.message || 'Unknown error');
        connectionStatus.className = 'status-disconnected';
        remoteVideo.srcObject = null;
        currentCall = null;
        endCallBtn.disabled = true;
        showNotification('Call error: ' + (err.message || 'Unknown error'), 'error');
    });
    
    // Monitor connection state periodically
    const connectionCheckInterval = setInterval(() => {
        if (!currentCall || currentCall !== call) {
            clearInterval(connectionCheckInterval);
            return;
        }
        
        if (!remoteVideo.srcObject && Date.now() - call.metadata?.timestamp > 10000) {
            console.log("Connection seems stalled, attempting to refresh...");
            
            // Try to reinitiate stream if we still don't have one after 10 seconds
            if (call.peerConnection && call.peerConnection.iceConnectionState === 'failed') {
                console.log("ICE connection failed, attempting to reconnect");
                showNotification("Connection problem detected. Trying to reconnect...", "error");
                
                // Try reconnecting by closing and reinitiating
                const peerId = call.peer;
                call.close();
                setTimeout(() => {
                    if (peer && peer.id) {
                        const newCall = peer.call(peerId, localStream);
                        if (newCall) {
                            currentCall = newCall;
                            handleCallStream(newCall);
                        }
                    }
                }, 2000);
                
                clearInterval(connectionCheckInterval);
            }
        }
    }, 5000);
}

// Toggle audio
function toggleAudio() {
    try {
        if (localStream) {
            const audioTracks = localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                isAudioMuted = !isAudioMuted;
                audioTracks[0].enabled = !isAudioMuted;
                muteBtn.textContent = isAudioMuted ? 'Unmute Audio' : 'Mute Audio';
                showNotification(isAudioMuted ? 'Audio muted' : 'Audio unmuted', 'info');
            } else {
                showNotification('No audio track found', 'error');
            }
        }
    } catch (err) {
        console.error('Error toggling audio:', err);
        showNotification('Failed to toggle audio', 'error');
    }
}

// Toggle video
function toggleVideo() {
    try {
        if (localStream) {
            const videoTracks = localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                isVideoOff = !isVideoOff;
                videoTracks[0].enabled = !isVideoOff;
                videoBtn.textContent = isVideoOff ? 'Start Video' : 'Stop Video';
                showNotification(isVideoOff ? 'Video stopped' : 'Video started', 'info');
            } else {
                showNotification('No video track found', 'error');
            }
        }
    } catch (err) {
        console.error('Error toggling video:', err);
        showNotification('Failed to toggle video', 'error');
    }
}

// Toggle screen sharing
async function toggleScreenShare() {
    try {
        if (isScreenSharing) {
            // Switch back to camera
            localStream = originalStream;
            screenShareBtn.textContent = 'Share Screen';
            showNotification('Screen sharing stopped', 'info');
        } else {
            // Switch to screen sharing
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            }).catch(err => {
                if (err.name === 'NotAllowedError') {
                    throw new Error('Screen sharing permission denied');
                } else {
                    throw err;
                }
            });
            
            // Keep audio from original stream if it exists
            if (originalStream) {
                const audioTrack = originalStream.getAudioTracks()[0];
                if (audioTrack) {
                    screenStream.addTrack(audioTrack);
                }
            }
            
            localStream = screenStream;
            screenShareBtn.textContent = 'Stop Sharing';
            showNotification('Screen sharing started', 'success');
            
            // Handle the case when user stops sharing via browser UI
            screenStream.getVideoTracks()[0].onended = () => {
                if (isScreenSharing) {
                    toggleScreenShare();
                }
            };
        }
        
        // Update local video
        localVideo.srcObject = localStream;
        
        // Update the call if in progress
        if (currentCall) {
            try {
                // Rather than closing and recreating the call (which often fails),
                // try to replace tracks if the browser supports it
                if (currentCall.peerConnection && 
                    typeof currentCall.peerConnection.getSenders === 'function') {
                    
                    const senders = currentCall.peerConnection.getSenders();
                    const videoSender = senders.find(sender => 
                        sender.track && sender.track.kind === 'video');
                    
                    if (videoSender) {
                        const newVideoTrack = localStream.getVideoTracks()[0];
                        if (newVideoTrack) {
                            console.log("Replacing video track for ongoing call");
                            videoSender.replaceTrack(newVideoTrack)
                                .then(() => {
                                    showNotification('Media updated successfully', 'success');
                                })
                                .catch(err => {
                                    console.error("Error replacing track:", err);
                                    // Fall back to the old method if track replacement fails
                                    replaceCallWithNewStream();
                                });
                            return;
                        }
                    }
                    
                    // If we couldn't find a video sender or track, fall back to old method
                    replaceCallWithNewStream();
                } else {
                    // Fall back to old method for browsers that don't support getSenders
                    replaceCallWithNewStream();
                }
            } catch (err) {
                console.error('Error updating call:', err);
                showNotification('Failed to update call with screen sharing', 'error');
            }
        }
        
        isScreenSharing = !isScreenSharing;
        
    } catch (err) {
        console.error('Error sharing screen:', err);
        showNotification('Screen sharing error: ' + err.message, 'error');
    }
    
    // Helper function to create a new call with the updated stream
    function replaceCallWithNewStream() {
        const peerId = currentCall.peer;
        currentCall.close();
        
        // Small delay to ensure everything is updated
        setTimeout(() => {
            try {
                const newCall = peer.call(peerId, localStream);
                if (newCall) {
                    currentCall = newCall;
                    handleCallStream(newCall);
                } else {
                    throw new Error('Failed to create new call');
                }
            } catch (err) {
                console.error('Error creating new call:', err);
                connectionStatus.textContent = 'Failed to update call with screen share';
                connectionStatus.className = 'status-disconnected';
                showNotification('Failed to update call. Please reconnect.', 'error');
            }
        }, 1000);
    }
}

// End the call
function endCall() {
    try {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
            remoteVideo.srcObject = null;
            connectionStatus.textContent = 'Call ended';
            connectionStatus.className = 'status-disconnected';
            endCallBtn.disabled = true;
            showNotification('Call ended', 'info');
        }
    } catch (err) {
        console.error('Error ending call:', err);
        showNotification('Error ending call', 'error');
        
        // Force cleanup in case of error
        currentCall = null;
        remoteVideo.srcObject = null;
        endCallBtn.disabled = true;
    }
}

// Handle page unload to clean up connections
window.addEventListener('beforeunload', () => {
    if (currentCall) {
        currentCall.close();
    }
    if (peer) {
        peer.destroy();
    }
});

// Add a helper function to check WebRTC connection health
function checkConnectivity() {
    if (!navigator.onLine) {
        connectionStatus.textContent = 'You are offline. Please check your internet connection.';
        connectionStatus.className = 'status-disconnected';
        showNotification('Internet connection lost', 'error');
        return false;
    }
    
    if (peer && !peer.disconnected && peer.id) {
        return true;
    }
    
    // If peer connection isn't healthy, try to reinitialize
    console.log("Peer connection unhealthy, attempting to reinitialize...");
    initializePeerConnection();
    return false;
}

// Check connectivity periodically
setInterval(checkConnectivity, 10000);

// Initialize when page loads
window.addEventListener('load', init);
