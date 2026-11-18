using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using SeatMap.Api.Platform.Models;

namespace SeatMap.Api.Platform.Auth;

public sealed class GuestPlatformAvailableAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        if (!context.HttpContext.RequestServices.GetRequiredService<IOptions<PlatformOptions>>().Value.Enabled)
        {
            context.Result = new ObjectResult(new { code = "GUEST_ACCOUNTS_UNAVAILABLE", message = "Аккаунты пока недоступны на этом сервере. Попробуйте позже." }) { StatusCode = 503 };
            return;
        }
        await next();
    }
}

public sealed class GuestAuthorizeAttribute : Attribute, IAsyncActionFilter, IOrderedFilter
{
    public int Order => 10;
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var auth = context.HttpContext.RequestServices.GetRequiredService<GuestAuthService>();
        var session = await auth.FindSessionAsync(context.HttpContext.Request, context.HttpContext.RequestAborted);
        if (session == null)
        {
            context.Result = new UnauthorizedObjectResult(new { code = "SESSION_EXPIRED", message = "Войдите в аккаунт ещё раз." });
            return;
        }
        context.HttpContext.Items[typeof(GuestSession)] = session;
        await next();
    }
}

public sealed class GuestAuthErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not GuestAuthException error) return;
        context.Result = new ObjectResult(new { code = error.Code, message = error.Message }) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
