# C# Backend Discovery Checklist

Use this when the solution is unfamiliar or has more than a couple of projects.

## Root Signals

- `global.json`: pinned SDK version and roll-forward policy.
- `*.sln` / `*.slnx`: project membership and solution folders.
- `Directory.Build.props` / `Directory.Packages.props`: shared target frameworks, analyzers, central package versions.
- `src/**/Program.cs` (`Startup.cs` in older projects): composition root.
- `src/**/appsettings*.json`: configuration overlays per environment.
- `Dockerfile*`, `docker-compose*`: runtime image, service dependencies, exposed ports.
- `.github/workflows/*.yml`, `azure-pipelines*.yml`, `.gitlab-ci.yml`: the commands CI actually runs.

## Search Patterns

Use `rg --files` first, then targeted `rg`. Add `--hidden` for CI paths under dot-directories.

```powershell
# Toolchain and project graph
Get-ChildItem -Recurse -Depth 2 -Include global.json,*.sln,*.slnx,Directory.Build.props,Directory.Packages.props
rg --files -g "*.csproj"
rg "<TargetFramework|<ProjectReference|<PackageReference" -g "*.csproj"

# Composition root: DI and middleware order
rg -n "AddScoped|AddSingleton|AddTransient|AddDbContext|AddHostedService" -g "*.cs"
rg -n "AddAuthentication|AddAuthorization|AddJwtBearer|AddCookie|AddPolicy" -g "*.cs"
rg -n "app\.Use\w+|app\.Map\w+" -g "Program.cs" -g "Startup.cs" -g "*Extensions*.cs"

# Endpoint surface
rg -n "\[ApiController\]|: ControllerBase" -g "*.cs"
rg -n "MapGet|MapPost|MapPut|MapDelete|MapPatch|MapGroup|MapControllers" -g "*.cs"
rg -n "\[Route\(|\[Http(Get|Post|Put|Delete|Patch)" -g "*.cs"

# Auth usage at endpoints
rg -n "\[Authorize|RequireAuthorization|\[AllowAnonymous" -g "*.cs"

# Persistence: EF Core, migrations, Dapper
rg -n ": DbContext|DbSet<" -g "*.cs"
rg --files -g "**/Migrations/*.cs"
Get-ChildItem -Recurse -Filter *ModelSnapshot.cs
rg -n "using Dapper|QueryAsync|ExecuteAsync\(" -g "*.cs"
rg -n "GetConnectionString|ConnectionStrings" -g "*.cs" -g "appsettings*.json"

# Configuration layers and options binding
rg --files -g "appsettings*.json"
rg -n "UserSecretsId" -g "*.csproj"
rg -n "Configure<|BindConfiguration|GetSection\(" -g "*.cs"

# Background work
rg -n ": BackgroundService|IHostedService" -g "*.cs"

# Tests and their style
rg --files -g "*Test*.csproj"
rg -n "WebApplicationFactory|Testcontainers" -g "*.cs"
rg -n "using Xunit|using NUnit" -g "*.cs" --max-count 1

# CI and containers
rg --files --hidden -g ".github/workflows/*.yml" -g "azure-pipelines*.yml" -g ".gitlab-ci.yml"
rg --files -g "Dockerfile*" -g "docker-compose*"
```

## Output Template

Report only what helps the next step:

- SDK and target frameworks:
- Projects that matter:
- Composition root (key DI registrations, middleware order):
- Endpoint surface:
- Auth model (schemes, policies):
- Data layer (DbContexts, latest migration, Dapper usage):
- Configuration layers:
- Background workers:
- Test projects and style:
- CI / docker validation hooks:
- Candidate files:
- Ownership boundaries and risks:
- Recommended next action:
