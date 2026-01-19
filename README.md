# Screen Monitoring System

A web application that allows users to generate shareable links. When opened on mobile devices, the mobile screen is captured and streamed to a monitoring dashboard in real-time.

## Features

- Generate unique shareable links for screen monitoring sessions
- Real-time screen streaming from mobile devices to dashboard
- WebRTC-based peer-to-peer communication
- Responsive web interface for both dashboard and mobile devices

## Architecture

The system consists of:
- **Backend Server** (Python FastAPI): Handles link generation, session management, and WebRTC signaling
- **Frontend Dashboard**: Web interface to create links and view streamed screens
- **Mobile Web Page**: Captures screen using WebRTC and streams to the monitoring system
- **WebRTC Signaling**: Real-time communication for establishing peer connections

## Installation

1. Clone or navigate to the project directory:
```bash
cd scrnmo
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Usage

1. Start the server:
```bash
python server.py
```

Or using uvicorn directly:
```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

2. Open the dashboard in your browser:
```
http://localhost:8000
```

3. Click "Create Link" to generate a new monitoring session

4. Open the generated link on a mobile device to start screen sharing

## API Endpoints

- `GET /`: Dashboard page
- `GET /mobile/{session_id}`: Mobile screen capture page
- `POST /api/create-session`: Create a new monitoring session
- `GET /api/session/{session_id}`: Get session status
- `WS /ws/{session_id}`: WebSocket endpoint for WebRTC signaling

## Technology Stack

- **Backend**: FastAPI (Python) with WebSocket support
- **Frontend**: HTML/CSS/JavaScript (vanilla)
- **WebRTC**: For peer-to-peer screen sharing
- **Signaling**: WebSocket for WebRTC signaling

## Limitations & Notes

- iOS Safari has limited WebRTC support - may require native app for full functionality
- Screen capture requires user permission on mobile browsers
- Some mobile browsers may not support `getDisplayMedia()` - fallback messaging needed
- For production, consider adding:
  - STUN/TURN servers for NAT traversal
  - Authentication/authorization
  - Session persistence (database)
  - Rate limiting
  - HTTPS/SSL certificates

## Development

The project structure:
```
scrnmo/
├── server.py                 # FastAPI backend server
├── requirements.txt          # Python dependencies
├── static/
│   ├── css/
│   │   └── style.css        # Dashboard styling
│   └── js/
│       ├── dashboard.js     # Dashboard WebRTC logic
│       └── mobile.js        # Mobile capture logic
├── templates/
│   ├── dashboard.html       # Main monitoring dashboard
│   └── mobile.html          # Mobile screen capture page
└── README.md                # Setup and usage instructions
```
