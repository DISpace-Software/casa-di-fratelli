using SeatMap.Api.Platform;
using SeatMap.Api.Platform.Services;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

[ApiController]
[PlatformEndpoint]
[Route("api/v1/restaurants")]
public sealed class RestaurantCatalogController(RestaurantCatalog catalog) : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Ok(new { restaurants = catalog.List() });

    [HttpGet("{restaurantId}")]
    public IActionResult Get(string restaurantId) => catalog.Find(restaurantId) is { } restaurant
        ? Ok(restaurant)
        : NotFound(new { code = "RESTAURANT_NOT_FOUND", message = "Restaurant is not listed." });
}
