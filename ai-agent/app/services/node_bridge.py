# ai-agent/app/services/node_bridge.py
import os
import httpx
from typing import List, Dict, Any, Optional

NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://127.0.0.1:5000").rstrip("/")
AGENT_BRIDGE_SECRET = os.getenv("AGENT_BRIDGE_SECRET", "grodealz_agent_internal_secret")

class NodeDiscoveryBridgeClient:
    """
    Async client for Python Agent <-> Node.js Express discovery bridge.
    Fetches active MongoDB catalog items, live store data, and verifies stock.
    """
    def __init__(self, base_url: str = NODE_BACKEND_URL, secret: str = AGENT_BRIDGE_SECRET):
        self.base_url = base_url
        self.headers = {
            "x-agent-bridge-secret": secret,
            "Content-Type": "application/json"
        }

    async def search_products(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        store_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Query live MongoDB products matching search term or category."""
        params: Dict[str, Any] = {"limit": limit}
        if query:
            params["q"] = query
        if category:
            params["category"] = category
        if store_id:
            params["storeId"] = store_id

        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                resp = await client.get(
                    f"{self.base_url}/api/agent-bridge/products/search",
                    params=params,
                    headers=self.headers
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("products", [])
            except Exception as e:
                # Log or handle connection gracefully
                print(f"[NodeDiscoveryBridge] Error searching products: {e}")
                return []

    async def get_active_stores(self) -> List[Dict[str, Any]]:
        """Retrieve all active operational stores."""
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                resp = await client.get(
                    f"{self.base_url}/api/agent-bridge/stores/active",
                    headers=self.headers
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("stores", [])
            except Exception as e:
                print(f"[NodeDiscoveryBridge] Error fetching stores: {e}")
                return []

    async def check_inventory(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Verify real-time stock availability and current prices for product list."""
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/api/agent-bridge/inventory/check",
                    json={"items": items},
                    headers=self.headers
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                print(f"[NodeDiscoveryBridge] Error checking inventory: {e}")
                return {"success": False, "allAvailable": False, "items": []}

bridge_client = NodeDiscoveryBridgeClient()
