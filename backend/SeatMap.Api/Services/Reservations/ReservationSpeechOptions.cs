namespace SeatMap.Api.Services.Reservations;

public sealed class ReservationSpeechOptions
{
    public bool Enabled { get; set; }
    public string ServiceUrl { get; set; } = string.Empty;
    public string ServiceToken { get; set; } = string.Empty;
    public string[] AllowedTenants { get; set; } = ["casa-di-fratelli"];

    public bool AllowsTenant(string tenantId) => Enabled &&
        (AllowedTenants?.Any(id => string.Equals(id, tenantId, StringComparison.OrdinalIgnoreCase)) ?? false);

    public Uri? Endpoint(bool development)
    {
        if (string.IsNullOrEmpty(ServiceToken) || ServiceToken.Length < 32 || ServiceToken.Any(character => character <= 32 || character >= 127) ||
            !Uri.TryCreate(ServiceUrl, UriKind.Absolute, out var uri) ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/" ||
            !(uri.Scheme == "https" || development && uri.Scheme == "http" && uri.IsLoopback)) return null;
        return new Uri(uri, "v1/audio/transcriptions");
    }
}

public sealed class ReservationSpeechException(string code, int statusCode) : Exception(code)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}
