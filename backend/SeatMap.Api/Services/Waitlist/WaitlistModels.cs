namespace SeatMap.Api.Services.Waitlist;

public sealed record WaitlistRequest(DateOnly Date, int Guests, string Area, List<string> Times);
public sealed record WaitlistSettings(bool Enabled = true, int OfferMinutes = 5);
public sealed record WaitlistAcceptance(Guid Id, Guid GuestId, Guid OfferId);
