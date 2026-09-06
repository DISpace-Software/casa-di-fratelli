using System.ComponentModel.DataAnnotations;

namespace CasaDiFratelli.Api.Services.Tenancy;

// Public content only. Provider credentials and sender identities stay in server configuration.
public sealed class TenantBrandingSettings
{
    [Required, StringLength(120)] public string Name { get; set; } = "";
    [StringLength(50)] public string Phone { get; set; } = "";
    [StringLength(180)] public string Email { get; set; } = "";
    [StringLength(300)] public string AddressBg { get; set; } = "";
    [StringLength(300)] public string AddressEn { get; set; } = "";
    [StringLength(300)] public string AddressRu { get; set; } = "";
    [StringLength(160)] public string OpeningHoursBg { get; set; } = "";
    [StringLength(160)] public string OpeningHoursEn { get; set; } = "";
    [StringLength(160)] public string OpeningHoursRu { get; set; } = "";
    [Required, StringLength(100)] public string TimeZoneId { get; set; } = "Europe/Sofia";
    [StringLength(2000)] public string LogoUrl { get; set; } = "";
    [StringLength(2000)] public string GoogleReviewUrl { get; set; } = "";
    [StringLength(2000)] public string FacebookUrl { get; set; } = "";
    [StringLength(2000)] public string InstagramUrl { get; set; } = "";
    [Range(0, 1440)] public int PublicLeadMinutes { get; set; } = 15;
    [Range(1, 365)] public int PublicMaxReservationDaysAhead { get; set; } = 10;
    [Required] public string PublicLatestReservationTime { get; set; } = "21:00";
    [Required] public string AdminLatestReservationTime { get; set; } = "23:00";
    [Required] public string WalkInOpeningTime { get; set; } = "10:00";
    [Required] public string WalkInLatestTime { get; set; } = "23:30";
}
