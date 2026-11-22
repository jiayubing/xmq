$ErrorActionPreference = 'Stop'

$photoDir = Join-Path $PSScriptRoot 'photos'
$catalog = Join-Path $PSScriptRoot 'photos.js'
$extensions = '.jpg', '.jpeg', '.png', '.webp', '.gif'
$entries = [Collections.Generic.List[object]]::new()
$known = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$previousExists = [IO.File]::Exists($catalog)

if ($previousExists) {
    $source = [IO.File]::ReadAllText($catalog)
    $match = [regex]::Match($source, '\A\s*window\.MIANJIZI_PHOTOS\s*=\s*(\[[\s\S]*\])\s*;?\s*\z')
    if (!$match.Success) {
        throw 'photos.js must contain a JSON array assigned to window.MIANJIZI_PHOTOS.'
    }
    $existing = ConvertFrom-Json -InputObject $match.Groups[1].Value
    foreach ($entry in $existing) {
        if ($null -eq $entry -or !$entry.src) {
            throw 'Every photo in photos.js needs a src.'
        }
        $key = [Uri]::UnescapeDataString(($entry.src -replace '^\./', ''))
        [void]$known.Add($key)
        $entries.Add($entry)
    }
}

$root = (Get-Item -LiteralPath $photoDir).FullName
$files = Get-ChildItem -LiteralPath $root -File -Recurse |
    Where-Object { $_.Extension -in $extensions } |
    Sort-Object FullName
$added = 0
foreach ($file in $files) {
    $parts = $file.FullName.Substring($root.Length + 1) -split '[/\\]'
    $relative = 'photos/' + ($parts -join '/')
    if (!$known.Add($relative)) { continue }
    $url = 'photos/' + (($parts | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/')
    $entries.Add([ordered]@{
        src = $url
        title = $file.BaseName
        note = '这张也晒过太阳，记得把一点暖意装进口袋。'
        pos = '50% 30%'
        zoom = 1.06
    })
    $added++
}

if ($added -gt 0 -or !$previousExists) {
    $json = ConvertTo-Json -Depth 20 -InputObject $entries.ToArray()
    $temporary = Join-Path $PSScriptRoot ('.photos-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::WriteAllText($temporary, "window.MIANJIZI_PHOTOS = $json;`n", [Text.UTF8Encoding]::new($false))
        if ($previousExists) {
            [IO.File]::Replace($temporary, $catalog, [NullString]::Value)
        } else {
            [IO.File]::Move($temporary, $catalog)
        }
    } finally {
        if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) }
    }
}

Write-Output ("Photos catalog: {0} total, {1} added." -f $entries.Count, $added)
