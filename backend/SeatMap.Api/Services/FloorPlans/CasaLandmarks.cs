namespace SeatMap.Api.Services.FloorPlans;

// Coordinates mirror ReservationPage.jsx: never reuse Casa furniture for another restaurant.
internal static class CasaLandmarks
{
    internal static List<FloorLandmark> ForZones(IEnumerable<FloorZone> zones)
    {
        var items = new List<FloorLandmark>();
        foreach (var zone in zones)
        {
            if (zone.Presentation == "casa-indoor")
            {
                items.Add(new("indoor-window-upper", zone.Id, "window", 0, 3, 1, 47));
                items.Add(new("indoor-window-lower", zone.Id, "window", 0, 72, 1, 25));
                items.Add(new("indoor-entry", zone.Id, "entrance", 0, 56, 2, 8));
                items.Add(new("indoor-partition", zone.Id, "wall", 49, 51, 48, 1));
                items.Add(new("indoor-terrace-entry", zone.Id, "terraceEntrance", 35, 98, 22, 2));
            }
            if (zone.Presentation == "casa-garden")
            {
                items.Add(new("garden-window-top", zone.Id, "window", 3, 0, 94, 1));
                items.Add(new("garden-window-left", zone.Id, "window", 0, 3, 1, 94));
                items.Add(new("garden-window-right", zone.Id, "window", 99, 3, 1, 94));
                items.Add(new("garden-tv", zone.Id, "tv", 3, 46, 3, 8));
                items.Add(new("garden-entry", zone.Id, "terraceEntrance", 39, 98, 22, 2));
            }
            if (zone.Presentation == "casa-terrace")
                items.Add(new("terrace-restaurant-entry", zone.Id, "restaurantEntrance", 39, 0, 22, 2));
        }
        return items;
    }
}
