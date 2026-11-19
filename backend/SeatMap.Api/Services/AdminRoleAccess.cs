namespace SeatMap.Api.Services;

public static class AdminRoleAccess
{
    public const string Owner = "Owner";
    public const string Administrator = "Administrator";
    public const string Waiter = "Waiter";
    public const string Kitchen = "Kitchen";
    public const string Bar = "Bar";
    public const string Developer = "Developer";

    public static readonly string[] AllRoles = { Owner, Administrator, Waiter, Kitchen, Bar, Developer };

    public static string Normalize(string? role)
    {
        return TryNormalize(role, out var normalized) ? normalized : Administrator;
    }

    public static bool TryNormalize(string? role, out string normalized)
    {
        normalized = (role ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "owner" => Owner,
            "administrator" or "admin" or "manager" => Administrator,
            "waiter" or "staff" or "server" => Waiter,
            "kitchen" or "chef" or "cook" => Kitchen,
            "bar" or "bartender" or "barman" or "бар" or "барман" => Bar,
            "developer" or "dev" or "programmer" => Developer,
            _ => string.Empty
        };
        return normalized.Length > 0;
    }

    public static bool CanManageAdmins(string? role)
    {
        return TryNormalize(role, out var normalized) && normalized is Owner or Developer or Administrator;
    }

    public static bool CanCreateRole(string? actorRole, string? newRole, bool developerExists = true)
    {
        if (!TryNormalize(actorRole, out var actor)) return false;
        var target = Normalize(newRole);

        return actor == Developer || (actor == Owner && (target != Developer || !developerExists)) ||
            (actor == Administrator && TryNormalize(newRole, out var staffRole) && IsStaffRole(staffRole));
    }

    public static bool CanModifyRole(string? actorRole, string? targetRole)
    {
        if (!TryNormalize(actorRole, out var actor)) return false;
        var target = Normalize(targetRole);

        return actor == Developer || (actor == Owner && target != Developer) ||
            (actor == Administrator && TryNormalize(targetRole, out var staffRole) && IsStaffRole(staffRole));
    }

    private static bool IsStaffRole(string role) => role is Administrator or Waiter or Kitchen or Bar;

    public static bool CanClearOperationalData(string? role)
    {
        return Normalize(role) == Developer;
    }

    public static bool CanDeleteReservations(string? role)
    {
        return Normalize(role) is Administrator or Owner or Developer;
    }

    public static bool CanRestoreReservations(string? role)
    {
        return CanDeleteReservations(role);
    }

    public static bool CanDeleteOrders(string? role)
    {
        return Normalize(role) is Administrator or Owner or Developer or Waiter or Kitchen or Bar;
    }

    public static bool CanRestoreOrders(string? role)
    {
        return Normalize(role) is Administrator or Owner or Developer;
    }

    public static bool CanViewDeletedOperationalData(string? role)
    {
        return Normalize(role) is Administrator or Owner or Developer;
    }

    public static bool CanManageBackups(string? role)
    {
        return Normalize(role) is Administrator or Owner or Developer;
    }
}
