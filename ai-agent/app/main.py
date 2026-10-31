# ai-agent/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

from app.schemas import ShoppingRequirements, AgentPlanRequest, HealthStatus
from app.core.requirement_extractor import extract_shopping_requirements
from app.graph import agent_executor

app = FastAPI(
    title="GroDealz Autonomous AI Shopping Agent",
    description="LangGraph-powered microservice for autonomous grocery intent extraction, catalog discovery, and multi-store basket optimization.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=HealthStatus)
async def health_check():
    return HealthStatus(
        status="healthy",
        service="grodealz-ai-agent",
        version="1.0.0"
    )

@app.post("/agent/extract-requirements", response_model=ShoppingRequirements)
async def extract_requirements_endpoint(req: AgentPlanRequest):
    """Extract structured, typed shopping constraints from user's natural language."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query prompt cannot be empty")
    try:
        extracted = await extract_shopping_requirements(req.query)
        return extracted
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failure: {str(e)}")

@app.post("/agent/plan")
async def plan_shopping_agent(req: AgentPlanRequest):
    """Execute LangGraph shopping orchestration workflow."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query prompt cannot be empty")

    initial_state = {
        "raw_query": req.query,
        "requirements": None,
        "raw_candidates": [],
        "normalized_candidates": [],
        "optimized_strategies": {},
        "proposal": {},
        "status": "initiated",
        "errors": []
    }

    try:
        final_state = await agent_executor.ainvoke(initial_state)
        return {
            "success": True,
            "query": req.query,
            "status": final_state.get("status"),
            "requirements": final_state.get("requirements"),
            "strategies": final_state.get("optimized_strategies"),
            "proposal": final_state.get("proposal"),
            "candidate_count": len(final_state.get("raw_candidates", [])),
            "errors": final_state.get("errors", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent workflow error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
