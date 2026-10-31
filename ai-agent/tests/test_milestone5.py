# ai-agent/tests/test_milestone5.py
import pytest
import asyncio
from app.adapters.external_retailer import ExternalRetailerAdapter, SANDBOX_EXTERNAL_CATALOG
from app.adapters.registry import store_registry
from app.core.circuit_breaker import CircuitBreaker, CircuitState, CircuitBreakerOpenException
from app.graph import agent_executor

BENCHMARK_PROMPT = (
    "Buy groceries for a family of four for three days. My budget is ₹1,500. "
    "Prefer fresh vegetables, good-quality rice, and the cheapest reasonable options. Deliver today."
)

@pytest.mark.asyncio
async def test_external_retailer_catalog_search():
    """Verify external retailer adapter queries sandbox catalog and normalizes items."""
    adapter = ExternalRetailerAdapter(
        retailer_id="ext_blinkit",
        name="Blinkit QuickStore",
        delivery_fee=35.0,
        avg_delivery_mins=15,
        rating=4.7
    )

    items = await adapter.search_items(query="rice", category="grains")
    assert len(items) > 0
    it = items[0]
    assert "India Gate" in it["name"]
    assert it["isExternalRetailer"] is True
    assert it["store"]["id"] == "ext_blinkit"
    assert it["store"]["avgDeliveryMins"] == 15

@pytest.mark.asyncio
async def test_external_inventory_and_order_dispatch():
    """Verify live stock verification and retailer-specific order payload generation."""
    adapter = ExternalRetailerAdapter(
        retailer_id="ext_zepto",
        name="Zepto 10m Express",
        delivery_fee=30.0
    )

    # Check stock
    inv = await adapter.check_inventory("zpt_rice_1", required_qty=2.0)
    assert inv["available"] is True
    assert inv["currentStock"] >= 2.0

    # Format dispatch payload
    mock_order = {
        "orderId": "GRD-20261031-0099",
        "delivery": {"address": "123 Main St, Imphal", "notes": "Leave at door"},
        "pricing": {"total": 188.0},
        "items": [
            {"product": "zpt_rice_1", "name": "Daawat Rozana Gold Basmati Rice", "quantity": 2, "price": 79.0}
        ]
    }
    dispatch_payload = adapter.format_order_dispatch_payload(mock_order)
    assert dispatch_payload["partnerRetailer"] == "ext_zepto"
    assert "EXT-DISP-GRD-20261031-0099" in dispatch_payload["externalDispatchId"]
    assert len(dispatch_payload["lineItems"]) == 1
    assert dispatch_payload["dispatchUrgency"] == "immediate_15m"

@pytest.mark.asyncio
async def test_circuit_breaker_tripping_and_fallback():
    """Verify CircuitBreaker trips after 3 consecutive failures to isolate network disruptions."""
    cb = CircuitBreaker(name="test_retailer", failure_threshold=3, recovery_timeout_sec=0.2)
    assert cb.state == CircuitState.CLOSED

    async def failing_api_call():
        raise ConnectionError("External Retailer HTTP 504 Gateway Timeout")

    # Call 1 & 2 fail but circuit remains CLOSED
    for i in range(2):
        with pytest.raises(ConnectionError):
            await cb.execute(failing_api_call)
        assert cb.state == CircuitState.CLOSED

    # Call 3 fails -> trips circuit to OPEN
    with pytest.raises(ConnectionError):
        await cb.execute(failing_api_call)
    assert cb.state == CircuitState.OPEN

    # Call 4 is fast-failed immediately without even invoking external network
    with pytest.raises(CircuitBreakerOpenException):
        await cb.execute(failing_api_call)

    # Wait for recovery timeout to transition to HALF_OPEN
    await asyncio.sleep(0.25)
    assert cb.can_attempt() is True
    assert cb.state == CircuitState.HALF_OPEN

    # Successful call resets circuit to CLOSED
    async def healthy_api_call():
        return {"status": "ok"}

    res = await cb.execute(healthy_api_call)
    assert res["status"] == "ok"
    assert cb.state == CircuitState.CLOSED

@pytest.mark.asyncio
async def test_hybrid_search_and_langgraph_pipeline():
    """Verify LangGraph full pipeline discovers both internal stores and external quick-commerce retailers."""
    adapters = await store_registry.load_active_stores(include_external=True)
    has_external = any(getattr(a, "store_id", "").startswith("ext_") for a in adapters)
    assert has_external is True, "Store registry successfully includes external retailer adapters"

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
    assert "multiStore" in result["optimized_strategies"]

    multi_strat = result["optimized_strategies"]["multiStore"]
    assert multi_strat["storeCount"] >= 1
    assert multi_strat["grandTotal"] <= 1500.0
