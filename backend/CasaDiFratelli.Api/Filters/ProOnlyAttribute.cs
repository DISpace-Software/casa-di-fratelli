using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CasaDiFratelli.Api.Filters;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class ProOnlyAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var tiers = context.HttpContext.RequestServices.GetRequiredService<ProductTierService>();

        if (!await tiers.IsProAsync())
        {
            context.Result = new ObjectResult(new { message = "Pro version is required." })
            {
                StatusCode = StatusCodes.Status402PaymentRequired
            };
            return;
        }

        await next();
    }
}
