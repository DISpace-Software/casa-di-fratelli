namespace SeatMap.Api.Platform;

// Only explicitly marked endpoints may execute without a restaurant context.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class PlatformEndpointAttribute : Attribute;
