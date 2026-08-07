def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

import re

def normalize_telephone(raw):
    if not raw:
        return raw

    cleaned = re.sub(r'[\s\-\.]', '', str(raw))

    if cleaned.startswith('+237'):
        cleaned = cleaned[4:]
    elif cleaned.startswith('237') and len(cleaned) > 9:
        cleaned = cleaned[3:]

    return cleaned