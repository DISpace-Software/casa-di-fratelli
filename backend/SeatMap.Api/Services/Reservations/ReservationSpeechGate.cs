namespace SeatMap.Api.Services.Reservations;

// Process-wide bounds include uploads and inference. No audio or transcripts are
// retained here. With multiple API replicas the worker must also limit inference.
public sealed class ReservationSpeechGate(TimeProvider time)
{
    private readonly object _sync = new();
    private readonly Dictionary<string, Window> _windows = new();
    private int _active;
    public const int ConcurrentRequests = 2;
    public const int RequestsPerAdminMinute = 30;
    public const int RequestsPerTenantMinute = 120;

    public IDisposable? TryEnter(string tenant, int adminId, out string? error)
    {
        lock (_sync)
        {
            var now = time.GetUtcNow();
            foreach (var key in _windows.Where(pair => pair.Value.Expires <= now).Select(pair => pair.Key).ToArray())
                _windows.Remove(key);
            var tenantKey = $"tenant:{tenant}";
            var adminKey = $"admin:{tenant}:{adminId}";
            if (_windows.GetValueOrDefault(adminKey)?.Count >= RequestsPerAdminMinute ||
                _windows.GetValueOrDefault(tenantKey)?.Count >= RequestsPerTenantMinute || _windows.Count >= 2048)
            { error = "rate-limited"; return null; }
            if (_active >= ConcurrentRequests) { error = "busy"; return null; }
            foreach (var key in new[] { tenantKey, adminKey })
            {
                if (!_windows.TryGetValue(key, out var window)) _windows[key] = window = new(now.AddMinutes(1));
                window.Count++;
            }
            _active++;
            error = null;
            return new Lease(this);
        }
    }

    private void Release() { lock (_sync) _active--; }
    private sealed class Window(DateTimeOffset expires) { public DateTimeOffset Expires { get; } = expires; public int Count; }
    private sealed class Lease(ReservationSpeechGate owner) : IDisposable
    {
        private ReservationSpeechGate? _owner = owner;
        public void Dispose() => Interlocked.Exchange(ref _owner, null)?.Release();
    }
}
