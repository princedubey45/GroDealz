# ai-agent/app/core/requirement_extractor.py
import os
import re
from typing import Dict, Any, List
from dotenv import load_dotenv

from app.schemas import ShoppingRequirements, ItemRequirement

load_dotenv()

# Common item dictionaries for deterministic extraction & classification
GROCERY_KEYWORDS = {
    "rice": ("grains", "kg"),
    "basmati rice": ("grains", "kg"),
    "atta": ("grains", "kg"),
    "wheat": ("grains", "kg"),
    "flour": ("grains", "kg"),
    "dal": ("pulses", "kg"),
    "lentils": ("pulses", "kg"),
    "milk": ("dairy", "L"),
    "curd": ("dairy", "pack"),
    "butter": ("dairy", "pack"),
    "cheese": ("dairy", "pack"),
    "paneer": ("dairy", "pack"),
    "bread": ("bakery", "pack"),
    "eggs": ("dairy", "dozen"),
    "egg": ("dairy", "dozen"),
    "potato": ("vegetables", "kg"),
    "potatoes": ("vegetables", "kg"),
    "onion": ("vegetables", "kg"),
    "onions": ("vegetables", "kg"),
    "tomato": ("vegetables", "kg"),
    "tomatoes": ("vegetables", "kg"),
    "cauliflower": ("vegetables", "pc"),
    "spinach": ("vegetables", "bunch"),
    "vegetables": ("vegetables", "pack"),
    "fresh vegetables": ("vegetables", "pack"),
    "oil": ("staples", "L"),
    "mustard oil": ("staples", "L"),
    "sunflower oil": ("staples", "L"),
    "sugar": ("staples", "kg"),
    "salt": ("staples", "kg"),
    "tea": ("beverages", "pack"),
    "coffee": ("beverages", "pack"),
    "apple": ("fruits", "kg"),
    "apples": ("fruits", "kg"),
    "banana": ("fruits", "dozen"),
    "bananas": ("fruits", "dozen")
}

def rule_based_extract(query: str) -> ShoppingRequirements:
    """
    High-reliability deterministic parser for benchmark and standard shopping queries.
    Used when LLM credentials are not configured or as fallback.
    """
    # Remove commas between digits e.g. 1,500 -> 1500
    clean = re.sub(r'(\d),(\d)', r'\1\2', query.lower())
    clean = clean.replace(",", " ")

    # 1. Family size
    family_size = 2
    f_match = re.search(r'family of (\d+|two|three|four|five|six)', clean)
    if f_match:
        val = f_match.group(1)
        word_map = {'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6}
        family_size = word_map.get(val, int(val) if val.isdigit() else 2)
    elif re.search(r'(\d+)\s*(people|person|members)', clean):
        family_size = int(re.search(r'(\d+)\s*(people|person|members)', clean).group(1))

    # 2. Duration days
    duration_days = 3
    d_match = re.search(r'(\d+|two|three|four|five|seven|week)\s*(days?|week)', clean)
    if d_match:
        val = d_match.group(1)
        unit = d_match.group(2)
        word_map = {'two': 2, 'three': 3, 'four': 4, 'five': 5, 'seven': 7, 'week': 7}
        days = word_map.get(val, int(val) if val.isdigit() else 3)
        if 'week' in unit and days == 1:
            days = 7
        duration_days = days

    # 3. Budget in INR
    budget_limit = None
    b_match = re.search(r'(?:₹|rs\.?|inr|budget\s*(?:is|of)?\s*(?:₹|rs\.?)?)\s*([\d]+(?:,\d+)?)', clean)
    if b_match:
        budget_str = b_match.group(1).replace(",", "")
        budget_limit = float(budget_str)

    # 4. Delivery Urgency
    urgency = "today"
    if "today" in clean:
        urgency = "today"
    elif any(w in clean for w in ["now", "immediate", "urgent", "30 mins", "asap"]):
        urgency = "immediate"
    elif "tomorrow" in clean or "scheduled" in clean:
        urgency = "scheduled"

    # 5. Goal
    goal = "balanced"
    if any(w in clean for w in ["cheapest", "lowest price", "budget friendly", "save money"]):
        goal = "cheapest"
    elif any(w in clean for w in ["fastest", "quickest", "asap"]):
        goal = "fastest"
    elif any(w in clean for w in ["best quality", "premium", "top quality"]):
        goal = "quality"

    # 6. Extract items
    items: List[ItemRequirement] = []
    found_keys = set()

    # Sort keywords by length descending so longer phrases match first (e.g. 'fresh vegetables' before 'vegetables')
    sorted_keywords = sorted(GROCERY_KEYWORDS.keys(), key=lambda k: len(k), reverse=True)

    for kw in sorted_keywords:
        if kw in clean and kw not in found_keys:
            cat, unit = GROCERY_KEYWORDS[kw]
            # avoid sub-word collisions
            if any(kw in existing for existing in found_keys):
                continue
            found_keys.add(kw)
            items.append(ItemRequirement(
                name=kw,
                quantity=1.0 if family_size <= 2 else (2.0 if kw in ["milk", "potato", "rice"] else 1.0),
                unit_hint=unit,
                category_hint=cat,
                priority="essential"
            ))

    # If no specific items mentioned but vegetables requested
    if "vegetable" in clean and not any(i.category_hint == "vegetables" for i in items):
        items.append(ItemRequirement(
            name="fresh vegetables",
            quantity=2.0,
            unit_hint="pack",
            category_hint="vegetables"
        ))

    # If rice requested with quality note
    if "good-quality rice" in clean or "quality rice" in clean:
        # ensure rice is tagged
        rice_item = next((i for i in items if "rice" in i.name), None)
        if rice_item:
            rice_item.name = "good-quality rice"
            rice_item.priority = "essential"

    return ShoppingRequirements(
        raw_query=query,
        family_size=family_size,
        duration_days=duration_days,
        budget_limit=budget_limit,
        delivery_urgency=urgency,
        dietary_preferences=["vegetarian"] if "veg" in clean and "non-veg" not in clean else [],
        requested_items=items,
        optimization_goal=goal
    )

async def extract_shopping_requirements(query: str) -> ShoppingRequirements:
    """
    Main extraction interface. Attempts LLM structured parsing via OpenRouter/OpenAI,
    falling back to rule-based parser if API key is not present or LLM call fails.
    """
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    
    if not api_key or api_key == "your_openrouter_api_key_here":
        # Deterministic extraction
        return rule_based_extract(query)

    try:
        from langchain_openai import ChatOpenAI
        base_url = "https://openrouter.ai/api/v1" if os.getenv("OPENROUTER_API_KEY") else None
        model_name = "openai/gpt-4o-mini" if os.getenv("OPENROUTER_API_KEY") else "gpt-4o-mini"

        llm = ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=base_url,
            temperature=0.0
        )
        structured_llm = llm.with_structured_output(ShoppingRequirements)

        prompt = (
            "You are an autonomous grocery shopping assistant. Extract structured requirements "
            "from the following user shopping query into the provided schema:\n\n"
            f"User Query: {query}"
        )
        result = await structured_llm.ainvoke(prompt)
        if isinstance(result, ShoppingRequirements):
            return result
        return rule_based_extract(query)
    except Exception as e:
        print(f"[RequirementExtractor] LLM extraction error, falling back to rule-based: {e}")
        return rule_based_extract(query)
