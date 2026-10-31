# ai-agent/tests/test_milestone1.py
import pytest
from app.schemas import ShoppingRequirements
from app.core.requirement_extractor import extract_shopping_requirements, rule_based_extract
from app.graph import agent_executor

BENCHMARK_PROMPT = (
    "Buy groceries for a family of four for three days. My budget is ₹1,500. "
    "Prefer fresh vegetables, good-quality rice, and the cheapest reasonable options. Deliver today."
)

@pytest.mark.asyncio
async def test_benchmark_requirements_extraction():
    """Verify structured requirements extraction from benchmark prompt."""
    reqs: ShoppingRequirements = await extract_shopping_requirements(BENCHMARK_PROMPT)

    assert reqs.family_size == 4, f"Expected family_size=4, got {reqs.family_size}"
    assert reqs.duration_days == 3, f"Expected duration_days=3, got {reqs.duration_days}"
    assert reqs.budget_limit == 1500.0, f"Expected budget_limit=1500.0, got {reqs.budget_limit}"
    assert reqs.delivery_urgency == "today", f"Expected delivery_urgency='today', got {reqs.delivery_urgency}"
    assert reqs.optimization_goal == "cheapest", f"Expected optimization_goal='cheapest', got {reqs.optimization_goal}"

    item_names = [i.name.lower() for i in reqs.requested_items]
    assert any("rice" in name for name in item_names), f"Expected rice in items: {item_names}"
    assert any("veg" in name for name in item_names), f"Expected vegetables in items: {item_names}"

def test_deterministic_rule_based_fallback():
    """Verify regex/heuristic fallback produces high-fidelity results without API key."""
    reqs = rule_based_extract(BENCHMARK_PROMPT)
    assert reqs.family_size == 4
    assert reqs.duration_days == 3
    assert reqs.budget_limit == 1500.0
    assert reqs.delivery_urgency == "today"
    assert reqs.optimization_goal == "cheapest"

@pytest.mark.asyncio
async def test_langgraph_workflow_execution():
    """Verify LangGraph StateGraph runs end-to-end through extraction and validation nodes."""
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

    assert result["status"] in ["catalog_discovered", "basket_optimized"]
    assert result["requirements"] is not None
    assert result["requirements"]["family_size"] == 4
    assert result["requirements"]["budget_limit"] == 1500.0
    assert len(result["requirements"]["requested_items"]) >= 2
    assert result["errors"] == []

def test_fastapi_endpoints():
    """Verify FastAPI application endpoints."""
    from starlette.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    
    # 1. Health check
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # 2. Extract requirements endpoint
    res = client.post("/agent/extract-requirements", json={"query": BENCHMARK_PROMPT})
    assert res.status_code == 200
    data = res.json()
    assert data["family_size"] == 4
    assert data["budget_limit"] == 1500.0

    # 3. Plan endpoint
    res = client.post("/agent/plan", json={"query": BENCHMARK_PROMPT})
    assert res.status_code == 200
    plan_data = res.json()
    assert plan_data["success"] is True
    assert plan_data["status"] in ["catalog_discovered", "basket_optimized"]

