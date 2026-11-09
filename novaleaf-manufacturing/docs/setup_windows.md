# Setup on Windows

## What each piece is

| Component | What it is |
|---|---|
| **SQL Server** | The database engine: a Windows service that stores data and runs queries |
| **SSMS** (SQL Server Management Studio) | The desktop application used to connect to the engine and write queries. It stores no data |
| **T-SQL** | Microsoft's SQL dialect: standard SQL plus extensions (`TOP`, variables, `TRY...CATCH`, procedures) |

## 1. Check what is already installed

Open PowerShell (no admin rights needed; these commands only read information):

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)   # RAM in GB
[math]::Round((Get-PSDrive C).Free / 1GB, 1)                                          # free GB on C:
Get-Service -Name 'MSSQL*','SQLAgent*','SQLBrowser' -ErrorAction SilentlyContinue |
    Select-Object Name, Status, StartType
```

`MSSQLSERVER` = default instance; `MSSQL$SQLEXPRESS` (or another name) = named instance.

## 2. Install (only what is missing)

1. **SQL Server 2022 Developer** (free for development and testing):
   <https://www.microsoft.com/en-us/sql-server/sql-server-downloads> → *Developer* → *Basic* installation.
   Requires a 64-bit Windows 10/11 and administrator rights.
2. **SSMS**: <https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms>
   (official Microsoft Learn page; it redirects to the current SSMS version).

## 3. Verify that the server works

In SSMS connect to `localhost` (or `localhost\SQLEXPRESS` for a named instance) with *Windows
Authentication*. If the certificate warning appears, tick *Trust server certificate*. Then run:

```sql
SELECT @@VERSION                         AS version,
       SERVERPROPERTY('Edition')         AS edition,
       SERVERPROPERTY('ProductVersion')  AS product_version;
```

`product_version` starting with `16.` = SQL Server 2022, `15.` = 2019.

## 4. Build the project

Follow "How to run" in the [README](../README.md).
