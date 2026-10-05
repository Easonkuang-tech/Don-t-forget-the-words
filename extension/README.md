# RepLoop Edge Extension

## Build

```bash
npm run build:extension
```

Output:

```text
extension/dist/
```

## Load in Edge

1. Open `edge://extensions`
2. Enable Developer mode
3. Select `Load unpacked`
4. Choose `extension/dist`
5. Pin RepLoop and open its side panel

## Package for Store

```powershell
Compress-Archive -Path "extension\dist\*" -DestinationPath "reploop-edge-extension-0.1.2.zip" -Force
```

The ZIP must contain `manifest.json` at its root.

## Submit

Open:

```text
https://partner.microsoft.com/dashboard/microsoftedge/overview
```

Upload the ZIP, then provide:

- Publisher name: `RepLoop Studio`
- Website: `https://reploop-production.up.railway.app`
- Privacy policy: `https://reploop-production.up.railway.app/privacy.html`
- Category: Productivity
- Support email
- At least one extension screenshot
