<#
    Thrift by Eugy - add products from PowerShell

    The admin panel isn't wired to the API yet, so this talks to the API
    directly. Products added this way are REAL: they live in D1, and once the
    storefront is wired they appear automatically. Nothing has to be redone.

    SETUP (once per terminal session)
        $env:TBE_TOKEN = "your-admin-token"
        $env:TBE_API   = "https://thriftbyeugy-api.onyiah.workers.dev"

    USAGE
        .\Add-Product.ps1                      # interactive prompts
        .\Add-Product.ps1 -List                # show what's in the database
        .\Add-Product.ps1 -Stats               # dashboard counts
        .\Add-Product.ps1 -FromCsv .\items.csv # bulk import

    The token is read from an environment variable rather than typed into the
    script, so it never ends up committed to the repo by accident.
#>

param(
    [switch]$List,
    [switch]$Stats,
    [string]$FromCsv
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
$api   = $env:TBE_API
$token = $env:TBE_TOKEN

if (-not $api)   { $api = "https://thriftbyeugy-api.onyiah.workers.dev" }
if (-not $token) {
    Write-Host "No admin token found." -ForegroundColor Red
    Write-Host 'Set it first:  $env:TBE_TOKEN = "your-token"' -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

$CATEGORIES = @("Dresses","Outerwear","Denim","Tops","Accessories","Shoes")
$CONDITIONS = @("Excellent","Very Good","Good","Fair")
$SIZES      = @("XS","S","M","L","XL","Custom")

# ---------------------------------------------------------------------------
function Show-List {
    $r = Invoke-RestMethod -Uri "$api/api/admin/products" -Headers $headers
    if (-not $r.products -or $r.products.Count -eq 0) {
        Write-Host "No products yet." -ForegroundColor Yellow
        return
    }
    $r.products | Format-Table sku, name, category,
        @{ n = "price"; e = { "NGN {0:N0}" -f $_.price } },
        size, status, quantity -AutoSize
    Write-Host "$($r.products.Count) product(s)`n"
}

function Show-Stats {
    $r = Invoke-RestMethod -Uri "$api/api/admin/stats" -Headers $headers
    $s = $r.stats
    Write-Host ""
    Write-Host "  Live in shop     $($s.live)"
    Write-Host "  Drafts           $($s.drafts)"
    Write-Host "  Sold             $($s.sold)"
    Write-Host "  Reserved now     $($s.reserved_now)"
    Write-Host "  Pending orders   $($s.pending_orders)"
    Write-Host "  Paid orders      $($s.paid_orders)"
    Write-Host ("  Revenue          NGN {0:N0}" -f $s.revenue)
    Write-Host ""
}

function Get-NextSku {
    # Continue the TBE-#### sequence rather than making the user track numbers.
    try {
        $r = Invoke-RestMethod -Uri "$api/api/admin/products?limit=60" -Headers $headers
        $nums = $r.products |
            Where-Object { $_.sku -match '^TBE-(\d+)$' } |
            ForEach-Object { [int]($_.sku -replace '^TBE-', '') }
        $next = if ($nums) { ($nums | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    } catch {
        $next = 1
    }
    return "TBE-{0:D4}" -f $next
}

function Read-Choice($label, $options, $default) {
    Write-Host ""
    Write-Host "$label" -ForegroundColor Cyan
    for ($i = 0; $i -lt $options.Count; $i++) {
        $mark = if ($options[$i] -eq $default) { " (default)" } else { "" }
        Write-Host "  $($i+1). $($options[$i])$mark"
    }
    $pick = Read-Host "Choose 1-$($options.Count)"
    if (-not $pick) { return $default }
    $n = 0
    if ([int]::TryParse($pick, [ref]$n) -and $n -ge 1 -and $n -le $options.Count) {
        return $options[$n - 1]
    }
    return $default
}

function Add-One($body) {
    try {
        $json = $body | ConvertTo-Json -Depth 5
        $r = Invoke-RestMethod -Uri "$api/api/admin/products" -Method Post -Headers $headers -Body $json
        Write-Host "  Added $($body.sku) - $($body.name)" -ForegroundColor Green
        return $true
    } catch {
        $msg = $_.ErrorDetails.Message
        if ($msg) {
            try {
                $err = $msg | ConvertFrom-Json
                if ($err.errors) {
                    foreach ($e in $err.errors) {
                        Write-Host "  $($e.field): $($e.message)" -ForegroundColor Red
                    }
                } else {
                    Write-Host "  $($err.error)" -ForegroundColor Red
                }
            } catch {
                Write-Host "  $msg" -ForegroundColor Red
            }
        } else {
            Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
        }
        return $false
    }
}

function Import-Csv-Products($path) {
    if (-not (Test-Path $path)) {
        Write-Host "No file at $path" -ForegroundColor Red
        return
    }
    $rows = Import-Csv $path
    Write-Host "Importing $($rows.Count) row(s)...`n"
    $ok = 0
    foreach ($row in $rows) {
        $body = @{
            sku             = $row.sku
            name            = $row.name
            category        = $row.category
            price           = [int]$row.price
            size            = $row.size
            condition_grade = $row.condition
            color           = $row.color
            brand           = $row.brand
            description     = $row.description
            # Draft by default: nothing goes live until you've seen it listed.
            status          = if ($row.status) { $row.status } else { "draft" }
            quantity        = 1
        }
        if (Add-One $body) { $ok++ }
    }
    Write-Host "`n$ok of $($rows.Count) imported.`n"
}

function Add-Interactive {
    Write-Host ""
    Write-Host "  Add a product" -ForegroundColor Yellow
    Write-Host "  Press Enter to accept a default in brackets.`n"

    $suggested = Get-NextSku
    $sku = Read-Host "SKU [$suggested]"
    if (-not $sku) { $sku = $suggested }

    $name = Read-Host "Product name"
    while (-not $name) { $name = Read-Host "Product name (required)" }

    $category  = Read-Choice "Category" $CATEGORIES "Tops"
    $priceIn   = Read-Host "`nPrice in NGN (numbers only)"
    $price     = 0
    while (-not [int]::TryParse($priceIn, [ref]$price) -or $price -le 0) {
        $priceIn = Read-Host "Price must be a number above zero"
    }

    $size      = Read-Choice "Size" $SIZES "M"
    $condition = Read-Choice "Condition" $CONDITIONS "Excellent"

    $color = Read-Host "`nColour (e.g. Coral)"
    $brand = Read-Host "Brand (Enter to skip if unlabeled)"
    $desc  = Read-Host "Description - fabric, fit, any flaws"

    $body = @{
        sku             = $sku
        name            = $name
        category        = $category
        price           = $price
        size            = $size
        condition_grade = $condition
        color           = $color
        brand           = $brand
        description     = $desc
        quantity        = 1
        status          = "draft"
    }

    Write-Host ""
    Write-Host "  $sku  $name" -ForegroundColor Cyan
    Write-Host ("  {0} - {1} - Size {2} - {3} - NGN {4:N0}" -f $category, $condition, $size, $color, $price)
    Write-Host "  Saved as DRAFT. Publish it once you've checked how it looks."
    Write-Host ""

    $go = Read-Host "Add it? (y/n)"
    if ($go -eq "y") {
        if (Add-One $body) {
            Write-Host ""
            $again = Read-Host "Add another? (y/n)"
            if ($again -eq "y") { Add-Interactive }
        }
    } else {
        Write-Host "  Cancelled." -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  Thrift by Eugy" -ForegroundColor Yellow
Write-Host "  $api"

if     ($List)    { Show-List }
elseif ($Stats)   { Show-Stats }
elseif ($FromCsv) { Import-Csv-Products $FromCsv }
else              { Add-Interactive }
