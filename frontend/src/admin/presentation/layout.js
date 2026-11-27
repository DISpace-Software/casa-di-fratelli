
// Editor overlap affordance; saving the plan still runs authoritative server validation.
export function hasLayoutOverlap(layout, candidate, ignoreId = candidate.id) {
  return layout.some((item) => {
    if (item.id === ignoreId || item.id === candidate.id || item.area !== candidate.area || !item.isActive || !candidate.isActive) {
      return false;
    }

    const distance = Math.hypot(item.x - candidate.x, item.y - candidate.y);
    return distance < 6;
  });
}

