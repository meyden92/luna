# Development Setup

This are the required steps to setup a development environment.

## Setup workspace

### 1. Clone and install

- Clone the project and run `npm install`.
- Setup prisma `npx prisma generate`
- Setup husky `npx husky init`

## Setting Up a PowerShell Function Alias for `npm run commit`

This guide will walk you through the steps to create a PowerShell function that allows you to run `npm run commit` with a shorter command, `cm`.

### 1. Open PowerShell Profile Script

Open your PowerShell profile script in Notepad:

```powershell
notepad $PROFILE
```

### 2. Add the function

```
function cm {
    npm run commit
}
```

### 3. Change Execution Policy

If you encounter an error about script execution being disabled, you need to change the execution policy. Open PowerShell as an Administrator and run:

```
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 4. Reload the Profile

To apply the changes immediately without restarting PowerShell, run:

```
. $PROFILE
```
