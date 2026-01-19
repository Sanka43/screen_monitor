import sys
import os

# Add parent directory to path to import server
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app
from mangum import Mangum

# Create ASGI handler for Vercel
handler = Mangum(app, lifespan="off")
