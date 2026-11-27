
export function getDiningItemStatusLabel(status, language) {
  if (typeof status === "object" && status?.kind === "WaiterCall") {
    return language === "bg" ? "Повикан сервитьор" : "Waiter called";
  }
  if (typeof status === "object" && status?.kind === "BillRequest") {
    return language === "bg" ? "Иска сметка" : "Bill requested";
  }

  const normalizedStatus = typeof status === "string" ? status : status?.status;
  const labels = {
    New: language === "bg" ? "Чака кухня" : "Waiting kitchen",
    Seen: language === "bg" ? "Видяно от кухня" : "Seen by kitchen",
    Preparing: language === "bg" ? "Приготвя се" : "Preparing",
    Ready: language === "bg" ? "Готово от кухнята" : "Ready from kitchen",
    Done: language === "bg" ? "Сервирано" : "Served",
    Cancelled: language === "bg" ? "Отказано" : "Cancelled",
  };

  return labels[normalizedStatus] || normalizedStatus || labels.New;
}

export function hasReadyDiningItems(order) {
  return (order.items || []).some((item) => item.status === "Ready");
}

export function hasNewDiningItems(order) {
  return (order.items || []).some((item) => item.status === "New");
}

export function hasUnseenGuestItems(order) {
  return (order.items || []).some((item) => item.source === "GuestOnline" && !item.waiterSeenAtUtc);
}

export function hasWaiterAttentionItems(order) {
  return hasUnseenGuestItems(order) || hasReadyDiningItems(order);
}

