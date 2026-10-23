using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using CasaDiFratelli.Api.Controllers;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;

static void Check(bool result, string message) { if (!result) throw new Exception(message); }
Check(CasaDrinkPhotos.Resolve("", true, "Bar", "Кока-Кола", "250 мл").StartsWith("/drinks/"), "Casa drink must have a catalogue photo");
Check(CasaDrinkPhotos.Resolve("/custom.png", true, "Bar", "Кока-Кола", "250 мл") == "/custom.png", "Admin photo must take precedence over the catalogue");
Check(CasaDrinkPhotos.Resolve("", false, "Bar", "Кока-Кола", "250 мл") == "", "Casa photos must not appear for another tenant");
Check(CasaDrinkPhotos.Resolve("", true, "Kitchen", "Кока-Кола", "250 мл") == "", "Catalogue must apply only to drinks");
Check(CasaDrinkPhotos.Resolve("", true, "Bar", "Unknown drink", "250 мл") == "", "Unknown products must retain the normal fallback");
await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
Check(db.Database.GetMigrations().Contains("20261019195000_PreserveOrdersAfterReservationDeletion"), "Order preservation migration is not discoverable");
await db.Database.EnsureCreatedAsync();
var controller = new MaintenanceController(db, new AuditService(db), null!, new ReservationConflictService(db));
controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
controller.HttpContext.Items["AdminUser"] = new AdminPrincipal(1, "Test admin", "test@example.com", "Administrator");
db.AdminUsers.Add(new AdminUser { Id = 1, Name = "Test admin", Email = "test@example.com" });
await db.SaveChangesAsync();
var date = new DateOnly(2026, 10, 17);
Reservation Booking(int id, string status, string table) => new() { Id = id, GuestName = "Test", Phone = "test", Area = "indoor", ReservedDate = date, ReservedTime = "19:00", Status = status, GuestCount = 2, Tables = [new() { TableCode = table }] };
var cancelled = Booking(1, "Cancelled", "1");
var active = Booking(2, "Approved", "2");
var conflict = Booking(3, "Cancelled", "2");
var archived = Booking(4, "Pending", "4"); archived.IsDeleted = true;
var walkin = Booking(5, "Cancelled", "5"); walkin.IsWalkIn = true;
db.Reservations.AddRange(cancelled, active, conflict, archived, walkin);
await db.SaveChangesAsync();
Check(await controller.GetDeletedReservations() is OkObjectResult, "Trash query failed");
var trash = (OkObjectResult)await controller.GetReservationArchive("deleted");
var json = System.Text.Json.JsonSerializer.Serialize(trash.Value);
Check(json.Contains("\"Id\":1") && json.Contains("\"Id\":4") && json.Contains("\"Id\":5") && !json.Contains("\"Id\":2"), "Trash must contain cancelled, archived and walk-in bookings only");
Check(await controller.RestoreReservation(3) is ConflictObjectResult, "Restore must reject occupied tables");
Check(conflict.Status == "Cancelled", "Failed restore changed status");
Check(await controller.RestoreReservation(1) is OkObjectResult && cancelled.Status == "Approved", "Cancelled booking must become active");
Check(cancelled.Tables.Single().TableCode == "1", "Restore lost table assignment");
Check(await controller.RestoreReservation(4) is OkObjectResult && !archived.IsDeleted && archived.Status == "Pending", "Archived pending booking must retain status");
Check(await controller.PermanentlyDeleteReservation(2) is BadRequestObjectResult, "Active bookings must never be purged");
var linkedOrder = new DiningOrder { ReservationId = 3, GuestName = "Test guest", TableLabel = "2", TotalPrice = 24m, Status = "Done", Items = [new() { Name = "Test dish", UnitPrice = 12m, Quantity = 2, Status = "Done" }] };
var alreadyArchived = new DiningOrder { ReservationId = 3, IsDeleted = true, DeleteReason = "Earlier archive", TotalPrice = 5m };
db.DiningOrders.AddRange(linkedOrder, alreadyArchived); await db.SaveChangesAsync();
Check(await controller.PermanentlyDeleteReservation(5) is NoContentResult, "Cancelled booking purge failed");
Check(!await db.Reservations.IgnoreQueryFilters().AnyAsync(x => x.Id == 5) && !await db.ReservationTables.AnyAsync(x => x.ReservationId == 5), "Purge left booking or table links");
Check(await db.Reservations.AnyAsync(x => x.Id == 2) && await db.DiningOrders.AnyAsync(x => x.ReservationId == 3), "Unrelated operational data changed");
string GuestSnapshot() => System.Text.Json.JsonSerializer.Serialize(new { active.Id, active.GuestName, active.ReservedDate, active.ReservedTime, active.Status, active.IsArrived, active.IsDeleted, Tables = active.Tables.Select(t => t.TableCode).ToList() });
var guestSnapshot = GuestSnapshot();
var reservationsController = new ReservationsController(db, null!, null!, new ReservationConflictService(db), null!, new AuditService(db), null!, null!, null!, null!, null!)
{ ControllerContext = controller.ControllerContext };
Check(await reservationsController.BlockTables(new CasaDiFratelli.Api.Dtos.CreateHallBlockRequest
{ ReservedDate = date, Area = "indoor", Times = ["18:15", "20:45"], TableIds = ["2", "6"], Note = "Private event" }) is OkObjectResult, "Block over existing booking must succeed");
Check(GuestSnapshot() == guestSnapshot, "Hall block changed existing guest reservation");
var block = await db.Reservations.SingleAsync(x => x.GuestName == "Admin block");
Check(block.ReservedTime == "18:15 - 20:45" && block.Tables.Count == 2, "Hall block lost time range or tables");
var conflictService = new ReservationConflictService(db);
Check(await conflictService.FindTableConflictAsync(date, "19:30", ["6"]) != null, "New booking inside block must be rejected");
Check(await conflictService.FindTableConflictAsync(date, "20:45", ["6"]) != null, "Block must include exact end time");
Check(await conflictService.FindTableConflictAsync(date, "21:00", ["6"]) == null, "Block must not extend beyond selected end");
Check(await conflictService.FindTableConflictAsync(date, "18:00", ["6"]) == null, "Block must not start before selected time");
Check(await conflictService.FindTableConflictAsync(date.AddDays(1), "19:30", ["6"]) == null, "Block must not affect another date");
Check(await conflictService.FindTableConflictAsync(date, "19:30", ["99"]) == null, "Block must not affect other tables");
Check(ReservationConflictService.IsWithinHallBlock("22:00 - 01:00", new TimeOnly(0, 30)), "Overnight block failed");
Check(await conflictService.FindTableConflictAsync(date, "19:30", ["6"], includeHallBlocks: false) == null, "Admin must work inside a public hall block");
Check(await conflictService.FindTableConflictAsync(date, "19:00", ["2"], includeHallBlocks: false) != null, "Admin must still respect real guest reservations");
Check(await conflictService.FindTableConflictAsync(date, "19:30", ["6"]) != null, "Public booking must remain blocked while admin works");
Check(await reservationsController.UpdateTables(active.Id, new CasaDiFratelli.Api.Dtos.UpdateReservationTablesRequest { TableIds = ["2"] }) is OkObjectResult, "Admin table editing must work while public hall block is active");
Check(await conflictService.FindTableConflictAsync(date, "19:30", ["6"]) != null, "Admin editing must not remove public block");
Check(await reservationsController.UnblockHall(active.Id) is BadRequestObjectResult, "Unblock must reject guest reservations");
Check(await reservationsController.UnblockHall(block.Id) is OkObjectResult && block.Status == "Released", "Unblock must release selected hall block");
Check(await conflictService.FindTableConflictAsync(date, "19:30", ["6"]) == null, "Unblock must open tables to new bookings");
Check(GuestSnapshot() == guestSnapshot, "Unblock changed existing guest booking");
Check(await reservationsController.UnblockHall(block.Id) is OkObjectResult, "Unblock retry must be idempotent");
Console.WriteLine("PASS: unblock affects only hall blocks, opens availability, preserves guests and supports retry.");
Console.WriteLine("PASS: hall block over existing guests, unchanged guest data, exact time boundaries, date/table isolation and overnight range.");
Check(await controller.PermanentlyDeleteReservation(3) is NoContentResult, "Linked orders must no longer prevent reservation purge");
Check(!await db.Reservations.IgnoreQueryFilters().AnyAsync(x => x.Id == 3), "Reservation with orders was not purged");
var preservedOrder = await db.DiningOrders.IgnoreQueryFilters().Include(x => x.Items).SingleAsync(x => x.Id == linkedOrder.Id);
Check(preservedOrder.ReservationId == null && preservedOrder.IsDeleted && preservedOrder.TotalPrice == 24m && preservedOrder.Status == "Done", "Order history was changed or not archived");
Check(preservedOrder.Items.Single().Name == "Test dish" && preservedOrder.Items.Single().Quantity == 2, "Order items were lost");
Check(alreadyArchived.ReservationId == null && alreadyArchived.DeleteReason == "Earlier archive", "Existing archive metadata changed");
Check(await db.Reservations.AnyAsync(x => x.Id == 2), "Purging linked booking changed unrelated reservation");
Console.WriteLine("PASS: reservation purge detaches and archives linked orders, preserves amounts/items/status and existing archive metadata.");
controller.HttpContext.Items["AdminUser"] = new AdminPrincipal(2, "Waiter", "waiter@example.com", "Waiter");
Check(await controller.PermanentlyDeleteReservation(3) is ForbidResult && await controller.RestoreReservation(3) is ForbidResult, "Waiter must not restore or delete trash");
Console.WriteLine("PASS: trash contents, walk-ins, restore, conflicts, purge, linked orders, unrelated bookings, role restrictions.");

