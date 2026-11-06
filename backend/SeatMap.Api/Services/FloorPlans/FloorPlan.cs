using SeatMap.Api.Dtos;

namespace SeatMap.Api.Services.FloorPlans;

public sealed record FloorZone(string Id, string Name, string Presentation = "plain", bool IsActive = true, Dictionary<string, string>? Names = null);

public sealed record FloorPlan
{
    public int SchemaVersion { get; init; } = 1;
    public string Revision { get; init; } = "";
    public List<FloorZone> Zones { get; init; } = [];
    public List<TableLayoutItem> Tables { get; init; } = [];
    // Each entry is an exact permitted set. Single tables are always eligible.
    public List<List<string>> Combinations { get; init; } = [];
    // Null is a legacy document; FloorPlanService resolves the restaurant's
    // compatibility policy before exposing it. Public booking never uses it.
    public string? StaffCombinationMode { get; init; }
    public int PublicMaxGuests { get; init; } = 8;
    public int PublicMaxTables { get; init; } = 1;
}

public sealed record TableSelection(string? Error, List<string> TableIds, string Area, int Capacity);
public sealed class FloorPlanConflictException(string message) : Exception(message);
