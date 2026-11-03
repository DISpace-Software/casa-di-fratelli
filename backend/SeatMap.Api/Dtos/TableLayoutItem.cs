namespace SeatMap.Api.Dtos;

public sealed record TableLayoutItem(
        string Id,
        string Area,
        decimal X,
        decimal Y,
        int Seats,
        bool Special,
        bool Wide,
        bool IsActive
    );