var marketing = new MarketingController(db, null!, null!) { ControllerContext = controller.ControllerContext };
Check(await marketing.GetHistory() is ForbidResult, "Marketing history must enforce owner/developer permissions");
controller.HttpContext.Items["AdminUser"] = new AdminPrincipal(1, "Test owner", "test@example.com", "Owner");
db.CustomerProfiles.Add(new CustomerProfile { Email = " Guest@Example.com ", GuestName = "History Guest" });
db.MarketingMessageLogs.AddRange(
    new MarketingMessageLog { CampaignKey = "birthday", CustomerKey = "guest@example.com", Email = "guest@example.com", Subject = "Birthday greeting", SentForDate = date, SentAtUtc = new DateTime(2026, 10, 17, 8, 0, 0, DateTimeKind.Utc) },
    new MarketingMessageLog { CampaignKey = "loyalty", CustomerKey = "other@example.com", Email = "other@example.com", Subject = "Loyal guest", SentForDate = date, SentAtUtc = new DateTime(2026, 10, 18, 8, 0, 0, DateTimeKind.Utc) });
await db.SaveChangesAsync();
async Task<System.Text.Json.JsonElement> History(string? campaign = null, string? search = null, int page = 1, int size = 20)
{
    var result = await marketing.GetHistory(campaign, search, page, size) as OkObjectResult;
    Check(result != null, "History request failed");
    return System.Text.Json.JsonSerializer.SerializeToElement(result!.Value);
}
var history = await History(size: 1);
Check(history.GetProperty("Total").GetInt32() == 2 && history.GetProperty("Items")[0].GetProperty("CampaignKey").GetString() == "loyalty", "History must paginate newest first");
history = await History(search: "HISTORY GUEST");
Check(history.GetProperty("Total").GetInt32() == 1 && history.GetProperty("Items")[0].GetProperty("GuestName").GetString() == "History Guest", "History must search names and resolve normalized email");
Check(history.GetProperty("Items")[0].GetProperty("SentAtUtc").GetString()!.EndsWith("Z"), "History timestamps must explicitly indicate UTC");
Check((await History(campaign: "birthday")).GetProperty("Total").GetInt32() == 1, "Campaign filter failed");
Check((await History(search: "OTHER@EXAMPLE")).GetProperty("Total").GetInt32() == 1, "Recipient search must be case insensitive");
Check((await History(search: "no match")).GetProperty("Total").GetInt32() == 0, "Empty history search failed");
Check((await History(page: int.MaxValue, size: 1)).GetProperty("Page").GetInt32() == 2, "Out of range page must clamp safely");
Check(await marketing.GetHistory(pageSize: 101) is BadRequestObjectResult, "History page size must be bounded");
Check(await db.MarketingMessageLogs.CountAsync() == 2, "Reading history must not modify or send messages");
Console.WriteLine("PASS: marketing history permissions, search, campaign filter, pagination, UTC timestamps and read-only behavior.");


