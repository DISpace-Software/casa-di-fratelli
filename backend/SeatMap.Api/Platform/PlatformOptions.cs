namespace SeatMap.Api.Platform;

public sealed class PlatformOptions
{
    public bool Enabled { get; set; }
    public List<string> FrontendOrigins { get; set; } = new();
}
