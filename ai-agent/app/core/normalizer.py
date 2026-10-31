# ai-agent/app/core/normalizer.py
import re
from typing import Dict, Any, Tuple

def parse_unit_metric(unit_str: str = "") -> Dict[str, Any]:
    """
    Parse arbitrary unit string (e.g. '500g', '1kg', '200ml', '1L', '1 dozen', '1 pc')
    into standard metric base units (grams, milliliters, count, pack).
    """
    u = str(unit_str).lower().strip()
    num_match = re.search(r'([\d.]+)', u)
    val = float(num_match.group(1)) if num_match else 1.0

    if "kg" in u:
        return {"metric": "weight", "standardUnits": val * 1000.0, "label": "kg", "baseScale": 1000.0}
    if "g" in u or "gm" in u:
        return {"metric": "weight", "standardUnits": val, "label": "kg", "baseScale": 1000.0}
    if "ml" in u:
        return {"metric": "volume", "standardUnits": val, "label": "L", "baseScale": 1000.0}
    if "l" in u or "ltr" in u or "litre" in u:
        return {"metric": "volume", "standardUnits": val * 1000.0, "label": "L", "baseScale": 1000.0}
    if "dozen" in u:
        return {"metric": "count", "standardUnits": val * 12.0, "label": "pc", "baseScale": 1.0}
    if "pc" in u or "piece" in u:
        return {"metric": "count", "standardUnits": val, "label": "pc", "baseScale": 1.0}

    return {"metric": "pack", "standardUnits": 1.0, "label": "pack", "baseScale": 1.0}

def calculate_normalized_rate(price: float, unit_str: str = "") -> float:
    """
    Calculate normalized rate per standard reference unit (₹ per kg, ₹ per L, ₹ per piece).
    """
    info = parse_unit_metric(unit_str)
    std_units = info["standardUnits"]
    base_scale = info["baseScale"]

    if std_units <= 0:
        return price

    # Price per base standard unit
    rate = (price / std_units) * base_scale
    return round(rate, 2)

def normalize_candidate_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrich product item dictionary with normalized rate and quality metric.
    """
    price = float(item.get("price", 0.0))
    unit = str(item.get("unit", "1 pack"))
    normalized_rate = calculate_normalized_rate(price, unit)

    store_data = item.get("store") or {}
    store_rating = float(store_data.get("rating", 4.0))
    product_rating = float(item.get("rating", 4.0))
    discount = float(item.get("discount", 0.0))

    # Quality score (0-100)
    # 1. Price value factor (lower unit rate = higher score)
    price_factor = max(10.0, 100.0 - min(60.0, normalized_rate / 6.0))
    # 2. Reputation factor (ratings)
    reputation_factor = (store_rating * 4.0) + (product_rating * 3.0) # max ~35
    # 3. Discount bonus
    discount_bonus = min(15.0, discount * 0.5)

    quality_score = round(price_factor + reputation_factor + discount_bonus, 1)

    unit_info = parse_unit_metric(unit)

    enriched = dict(item)
    enriched["normalizedRate"] = normalized_rate
    enriched["referenceUnit"] = unit_info["label"]
    enriched["qualityScore"] = quality_score
    return enriched