// Capture Resend requests locally: these checks never contact an email provider.
var emailConfig = new ConfigurationBuilder().AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"))
    .AddInMemoryCollection(new Dictionary<string, string?> {
        ["RESEND_API_KEY"] = "test-only-not-a-real-key",
        ["FROM_EMAIL"] = "Casa di Fratelli <reservations@mail.casadifratelli.bg>",
        ["MARKETING_FROM_EMAIL"] = "Casa di Fratelli <offers@mail.casadifratelli.bg>",
        ["ADMIN_EMAIL"] = "fratellirestaurant25@gmail.com"
    }).Build();
var casaTenant = new CurrentTenant();
casaTenant.Resolve(new TenantDefinition { Id = "casa-di-fratelli", Name = "Casa di Fratelli", Slug = "casa-di-fratelli" });
var emailBranding = new TenantBrandingService(db, casaTenant, emailConfig, NullLogger<TenantBrandingService>.Instance);
var capture = new CaptureEmailHandler();
var emailService = new EmailService(new HttpClient(capture), emailConfig, NullLogger<EmailService>.Instance, emailBranding);
await emailService.SendAsync("guest@example.com", "Confirmation", "<p>Confirmation</p>");
await emailService.TrySendMarketingAsync("guest@example.com", "Birthday", "<p>Birthday</p>", "test-birthday");
await emailService.SendAsync(emailBranding.GetEmailConfiguration("ADMIN_EMAIL")!, "New confirmed reservation", "<p>Admin notice</p>");
Check(capture.Messages.Count == 3, "Expected all three local email requests");
Check(capture.Messages[0].GetProperty("from").GetString() == "Casa di Fratelli <reservations@casadifratelli.bg>", "Guest sender must use reservations at main domain despite legacy global config");
Check(capture.Messages[1].GetProperty("from").GetString() == "Casa di Fratelli <friends@casadifratelli.bg>", "Marketing sender must use friends at main domain");
Check(capture.Messages[2].GetProperty("to")[0].GetString() == "fratellirestaurant25@gmail.com", "Admin notifications must retain original inbox");
var otherTenant = new CurrentTenant();
otherTenant.Resolve(new TenantDefinition { Id = "other", Name = "Other", Slug = "other" });
var otherBranding = new TenantBrandingService(db, otherTenant, emailConfig, NullLogger<TenantBrandingService>.Instance);
Check(otherBranding.GetEmailConfiguration("FROM_EMAIL") == null, "Another tenant must not inherit Casa senders");
Console.WriteLine("PASS: separate reservation/marketing senders, legacy config precedence, unchanged admin recipient and tenant isolation; no real emails sent.");

