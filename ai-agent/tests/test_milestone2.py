# ai-agent/tests/test_milestone2.py
import pytest
from app.adapters.registry import store_registry, DEFAULT_STORES
from app.adapters.mongo_adapter import MongoStoreAdapter
from app.core.normalizer import parse_unit_metric, calculate_normalized_rate, normalize_candidate_item
from app.core.optimizer import optimize_shopping_basket
from app.graph import agent_executor

BENCHMARK_PROMPT = (
    "Buy groceries for a family of four for three days. My budget is ₹1,500. "
    "Prefer fresh vegetables, good-quality rice, and the cheapest reasonable options. Deliver today."
)

@pytest.mark.asyncio
async def test_store_adapters_and_parallel_search():
    """Verify store adapters register and execute parallel search."""
    adapters = await store_registry.load_active_stores()
    assert len(adapters) >= 3

    meta = adapters[0].get_metadata()
    assert "id" in meta
    assert "name" in meta
    assert "deliveryFee" in meta
    assert meta["deliveryFee"] > 0

    # Parallel search across stores
    results = await store_registry.parallel_search(query="rice", category="grains")
    assert isinstance(results, list)

def test_unit_normalization_rates():
    """Verify standard metric calculations and apples-to-apples price comparison."""
    rate_500g = calculate_normalized_rate(35.0, "500g")
    rate_1kg = calculate_normalized_rate(60.0, "1kg")
    rate_200ml = calculate_normalized_rate(25.0, "200ml")
    rate_1L = calculate_normalized_rate(52.0, "1L")
    rate_dozen = calculate_normalized_rate(84.0, "1 dozen")

    # ₹35 for 500g -> ₹70/kg
    assert rate_500g == 70.0
    # ₹60 for 1kg -> ₹60/kg
    assert rate_1kg == 60.0
    # 1kg is cheaper per kg than 500g pack
    assert rate_1kg < rate_500g

    # ₹25 for 200ml -> ₹125/L
    assert rate_200ml == 125.0
    # ₹52 for 1L -> ₹52/L
    assert rate_1L == 52.0
    assert rate_1L < rate_200ml

    # ₹84 for 12 eggs -> ₹7 per egg
    assert rate_dozen == 7.0

def test_candidate_item_normalization_and_scoring():
    """Verify product normalization enriches items with normalized rate and quality score."""
    sample = {
        "productId": "p1",
        "name": "Organic Basmati Rice",
        "price": 95.0,
        "unit": "1kg",
        "rating": 4.7,
        "discount": 10.0,
        "store": {"id": "s1", "name": "Fresh Mart", "rating": 4.8, "deliveryFee": 30.0}
    }
    enriched = normalize_candidate_item(sample)
    assert enriched["normalizedRate"] == 95.0
    assert enriched["referenceUnit"] == "kg"
    assert enriched["qualityScore"] > 50.0

def test_basket_optimizer_strategies():
    """Verify generation of multiStore, singleStoreFastest, and balanced strategies."""
    mock_candidates = [
        # Store A: Cheap rice, expensive veggies
        {
            "productId": "r1", "name": "Rice (Store A)", "price": 55.0, "unit": "1kg",
            "normalizedRate": 55.0, "referenceUnit": "kg", "target_requirement": "rice", "required_quantity": 2.0,
            "store": {"id": "store_a", "name": "Store A", "deliveryFee": 30.0, "avgDeliveryMins": 30}
        },
        {
            "productId": "v1", "name": "Veggies (Store A)", "price": 90.0, "unit": "1 pack",
            "normalizedRate": 90.0, "referenceUnit": "pack", "target_requirement": "fresh vegetables", "required_quantity": 1.0,
            "store": {"id": "store_a", "name": "Store A", "deliveryFee": 30.0, "avgDeliveryMins": 30}
        },
        # Store B: Expensive rice, cheap veggies
        {
            "productId": "r2", "name": "Rice (Store B)", "price": 80.0, "unit": "1kg",
            "normalizedRate": 80.0, "referenceUnit": "kg", "target_requirement": "rice", "required_quantity": 2.0,
            "store": {"id": "store_b", "name": "Store B", "deliveryFee": 30.0, "avgDeliveryMins": 20}
        },
        {
            "productId": "v2", "name": "Veggies (Store B)", "price": 40.0, "unit": "1 pack",
            "normalizedRate": 40.0, "referenceUnit": "pack", "target_requirement": "fresh vegetables", "required_quantity": 1.0,
            "store": {"id": "store_b", "name": "Store B", "deliveryFee": 30.0, "avgDeliveryMins": 20}
        }
    ]

    strategies = optimize_shopping_basket(mock_candidates, budget_limit=1500.0)

    assert "multiStore" in strategies
    assert "singleStoreFastest" in strategies
    assert "balanced" in strategies

    multi = strategies["multiStore"]
    assert multi["storeCount"] == 2
    # Multi-store picks Rice from Store A (55*2 = 110) + Veggies from Store B (40) = 150 items + 60 delivery = 210
    assert multi["itemsSubtotal"] == 150.0
    assert multi["deliveryFees"] == 60.0
    assert multi["grandTotal"] == 210.0
    assert multi["isWithinBudget"] is True

@pytest.mark.asyncio
async def test_langgraph_full_multi_store_pipeline():
    """Verify the complete LangGraph StateGraph executes from intent to optimized multi-store strategies."""
    initial_state = {
        "raw_query": BENCHMARK_PROMPT,
        "requirements": None,
        "raw_candidates": [],
        "normalized_candidates": [],
        "optimized_strategies": {},
        "proposal": {},
        "status": "initiated",
        "errors": []
    }

    result = await agent_executor.ainvoke(initial_state)

    assert result["status"] == "basket_optimized"
    assert len(result["normalized_candidates"]) > 0
    assert "multiStore" in result["optimized_strategies"]
    assert "singleStoreFastest" in result["optimized_strategies"]
    assert "balanced" in result["optimized_strategies"]

    multi_strat = result["optimized_strategies"]["multiStore"]
    assert multi_strat["grandTotal"] <= 1500.0
    assert len(multi_strat["allItems"]) >= 2
