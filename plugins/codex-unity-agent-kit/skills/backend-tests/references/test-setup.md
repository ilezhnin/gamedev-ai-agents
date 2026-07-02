# .NET Backend Test Setup

## Test project template (xUnit)

`tests/MyService.Tests/MyService.Tests.csproj` (mirror the solution's existing `src/`/`tests/` split; if the solution keeps tests next to source, match that instead):

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" PrivateAssets="all" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\src\MyService\MyService.csproj" />
  </ItemGroup>
</Project>
```

Add to the solution: `dotnet sln add tests/MyService.Tests`. With central package management (`Directory.Packages.props`), versions go there instead - either way the package additions are surfaced for approval first.

## Integration tests: WebApplicationFactory

Package: `Microsoft.AspNetCore.Mvc.Testing`. The entry point must be visible to the test project: either a public `Program` class or `InternalsVisibleTo`; minimal APIs need `public partial class Program {}` at the bottom of `Program.cs`.

```csharp
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services =>
        {
            // Replace only true externals (mail, payment SDKs). Keep the real
            // DI graph: the point of the integration level is real wiring.
        });
    }
}

public sealed class RegisterEndpointTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public RegisterEndpointTests(ApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Register_WhenEmailTaken_Returns409()
    {
        var payload = JsonContent.Create(new { Email = "taken@example.com", Password = "P4ssw0rd!" });
        await _client.PostAsync("/api/register", payload);

        var second = await _client.PostAsync("/api/register", payload);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }
}
```

## Database strategy

- **EF InMemory provider**: not a relational database - no transactions, no relational constraints, LINQ translated differently. Acceptable only for pure repository-shape smoke tests; never to prove query or migration behavior.
- **SQLite in-memory** (`DataSource=:memory:`): cheap relational semantics for most EF query tests; keep one open connection per test lifetime or the database vanishes.
- **Testcontainers**: the real engine for migrations, SQL specifics, concurrency, and anything production-critical. Requires Docker; when Docker is unavailable, report the gap instead of downgrading silently.

```csharp
public sealed class PostgresFixture : IAsyncLifetime
{
    public PostgreSqlContainer Container { get; } = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public Task InitializeAsync() => Container.StartAsync();
    public Task DisposeAsync() => Container.DisposeAsync().AsTask();
}
```

Wire the container's connection string into the factory via `builder.ConfigureServices` (replace the `DbContextOptions` registration), run migrations once per fixture, and reset state between tests (transaction rollback or table truncation - respect what the suite already does).

## Determinism

- Clock: inject `TimeProvider` (`Microsoft.Extensions.TimeProvider.Testing` ships `FakeTimeProvider`); never `DateTime.UtcNow` inside logic under test.
- Randomness: inject or fix the seed.
- Parallelism: xUnit runs test classes in parallel by default - no shared static state, no shared database rows between classes without isolation.

## Run commands

```powershell
# Only the tests just added
dotnet test --filter "FullyQualifiedName~RegisterEndpointTests"

# The affected test project
dotnet test tests/MyService.Tests

# With logs on failure
dotnet test tests/MyService.Tests --logger "console;verbosity=detailed"
```

Report the exact commands and their real results; `dotnet restore` or a green build is not a test run.