// Seasonal visibility changes never rewrite guests, tables or ordinary date/time blocks.
var seasonalZones = new SeasonalZoneService(db);
Check((await seasonalZones.GetClosedAreasAsync()).Length == 0, "Zones must be open by default");
var seasonalSnapshotOptions = new System.Text.Json.JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles };
var beforeSeasonalBookings = System.Text.Json.JsonSerializer.Serialize(await db.Reservations.AsNoTracking().Include(x => x.Tables).OrderBy(x => x.Id).ToListAsync(), seasonalSnapshotOptions);
await seasonalZones.SetClosedAsync("openTerrace", true);
await seasonalZones.SetClosedAsync("garden", true);
await seasonalZones.SetClosedAsync("openTerrace", true);
Check((await seasonalZones.GetClosedAreasAsync()).Length == 2, "Closing a second zone must preserve the first closure; repeated saves must be idempotent");
Check(await seasonalZones.IsSelectionClosedAsync("openTerrace", ["46"]), "A closed area must reject new reservations");
Check(await seasonalZones.IsSelectionClosedAsync("indoor", ["46"]), "Changing Area must not bypass a closed table zone");
Check(!await seasonalZones.IsSelectionClosedAsync("indoor", ["1"]), "Open areas must remain bookable");
await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"TableLayouts\" (\"Id\" integer PRIMARY KEY, \"LayoutJson\" text NOT NULL)");
var customLayoutJson = "[{\"id\":\"custom-terrace\",\"area\":\"openTerrace\",\"x\":12,\"y\":34,\"seats\":4,\"isActive\":true}]";
await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"TableLayouts\" (\"Id\", \"LayoutJson\") VALUES (1, {customLayoutJson}) ON CONFLICT (\"Id\") DO UPDATE SET \"LayoutJson\" = {customLayoutJson}");
Check(await seasonalZones.IsSelectionClosedAsync("indoor", ["custom-terrace"]), "Custom layout tables must also obey seasonal closure");
var seasonalBookingController = new ReservationsController(db, null!, null!, new ReservationConflictService(db), null!, new AuditService(db), null!, null!, new RestaurantClosureService(db), null!, null!);
var closedBooking = await seasonalBookingController.Create(new CasaDiFratelli.Api.Dtos.CreateReservationRequest {
 GuestName = "Seasonal test", Phone = "test", Email = "test@example.com", PrivacyConsent = true, GuestCount = 2,
 Area = "indoor", TableIds = ["custom-terrace"], ReservedDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1), ReservedTime = "19:00"
});
Check(closedBooking is ConflictObjectResult, "The reservation endpoint must reject stale clients for a closed zone before creating any data");
await seasonalZones.SetClosedAsync("openTerrace", false);
Check((await new SeasonalZoneService(db).GetClosedAreasAsync()).SequenceEqual(["garden"]), "Reopening must persist and leave other zones closed");
Check(!await seasonalZones.IsSelectionClosedAsync("openTerrace", ["custom-terrace"]), "Reopening must immediately restore table availability");
Check(beforeSeasonalBookings == System.Text.Json.JsonSerializer.Serialize(await db.Reservations.AsNoTracking().Include(x => x.Tables).OrderBy(x => x.Id).ToListAsync(), seasonalSnapshotOptions), "Seasonal closure and reopen must preserve every existing booking and table assignment");
await using (var layoutCheck = db.Database.GetDbConnection().CreateCommand()) {
 layoutCheck.CommandText = "SELECT \"LayoutJson\" FROM \"TableLayouts\" WHERE \"Id\" = 1";
 Check((string?)await layoutCheck.ExecuteScalarAsync() == customLayoutJson, "Reopening must preserve the exact saved layout");
}
await seasonalZones.SetClosedAsync("garden", false);
Console.WriteLine("PASS: seasonal close/reopen persistence, independent areas, stale-client prevention, custom tables, unchanged guests and layout.");

