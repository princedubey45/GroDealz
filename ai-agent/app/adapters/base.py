# ai-agent/app/adapters/base.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class BaseStoreAdapter(ABC):
    """
    Abstract Base Class for all Store Adapters (Internal MongoDB stores or External Retailers).
    Enforces a consistent contract for catalog search, inventory checks, and store parameters.
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
        self.store_id = store_id
        self.name = name
        self.delivery_fee = delivery_fee
        self.avg_delivery_mins = avg_delivery_mins
        self.rating = rating
        self.emoji = emoji
        self.area = area

    @abstractmethod
    async def search_items(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search products available in this store."""
        pass

    @abstractmethod
    async def check_inventory(
        self,
        product_id: str,
        required_qty: float
    ) -> Dict[str, Any]:
        """Check live stock and pricing for a product."""
        pass

    def get_metadata(self) -> Dict[str, Any]:
        """Return store metadata dictionary."""
        return {
            "id": self.store_id,
            "name": self.name,
            "deliveryFee": self.delivery_fee,
            "avgDeliveryMins": self.avg_delivery_mins,
            "rating": self.rating,
            "emoji": self.emoji,
            "area": self.area
        }
