# ai-agent/app/adapters/registry.py
import asyncio
from typing import List, Dict, Any, Optional
from app.adapters.base import BaseStoreAdapter
from app.adapters.mongo_adapter import MongoStoreAdapter
from app.adapters.external_retailer import ExternalRetailerAdapter
from app.services.node_bridge import bridge_client

# Default mock/fallback stores when Node is offline or during testing
DEFAULT_STORES = [
    {
        "id": "store_fresh_mart",
        "name": "Fresh Mart Organics",
        "deliveryFee": 30.0,
        "avgDeliveryMins": 25,
        "rating": 4.8,
        "emoji": "🥬",
        "area": "Paona Bazar"
    },
    {
        "id": "store_daily_needs",
        "name": "Daily Needs Superstore",
        "deliveryFee": 30.0,
        "avgDeliveryMins": 30,
        "rating": 4.6,
        "emoji": "🏪",
        "area": "Thangal Bazar"
    },
    {
        "id": "store_metro_cash",
        "name": "Metro Wholesale Mart",
        "deliveryFee": 35.0,
        "avgDeliveryMins": 40,
        "rating": 4.4,
        "emoji": "🛒",
        "area": "Uripok"
    }
]

class StoreAdapterRegistry:
    """
    Registry that manages store adapters (both internal Mongo stores & external retailers)
    and enables parallel catalog querying.
    """
    def __init__(self):
        self._adapters: Dict[str, BaseStoreAdapter] = {}

    def register_adapter(self, adapter: BaseStoreAdapter):
        """Register a store adapter instance."""
        self._adapters[adapter.store_id] = adapter

    def get_adapter(self, store_id: str) -> Optional[BaseStoreAdapter]:
        return self._adapters.get(store_id)

    def get_all_adapters(self) -> List[BaseStoreAdapter]:
        return list(self._adapters.values())

    async def load_active_stores(self, include_external: bool = True) -> List[BaseStoreAdapter]:
        """
        Dynamically load stores from Node.js bridge + authorized external retailers.
        Falls back to default stores if none found.
        """
        raw_stores = await bridge_client.get_active_stores()
        self._adapters.clear()

        if raw_stores:
            for s in raw_stores:
                s_id = str(s.get("_id") or s.get("id"))
                adapter = MongoStoreAdapter(
                    store_id=s_id,
                    name=s.get("name", "Store"),
                    delivery_fee=float(s.get("stats", {}).get("deliveryFee") or 30.0),
                    avg_delivery_mins=int(s.get("stats", {}).get("avgDelivery") or 25),
                    rating=float(s.get("ratings", {}).get("average") or 4.5),
                    emoji=s.get("emoji", "🏪"),
                    area=s.get("location", {}).get("area", "Imphal")
                )
                self.register_adapter(adapter)
        else:
            # Load default stores
            for s in DEFAULT_STORES:
                adapter = MongoStoreAdapter(
                    store_id=s["id"],
                    name=s["name"],
                    delivery_fee=s["deliveryFee"],
                    avg_delivery_mins=s["avgDeliveryMins"],
                    rating=s["rating"],
                    emoji=s["emoji"],
                    area=s["area"]
                )
                self.register_adapter(adapter)

        # Milestone 5: Register Authorized External Retailer Adapters
        if include_external:
            self.register_adapter(ExternalRetailerAdapter(
                retailer_id="ext_blinkit",
                name="Blinkit QuickStore",
                delivery_fee=35.0,
                avg_delivery_mins=15,
                rating=4.7,
                emoji="⚡",
                area="QuickHub Central"
            ))
            self.register_adapter(ExternalRetailerAdapter(
                retailer_id="ext_zepto",
                name="Zepto 10m Express",
                delivery_fee=30.0,
                avg_delivery_mins=10,
                rating=4.8,
                emoji="🚀",
                area="ExpressHub"
            ))

        return self.get_all_adapters()

    async def parallel_search(
        self,
        query: str,
        category: Optional[str] = None,
        limit_per_store: int = 5,
        include_external: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Execute concurrent product searches across registered internal & external store adapters
        using asyncio.gather for ultra-low latency.
        """
        adapters = self.get_all_adapters()
        if not adapters:
            await self.load_active_stores(include_external=include_external)
            adapters = self.get_all_adapters()

        if not include_external:
            adapters = [a for a in adapters if not isinstance(a, ExternalRetailerAdapter)]

        tasks = [
            adapter.search_items(query=query, category=category, limit=limit_per_store)
            for adapter in adapters
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        aggregated_candidates: List[Dict[str, Any]] = []
        for res in results:
            if isinstance(res, list):
                aggregated_candidates.extend(res)
            elif isinstance(res, Exception):
                print(f"[StoreRegistry] Error in store search: {res}")

        return aggregated_candidates

store_registry = StoreAdapterRegistry()