// Complete release -> persistent queue -> mocked Resend -> retry flow; no guest emails leave this process.
Check(db.Database.GetMigrations().Contains("20261024010000_AddVisitFeedbackEmailQueue"), "Visit email queue migration must be discoverable");
var visitEmails = new VisitFeedbackEmailService(db, emailService, emailBranding);
var visitController = new ReservationsController(db, emailService, emailConfig, new ReservationConflictService(db), null!, new AuditService(db), null!, null!, new RestaurantClosureService(db), casaTenant, emailBranding, visitEmails)
{ ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
Reservation Visit(int id, string email, string phone = "0888123456", bool arrived = true) => new() {
 Id = id, GuestName = "Visit <Test>", Phone = phone, Email = email, GuestCount = 2, Area = "indoor", ReservedDate = date,
 ReservedTime = "19:00", Status = "Approved", IsArrived = arrived, Tables = [new() { TableCode = "1" }]
};
var firstVisit = Visit(101, "  FIRST.VISIT@example.com  ");
var cancelledBefore = Visit(102, "first.visit@example.com"); cancelledBefore.Status = "Cancelled"; cancelledBefore.IsArrived = false;
var futureBefore = Visit(103, "first.visit@example.com", arrived: false); futureBefore.ReservedDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7);
db.Reservations.AddRange(firstVisit, cancelledBefore, futureBefore);
db.CustomerProfiles.Add(new CustomerProfile { Email = "first.visit@example.com", Phone = "0888123456", GuestName = "First visit", ReservationCount = 20 });
await db.SaveChangesAsync();
var initialMailCount = capture.Messages.Count;
Check(await visitController.Release(101) is OkObjectResult && firstVisit.Status == "Released", "Arrived guest must be released");
var firstEmail = await db.VisitFeedbackEmails.AsNoTracking().SingleAsync(x => x.ReservationId == 101);
Check(firstEmail.IsFirstVisitInvitation && firstEmail.SentAtUtc.HasValue && firstEmail.Email == "first.visit@example.com", "First actual visit must receive the survey despite cancelled/future bookings and inflated profile counts");
Check(firstEmail.Html.Contains("/feedback?reservationId=101&amp;") && firstEmail.Html.Contains("Visit &lt;Test&gt;") && firstEmail.Html.Contains("5%"), "First visit must use the correct escaped survey link and original offer");
Check(capture.Messages.Count == initialMailCount + 1, "Release must send one email");
Check(await visitController.Release(101) is OkObjectResult && capture.Messages.Count == initialMailCount + 1, "Repeated release must not resend an accepted email");
var returnVisit = Visit(104, "new.address@example.com", "+359 888 123 456"); db.Reservations.Add(returnVisit); await db.SaveChangesAsync();
await visitController.Release(104);
Check(!(await db.VisitFeedbackEmails.AsNoTracking().SingleAsync(x => x.ReservationId == 104)).IsFirstVisitInvitation, "Same phone in international format must count the completed previous visit");
var unvisited = Visit(105, "not.visited@example.com", arrived: false);
var noShowVisit = Visit(106, "noshow@example.com"); noShowVisit.IsNoShow = true;
var cancelledVisit = Visit(107, "cancelled@example.com"); cancelledVisit.Status = "Cancelled";
var oldReleased = Visit(108, "legacy@example.com"); oldReleased.Status = "Released"; oldReleased.IsArrived = false;
db.Reservations.AddRange(unvisited, noShowVisit, cancelledVisit, oldReleased); await db.SaveChangesAsync();
var beforeSkipped = capture.Messages.Count;
await visitController.Release(105);
Check(await visitController.Release(106) is BadRequestObjectResult && noShowVisit.IsNoShow, "No-show release must not turn into a real visit");
Check(await visitController.Release(107) is BadRequestObjectResult && cancelledVisit.Status == "Cancelled", "Cancelled reservations must stay cancelled");
await visitController.Release(108);
Check(capture.Messages.Count == beforeSkipped && !await db.VisitFeedbackEmails.AnyAsync(x => x.ReservationId >= 105 && x.ReservationId <= 108), "Unvisited, no-show, cancelled and legacy released bookings must never trigger review emails");
var laterActualVisit = Visit(110, "not.visited@example.com", "0888000110"); db.Reservations.Add(laterActualVisit); await db.SaveChangesAsync();
await visitController.Release(110);
Check((await db.VisitFeedbackEmails.AsNoTracking().SingleAsync(x => x.ReservationId == 110)).IsFirstVisitInvitation, "Releasing an unarrived reservation must not consume the first actual visit invitation");
var failedVisit = Visit(109, "retry@example.com", "0888999111"); db.Reservations.Add(failedVisit); await db.SaveChangesAsync();
capture.FailNext = true;
var failedRelease = (OkObjectResult)await visitController.Release(109);
Check(failedVisit.Status == "Released" && System.Text.Json.JsonSerializer.Serialize(failedRelease.Value).Contains("queued"), "Provider failure must preserve release and report queued delivery");
var pendingMail = await db.VisitFeedbackEmails.AsNoTracking().SingleAsync(x => x.ReservationId == 109);
Check(pendingMail.SentAtUtc == null && pendingMail.LastError != null && pendingMail.Attempts == 1, "Failed sending must not be marked sent");
var failedKey = capture.IdempotencyKeys.Last();
await db.VisitFeedbackEmails.Where(x => x.ReservationId == 109).ExecuteUpdateAsync(setters => setters.SetProperty(x => x.NextAttemptAtUtc, DateTime.UtcNow.AddMinutes(-1)));
await using (var retryDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options)) {
 var retryBranding = new TenantBrandingService(retryDb, casaTenant, emailConfig, NullLogger<TenantBrandingService>.Instance);
 var retryService = new VisitFeedbackEmailService(retryDb, emailService, retryBranding);
 await retryService.RetryPendingAsync();
 var sentMail = await retryDb.VisitFeedbackEmails.AsNoTracking().SingleAsync(x => x.ReservationId == 109);
 Check(sentMail.SentAtUtc.HasValue && sentMail.Attempts == 2 && sentMail.LastError == null, "Pending emails must recover across service scopes after provider failure");
 var sentCount = capture.Messages.Count; await retryService.RetryPendingAsync();
 Check(capture.Messages.Count == sentCount, "Background processing must not resend accepted emails");
}
Check(!string.IsNullOrWhiteSpace(failedKey) && capture.IdempotencyKeys.Last() == failedKey, "Retries must use the same provider idempotency key");
Check(capture.Messages.Last().GetProperty("from").GetString() == "Casa di Fratelli <reservations@casadifratelli.bg>", "Feedback mail must use the configured corporate sender");
Console.WriteLine("PASS: first completed visit, cancelled/future bookings, phone normalization, repeat-release deduplication, no-show protection, persisted failure/retry and corporate sender; no real email sent.");

