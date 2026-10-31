# ai-agent/app/adapters/external_retailer.py
import httpx
from typing import List, Dict, Any, Optional
from app.adapters.base import BaseStoreAdapter
from app.core.circuit_breaker import CircuitBreaker, CircuitBreakerOpenException

# Sample sandbox catalog for authorized external quick-commerce retailers
SANDBOX_EXTERNAL_CATALOG = {
    "ext_blinkit": [
        {"id": "blk_rice_1", "name": "India Gate Basmati Rice Feast", "category": "grains", "price": 82.0, "mrp": 110.0, "discount": 25.0, "unit": "1kg", "emoji": "🌾", "stock": 40},
        {"id": "blk_milk_1", "name": "Amul Taaza Homogenised Milk", "category": "dairy", "price": 54.0, "mrp": 56.0, "discount": 4.0, "unit": "1L", "emoji": "🥛", "stock": 35},
        {"id": "blk_veg_1", "name": "Fresh Hybrid Tomatoes", "category": "vegetables", "price": 38.0, "mrp": 50.0, "discount": 24.0, "unit": "1kg", "emoji": "🍅", "stock": 60},
        {"id": "blk_oil_1", "name": "Fortune Sunlite Refined Sunflower Oil", "category": "staples", "price": 135.0, "mrp": 160.0, "discount": 15.0, "unit": "1L", "emoji": "🌻", "stock": 25}
    ],
    "ext_zepto": [
        {"id": "zpt_rice_1", "name": "Daawat Rozana Gold Basmati Rice", "category": "grains", "price": 79.0, "mrp": 105.0, "discount": 24.0, "unit": "1kg", "emoji": "🌾", "stock": 50},
        {"id": "zpt_veg_1", "name": "Farm Fresh Potatoes", "category": "vegetables", "price": 32.0, "mrp": 45.0, "discount": 28.0, "unit": "1kg", "emoji": "🥔", "stock": 70},
        {"id": "zpt_dal_1", "name": "Tata Sampann Unpolished Toor Dal", "category": "pulses", "price": 148.0, "mrp": 175.0, "discount": 15.0, "unit": "1kg", "emoji": "🥣", "stock": 30},
        {"id": "zpt_milk_1", "name": "Mother Dairy Classic Curd", "category": "dairy", "price": 35.0, "mrp": 40.0, "discount": 12.0, "unit": "400g", "emoji": "🥛", "stock": 45}
    ]
}

class ExternalRetailerAdapter(BaseStoreAdapter):
    """
    Adapter for authorized third-party external grocery retailers (e.g. Blinkit, Zepto).
    Equipped with circuit-breaker resilience to isolate external network or API disruptions.
    """
    def __init__(
        self,
        retailer_id: str,
        name: str,
        api_base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        delivery_fee: float = 35.0,
        avg_delivery_mins: int = 15,
        rating: float = 4.7,
        emoji: str = "⚡",
        area: str = "Central Hub"
    ):
        super().__init__(
            store_id=retailer_id,
            name=name,
            delivery_fee=delivery_fee,
            avg_delivery_mins=avg_delivery_mins,
            rating=rating,
            emoji=emoji,
            area=area
        )
        self.api_base_url = api_base_url
        self.auth_token = auth_token
        self.circuit_breaker = CircuitBreaker(name=retailer_id, failure_threshold=3, recovery_timeout_sec=10.0)

    async def _fetch_from_api(self, query: str, category: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Call live external retailer REST API endpoint."""
        headers = {"Authorization": f"Bearer {self.auth_token}"} if self.auth_token else {}
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                f"{self.api_base_url}/search",
                params={"query": query, "category": category, "limit": limit},
                headers=headers
            )
            resp.raise_for_status()
            return resp.json().get("items", [])

    async def search_items(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Search external retailer inventory with circuit-breaker fallback.
        """
        # If external API URL is provided, call live API protected by circuit breaker
        if self.api_base_url:
            try:
                raw_items = await self.circuit_breaker.execute(
                    self._fetch_from_api, query=query, category=category, limit=limit
                )
                return self._format_items(raw_items)
            except (CircuitBreakerOpenException, Exception) as e:
                print(f"[ExternalRetailer:{self.store_id}] External call failed: {e}. Falling back to sandbox.")
                # Fallback to sandbox below

        # Sandbox / Local Mock Catalog Resolution
        sandbox_items = SANDBOX_EXTERNAL_CATALOG.get(self.store_id, [])
        q_lower = query.lower().strip()
        matched = []

        for it in sandbox_items:
            name_match = q_lower in it["name"].lower() or any(w in it["name"].lower() for w in q_lower.split())
            cat_match = category and (category.lower() == it["category"].lower())
            if name_match or cat_match:
                matched.append(it)
                if len(matched) >= limit:
                    break

        return self._format_items(matched)

    def _format_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        formatted = []
        for it in items:
            formatted.append({
                "productId": str(it.get("id") or it.get("productId")),
                "name": it.get("name"),
                "category": it.get("category", "groceries"),
                "price": float(it.get("price", 0.0)),
                "mrp": float(it.get("mrp") or it.get("price")),
                "discount": float(it.get("discount", 0.0)),
                "unit": it.get("unit", "1 pack"),
                "emoji": it.get("emoji", self.emoji),
                "stock": int(it.get("stock", 50)),
                "isAvailable": True,
                "rating": self.rating,
                "isExternalRetailer": True,
                "store": self.get_metadata()
            })
        return formatted

    async def check_inventory(self, product_id: str, required_qty: float) -> Dict[str, Any]:
        """Verify external stock availability."""
        sandbox_items = SANDBOX_EXTERNAL_CATALOG.get(self.store_id, [])
        match = next((i for i in sandbox_items if i["id"] == product_id), None)
        if match:
            in_stock = match["stock"] >= required_qty
            return {
                "available": in_stock,
                "currentStock": match["stock"],
                "price": match["price"],
                "reason": "OK" if in_stock else "Out of stock at external hub"
            }
        return {"available": True, "currentStock": 50, "price": 50.0, "reason": "OK"}

    def format_order_dispatch_payload(self, child_order: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format retailer-specific order payload for external dispatch / affiliate webhook.
        """
        return {
            "partnerRetailer": self.store_id,
            "externalDispatchId": f"EXT-DISP-{child_order.get('orderId')}",
            "customer": {
                "deliveryAddress": child_order.get("delivery", {}).get("address"),
                "notes": child_order.get("delivery", {}).get("notes")
            },
            "lineItems": [
                {
                    "sku": item.get("product"),
                    "name": item.get("name"),
                    "quantity": item.get("quantity"),
                    "expectedPrice": item.get("price")
                }
                for item in child_order.get("items", [])
            ],
            "totalPayable": child_order.get("pricing", {}).get("total"),
            "dispatchUrgency": "immediate_15m"
        }
