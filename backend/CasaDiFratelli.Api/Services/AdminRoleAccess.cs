namespace CasaDiFratelli.Api.Services;

public static class AdminRoleAccess
{
    public const string Owner = "Owner";
    public const string Administrator = "Administrator";
    public const string Waiter = "Waiter";
    public const string Kitchen = "Kitchen";
    public const string Developer = "Developer";

    public static readonly string[] AllRoles = { Owner, Administrator, Waiter, Kitchen, Developer };

    public static string Normalize(string? role)
    {
        var normalized = (role ?? string.Empty).Trim();

        return normalized.ToLowerInvariant() switch
        {
            "owner" => Owner,
            "administrator" or "admin" or "manager" => Administrator,
            "waiter" or "staff" or "server" => Waiter,
            "kitchen" or "chef" or "cook" => Kitchen,
            "developer" or "dev" or "programmer" => Developer,
            _ => Administrator
        };
    }

    public static bool CanManageAdmins(string? role)
    {
        var normalized = Normalize(role);
        return normalized is Owner or Developer;
    }

    public static bool CanCreateRole(string? actorRole, string? newRole, bool developerExists = true)
    {
        var actor = Normalize(actorRole);
        var target = Normalize(newRole);

        return actor == Developer || (actor == Owner && (target != Developer || !developerExists));
    }

    public static bool CanModifyRole(string? actorRole, string? targetRole)
    {
        var actor = Normalize(actorRole);
        var target = Normalize(targetRole);

        return actor == Developer || (actor == Owner && target != Developer);
    }

    public static bool CanClearOperationalData(string? role)
    {
        return Normalize(role) == Developer;
    }
}