var beforeTestReservations = await db.Reservations.CountAsync();
var beforeTestQueue = await db.VisitFeedbackEmails.CountAsync();
Check(await visitEmails.SendTestAsync("test.only@example.com", "https://casadifratelli.bg"), "The test email must use the same template/sender path");
var testEmail = capture.Messages.Last(); var testKey = capture.IdempotencyKeys.Last();
Check(testEmail.GetProperty("subject").GetString()!.StartsWith("[ТЕСТ]"), "Test messages must be clearly labelled");
Check(testEmail.GetProperty("html").GetString()!.Contains("/feedback?email=") && !testEmail.GetProperty("html").GetString()!.Contains("reservationId=0"), "Test survey links must not reference a nonexistent booking");
await visitEmails.SendTestAsync("TEST.ONLY@example.com", "https://casadifratelli.bg");
Check(capture.IdempotencyKeys.Last() == testKey, "Retrying a test on the same day must use the same provider idempotency key");
Check(await db.Reservations.CountAsync() == beforeTestReservations && await db.VisitFeedbackEmails.CountAsync() == beforeTestQueue, "Email tests must not create fake bookings or guest histories");
Console.WriteLine("PASS: labelled test email, safe survey URL, same-day idempotency and no fake reservations.");

sealed class CaptureEmailHandler : HttpMessageHandler
{
    public List<System.Text.Json.JsonElement> Messages { get; } = [];
    public List<string?> IdempotencyKeys { get; } = [];
    public bool FailNext { get; set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Messages.Add(System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(await request.Content!.ReadAsStringAsync(cancellationToken)));
        IdempotencyKeys.Add(request.Headers.TryGetValues("Idempotency-Key", out var keys) ? keys.Single() : null);
        var status = FailNext ? System.Net.HttpStatusCode.ServiceUnavailable : System.Net.HttpStatusCode.OK;
        FailNext = false;
        return new HttpResponseMessage(status) { Content = new StringContent("{}") };
    }
}
