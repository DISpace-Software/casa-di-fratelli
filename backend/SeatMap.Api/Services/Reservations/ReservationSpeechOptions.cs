namespace SeatMap.Api.Services.Reservations;

public sealed class ReservationSpeechOptions
{
    public bool Enabled { get; set; }
    public string ServiceUrl { get; set; } = string.Empty;
    public string ServiceToken { get; set; } = string.Empty;
    public string TrustedPrivateHost { get; set; } = string.Empty;
    public string[] AllowedTenants { get; set; } = ["casa-di-fratelli"];

    public bool AllowsTenant(string tenantId) => Enabled &&
        (AllowedTenants?.Any(id => string.Equals(id, tenantId, StringComparison.OrdinalIgnoreCase)) ?? false);

    public Uri? Endpoint(bool development)
    {
        if (string.IsNullOrEmpty(ServiceToken) || ServiceToken.Length < 32 || ServiceToken.Any(character => character <= 32 || character >= 127) ||
            !Uri.TryCreate(ServiceUrl, UriKind.Absolute, out var uri) ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/" ||
            !(uri.Scheme == "https" || uri.Scheme == "http" &&
                (development && uri.IsLoopback || IsTrustedPrivateHttp(uri)))) return null;
        return new Uri(uri, "v1/audio/transcriptions");
    }

    private bool IsTrustedPrivateHttp(Uri uri)
    {
        // Opt in to exactly the internal hostname supplied by the deployment platform.
        // A hostname pattern alone does not establish trust or guarantee private DNS.
        var host = TrustedPrivateHost;
        if (string.IsNullOrEmpty(host) || host.Length > 63 ||
            !char.IsAsciiLetterOrDigit(host[0]) || !char.IsAsciiLetterOrDigit(host[^1]) ||
            host.Any(character => !char.IsAsciiLetterOrDigit(character) && character != '-') ||
            !host.Any(char.IsAsciiLetter) || string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
            uri.HostNameType != UriHostNameType.Dns || uri.IsLoopback || uri.IsDefaultPort || uri.Port <= 0 ||
            !string.Equals(uri.Host, host, StringComparison.OrdinalIgnoreCase)) return false;

        // Require the explicit non-default port and a bare origin. Comparing the
        // original value also rejects paths/escapes that Uri would normalize away.
        var origin = $"http://{uri.Host}:{uri.Port}";
        return string.Equals(ServiceUrl, origin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(ServiceUrl, origin + "/", StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class ReservationSpeechException(string code, int statusCode) : Exception(code)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}
