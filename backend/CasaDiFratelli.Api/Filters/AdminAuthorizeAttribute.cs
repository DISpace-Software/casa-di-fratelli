using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CasaDiFratelli.Api.Filters;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class AdminAuthorizeAttribute : Attribute, IAsyncActionFilter
{
    private readonly string[] _roles;

    public AdminAuthorizeAttribute(params string[] roles)
    {
        _roles = roles;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var auth = context.HttpContext.RequestServices.GetRequiredService<AdminAuthService>();

        if (!await auth.IsAuthorizedAsync(context.HttpContext.Request))
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Admin password is required." });
            return;
        }

        var principal = AdminAuthService.Current(context.HttpContext);
        if (_roles.Length > 0 && (principal == null || !_roles.Contains(principal.Role)))
        {
            context.Result = new StatusCodeResult(StatusCodes.Status403Forbidden);
            return;
        }

        await next();
    }
}
