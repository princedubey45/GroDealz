# ai-agent/app/schemas.py
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

class ItemRequirement(BaseModel):
    name: str = Field(description="Name or description of the product/item needed (e.g. 'fresh milk', 'basmati rice', 'tomatoes')")
    quantity: float = Field(default=1.0, description="Quantity or count needed")
    unit_hint: Optional[str] = Field(default="pack", description="Requested unit or packaging (e.g. 'kg', 'L', '500g', 'pack', 'dozen')")
    category_hint: Optional[str] = Field(default=None, description="Suggested category like vegetables, dairy, bakery, grains, personal_care")
    substitutable: bool = Field(default=True, description="Whether an equivalent substitute or pack size is acceptable")
    priority: Literal["essential", "preferred", "optional"] = Field(default="essential", description="Item priority")

class ShoppingRequirements(BaseModel):
    raw_query: str = Field(description="Original user text prompt")
    family_size: Optional[int] = Field(default=2, description="Target family or person count")
    duration_days: Optional[int] = Field(default=3, description="Days the groceries should last")
    budget_limit: Optional[float] = Field(default=None, description="Maximum budget in INR (null if not specified)")
    delivery_urgency: Literal["immediate", "today", "scheduled", "standard"] = Field(
        default="today",
        description="Delivery timeline preference"
    )
    dietary_preferences: List[str] = Field(
        default_factory=list,
        description="Dietary tags like vegetarian, vegan, gluten-free, organic"
    )
    requested_items: List[ItemRequirement] = Field(
        default_factory=list,
        description="List of specific grocery items identified"
    )
    optimization_goal: Literal["cheapest", "fastest", "balanced", "quality"] = Field(
        default="balanced",
        description="Optimization objective for the shopping basket"
    )

class AgentPlanRequest(BaseModel):
    query: str
    preferences: Optional[Dict[str, Any]] = Field(default_factory=dict)
    budget: Optional[float] = None
    target_stores: Optional[List[str]] = None

class HealthStatus(BaseModel):
    status: str
    service: str
    version: str
