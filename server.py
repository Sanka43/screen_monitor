import uuid
import json
from typing import Dict, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
import uvicorn

app = FastAPI()

# Mount static files and templates
# Handle paths for both local and Vercel deployment
import os
static_dir = os.path.join(os.path.dirname(__file__), "static")
templates_dir = os.path.join(os.path.dirname(__file__), "templates")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

# In-memory session storage
sessions: Dict[str, dict] = {}
# WebSocket connections: session_id -> set of WebSocket connections
websocket_connections: Dict[str, Set[WebSocket]] = {}


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve the landing page"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Serve the dashboard page"""
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/mobile/{session_id}", response_class=HTMLResponse)
async def mobile_page(request: Request, session_id: str):
    """Serve the mobile screen capture page"""
    # Verify session exists
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return templates.TemplateResponse("mobile.html", {
        "request": request,
        "session_id": session_id
    })


@app.post("/api/create-session")
async def create_session():
    """Create a new monitoring session and return the shareable link"""
    session_id = str(uuid.uuid4())
    
    sessions[session_id] = {
        "id": session_id,
        "status": "pending",
        "created_at": None,
        "mobile_connected": False,
        "dashboard_connected": False
    }
    
    websocket_connections[session_id] = set()
    
    # Get the base URL (in production, this should be configurable)
    import os
    base_url = os.environ.get("VERCEL_URL", "http://localhost:8000")
    if base_url and not base_url.startswith("http"):
        base_url = f"https://{base_url}"
    mobile_url = f"{base_url}/mobile/{session_id}"
    
    return {
        "session_id": session_id,
        "mobile_url": mobile_url,
        "status": "created"
    }


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """Get session status"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id].copy()
    session["connections_count"] = len(websocket_connections.get(session_id, set()))
    
    return session


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for WebRTC signaling"""
    # Verify session exists
    if session_id not in sessions:
        await websocket.close(code=1008, reason="Session not found")
        return
    
    await websocket.accept()
    
    # Add connection to the session
    if session_id not in websocket_connections:
        websocket_connections[session_id] = set()
    websocket_connections[session_id].add(websocket)
    
    # Update session status
    sessions[session_id]["status"] = "active"
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Broadcast message to all other connections in the same session
            # This enables signaling between mobile and dashboard
            for conn in websocket_connections[session_id]:
                if conn != websocket:  # Don't send back to sender
                    try:
                        await conn.send_text(data)
                    except Exception as e:
                        # Remove dead connections
                        websocket_connections[session_id].discard(conn)
            
            # Handle connection type messages
            if message.get("type") == "mobile_connected":
                sessions[session_id]["mobile_connected"] = True
            elif message.get("type") == "dashboard_connected":
                sessions[session_id]["dashboard_connected"] = True
            elif message.get("type") == "disconnect":
                if message.get("role") == "mobile":
                    sessions[session_id]["mobile_connected"] = False
                elif message.get("role") == "dashboard":
                    sessions[session_id]["dashboard_connected"] = False
                
    except WebSocketDisconnect:
        # Remove connection from session
        websocket_connections[session_id].discard(websocket)
        
        # Update session status if no connections remain
        if len(websocket_connections[session_id]) == 0:
            sessions[session_id]["status"] = "disconnected"
    except Exception as e:
        # Remove connection on error
        websocket_connections[session_id].discard(websocket)
        print(f"WebSocket error: {e}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
