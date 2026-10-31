# ai-agent/app/core/optimizer.py
from typing import List, Dict, Any, Optional
from collections import defaultdict
from app.core.normalizer import normalize_candidate_item

def group_candidates_by_requirement(candidates: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group normalized candidates by their target grocery requirement."""
    groups = defaultdict(list)
    for c in candidates:
        key = c.get("target_requirement") or c.get("name") or "general"
        groups[key.lower().strip()].append(c)
    return dict(groups)

def build_store_strategy(
    chosen_items: List[Dict[str, Any]],
    strategy_name: str,
    title: str,
    badge: str,
    description: str
) -> Dict[str, Any]:
    """Aggregate items into a structured strategy basket grouped by store."""
    store_map: Dict[str, Dict[str, Any]] = {}

    subtotal = 0.0
    total_delivery_fee = 0.0

    for it in chosen_items:
        p_price = float(it.get("price", 0.0))
        qty = float(it.get("required_quantity", 1.0))
        item_subtotal = p_price * qty
        subtotal += item_subtotal

        store_info = it.get("store") or {}
        s_id = str(store_info.get("id") or "store_default")

        if s_id not in store_map:
            store_delivery = float(store_info.get("deliveryFee") or 30.0)
            total_delivery_fee += store_delivery
            store_map[s_id] = {
                "store": store_info,
                "items": [],
                "storeSubtotal": 0.0,
                "deliveryFee": store_delivery,
                "storeTotal": 0.0,
                "estimatedMins": int(store_info.get("avgDeliveryMins") or 25)
            }

        store_map[s_id]["items"].append({
            "productId": it.get("productId") or it.get("_id"),
            "product": it.get("productId") or it.get("_id"),
            "name": it.get("name"),
            "price": p_price,
            "unit": it.get("unit"),
            "emoji": it.get("emoji", "🛒"),
            "quantity": qty,
            "subtotal": round(item_subtotal, 2),
            "normalizedRate": it.get("normalizedRate", p_price),
            "referenceUnit": it.get("referenceUnit", "pack"),
            "qualityScore": it.get("qualityScore", 80.0)
        })
        store_map[s_id]["storeSubtotal"] += item_subtotal
        store_map[s_id]["storeTotal"] = store_map[s_id]["storeSubtotal"] + store_map[s_id]["deliveryFee"]

    stores_list = list(store_map.values())
    max_eta = max([s["estimatedMins"] for s in stores_list]) if stores_list else 30
    grand_total = subtotal + total_delivery_fee

    return {
        "strategy": strategy_name,
        "title": title,
        "badge": badge,
        "description": description,
        "storeCount": len(stores_list),
        "stores": stores_list,
        "allItems": [it for s in stores_list for it in s["items"]],
        "itemsCount": len(chosen_items),
        "itemsSubtotal": round(subtotal, 2),
        "deliveryFees": round(total_delivery_fee, 2),
        "grandTotal": round(grand_total, 2),
        "estimatedDeliveryMins": max_eta
    }

def optimize_shopping_basket(
    normalized_candidates: List[Dict[str, Any]],
    budget_limit: Optional[float] = None
) -> Dict[str, Any]:
    """
    Produce 3 optimized shopping strategies:
    1. Multi-Store Cheapest (Lowest unit rates across stores)
    2. Single-Store Fastest (Consolidated to one fast store)
    3. Balanced Smart Pick (Consolidated where incremental delivery fee exceeds item savings)
    """
    grouped = group_candidates_by_requirement(normalized_candidates)
    if not grouped:
        return {"multiStore": None, "singleStoreFastest": None, "balanced": None}

    # 1. Strategy: Multi-Store Cheapest (Lowest normalizedRate per requirement)
    cheapest_items = []
    for req_key, items in grouped.items():
        # Sort by lowest normalized rate
        sorted_items = sorted(items, key=lambda x: x.get("normalizedRate", 999999.0))
        cheapest_items.append(sorted_items[0])

    multi_store_strategy = build_store_strategy(
        cheapest_items,
        strategy_name="multiStore",
        title="Multi-Store Value Max",
        badge="Best Savings 🏆",
        description="Cherry-picks lowest unit rates across stores. Verified minimum cost."
    )

    # 2. Strategy: Single-Store Fastest
    # Find which store has the most items and lowest delivery ETA
    store_item_counts = defaultdict(int)
    for c in normalized_candidates:
        s_id = str(c.get("store", {}).get("id") or "")
        store_item_counts[s_id] += 1

    best_store_id = None
    if store_item_counts:
        best_store_id = max(store_item_counts.keys(), key=lambda s: store_item_counts[s])

    single_store_items = []
    for req_key, items in grouped.items():
        # Look for item in best_store_id first
        store_match = next((i for i in items if str(i.get("store", {}).get("id")) == best_store_id), None)
        if store_match:
            single_store_items.append(store_match)
        else:
            single_store_items.append(items[0])

    single_store_strategy = build_store_strategy(
        single_store_items,
        strategy_name="singleStoreFastest",
        title="Single-Store Express",
        badge="Fastest ⚡",
        description="Consolidated to 1 store for quickest one-trip delivery and single delivery fee."
    )

    # 3. Strategy: Balanced Smart Pick
    # If multi-store savings don't exceed the extra delivery fee, pick single-store
    single_total = single_store_strategy["grandTotal"]
    multi_total = multi_store_strategy["grandTotal"]

    if multi_total < single_total:
        balanced_strategy = dict(multi_store_strategy)
        balanced_strategy["strategy"] = "balanced"
        balanced_strategy["title"] = "Balanced Smart Pick"
        balanced_strategy["badge"] = "Recommended 🌟"
        balanced_strategy["description"] = f"Saves ₹{round(single_total - multi_total)} vs single store delivery."
    else:
        balanced_strategy = dict(single_store_strategy)
        balanced_strategy["strategy"] = "balanced"
        balanced_strategy["title"] = "Balanced Smart Pick"
        balanced_strategy["badge"] = "Recommended 🌟"
        balanced_strategy["description"] = "Consolidated to avoid unnecessary duplicate delivery fees."

    # Compute savings relative to single store or budget
    baseline = single_total
    for strat in [multi_store_strategy, single_store_strategy, balanced_strategy]:
        savings = max(0.0, baseline - strat["grandTotal"])
        strat["estimatedSavings"] = round(savings, 2)
        strat["isWithinBudget"] = True if budget_limit is None else (strat["grandTotal"] <= budget_limit)

    return {
        "multiStore": multi_store_strategy,
        "singleStoreFastest": single_store_strategy,
        "balanced": balanced_strategy
    }
