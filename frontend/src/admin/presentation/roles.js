/**
 * Role names and UI management affordances retained from the existing admin application.
 * These helpers only decide which controls to show; every write remains authorized by the API.
 * Unknown-role display fallback is legacy behavior and must not be reused for authorization.
 */

export const adminRoleOptions = [
  { value: "Owner", labels: { bg: "Собственик", en: "Owner", ru: "Собственник" } },
  { value: "Administrator", labels: { bg: "Администратор", en: "Administrator", ru: "Администратор" } },
  { value: "Waiter", labels: { bg: "Сервитьор", en: "Waiter", ru: "Официант" } },
  { value: "Kitchen", labels: { bg: "Кухня", en: "Kitchen", ru: "Кухня" } },
  { value: "Bar", labels: { bg: "Бар", en: "Bar", ru: "Бар" } },
  { value: "Developer", labels: { bg: "Програмист", en: "Developer", ru: "Разработчик" } },
];

export function normalizeAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();

  if (normalized === "owner") return "Owner";
  if (["administrator", "admin", "manager"].includes(normalized)) return "Administrator";
  if (["waiter", "staff", "server"].includes(normalized)) return "Waiter";
  if (["kitchen", "chef", "cook"].includes(normalized)) return "Kitchen";
  if (["bar", "bartender", "barman", "бар", "барман"].includes(normalized)) return "Bar";
  if (["developer", "dev", "programmer"].includes(normalized)) return "Developer";

  return "Administrator";
}

export function getAdminRoleLabel(role, language = "bg") {
  const normalized = normalizeAdminRole(role);
  return adminRoleOptions.find((option) => option.value === normalized)?.labels[language] || normalized;
}

export function getAdminUserId(user) {
  return user?.id ?? user?.Id;
}

export function canActorManageAdminUser(actorRole, targetRole) {
  const actor = normalizeAdminRole(actorRole);
  const target = normalizeAdminRole(targetRole);

  return actor === "Developer" || (actor === "Owner" && target !== "Developer") ||
    (["administrator", "admin", "manager"].includes(String(actorRole || "").trim().toLowerCase()) &&
      ["administrator", "admin", "manager", "waiter", "staff", "server", "kitchen", "chef", "cook", "bar", "bartender", "barman", "бар", "барман"].includes(String(targetRole || "").trim().toLowerCase()));
}

