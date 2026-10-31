# ai-agent/app/adapters/mongo_adapter.py
from typing import List, Dict, Any, Optional
from app.adapters.base import BaseStoreAdapter
from app.services.node_bridge import bridge_client

class MongoStoreAdapter(BaseStoreAdapter):
    """
    Adapter for internal GroDealz stores residing in MongoDB.
    Uses the Node.js Discovery Bridge to query store-specific inventory.
    """
    def __init__(
        self,
        store_id: str,
        name: str,
        delivery_fee: float = 30.0,
        avg_delivery_mins: int = 25,
        rating: float = 4.5,
        emoji: str = "🏪",
        area: str = "Imphal"
    ):
        super().__init__(
            store_id=store_id,
            name=name,
            delivery_fee=delivery_fee,
            avg_delivery_mins=avg_delivery_mins,
            rating=rating,
            emoji=emoji,
            area=area
        )

    async def search_items(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search products available in this store via Node discovery bridge."""
        products = await bridge_client.search_products(
            query=query,
            category=category,
            store_id=self.store_id,
            limit=limit
        )

        formatted = []
        for p in products:
            formatted.append({
                "productId": str(p.get("_id") or p.get("productId", "")),
                "name": p.get("name", "Product"),
                "category": p.get("category", "groceries"),
                "price": float(p.get("price", 0.0)),
                "mrp": float(p.get("mrp") or p.get("price", 0.0)),
                "discount": float(p.get("discount", 0.0)),
                "unit": p.get("unit", "1 pack"),
                "emoji": p.get("emoji", "🛒"),
                "stock": int(p.get("stock", {}).get("quantity", 50)),
                "isAvailable": bool(p.get("stock", {}).get("isAvailable", True)),
                "rating": float(p.get("ratings", {}).get("average", 4.0)),
                "store": self.get_metadata()
            })

        return formatted

    async def check_inventory(
        self,
        product_id: str,
        required_qty: float
    ) -> Dict[str, Any]:
        """Check live stock availability via Node bridge."""
        res = await bridge_client.check_inventory([{"productId": product_id, "quantity": required_qty}])
        items = res.get("items", [])
        if items:
            it = items[0]
            return {
                "available": it.get("available", False),
                "currentStock": it.get("currentStock", 0),
                "price": it.get("price", 0.0),
                "reason": it.get("reason", "OK")
            }
        return {"available": False, "currentStock": 0, "price": 0.0, "reason": "Not found"}
