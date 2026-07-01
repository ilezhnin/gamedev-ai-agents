# C# Backend Validation Commands

Prefer commands documented by the project. Use these only as templates after identifying the solution or project path.

## Discovery

```powershell
dotnet --info
dotnet --list-sdks
Get-ChildItem -Recurse -Filter *.sln
Get-ChildItem -Recurse -Filter *.csproj
```

## Restore And Build

```powershell
dotnet restore .\MySolution.sln
dotnet build .\MySolution.sln --no-restore
dotnet build .\src\MyService\MyService.csproj
```

Use `--configuration Release` only when the project or CI requires it for the validation target.

## Tests

```powershell
dotnet test .\tests\MyService.Tests\MyService.Tests.csproj --no-build
dotnet test .\MySolution.sln --filter "FullyQualifiedName~TargetName"
dotnet test .\MySolution.sln --collect:"XPlat Code Coverage"
```

Broaden from targeted project tests to solution-wide tests only when the changed surface is shared or the narrower check is insufficient.

## Formatting And Analyzers

```powershell
dotnet format .\MySolution.sln --verify-no-changes
dotnet build .\MySolution.sln -warnaserror
```

Run these only when the repo uses `dotnet format`, analyzers, or warning-as-error in CI.

## EF Core

```powershell
dotnet ef migrations list --project .\src\Data\Data.csproj --startup-project .\src\Api\Api.csproj
dotnet ef migrations script --idempotent --project .\src\Data\Data.csproj --startup-project .\src\Api\Api.csproj
```

Do not run `database update` against a real shared database unless the user explicitly asks and the target is confirmed.

## API Or Runtime Smoke Checks

```powershell
dotnet run --project .\src\Api\Api.csproj
Invoke-WebRequest http://localhost:5000/health
```

Use the project's documented ports, launch profile, health endpoint, and environment variables.

## Reporting

Report exact commands and outcomes:

- Passed: command completed successfully.
- Failed: include the failing command and the first actionable error.
- Skipped: explain the blocker, such as missing SDK, database, containers, credentials, or documented command.
