---
description: Spustit náhled aplikace v anonymním okně s automatickým refreshem (Hot Reload)
---
Tento workflow zajistí, že při každé změně kódu (HTML, CSS, JS) nebo dat (JSON) dojde k okamžitému osvěžení prohlížeče bez nutnosti manuálního zásahu.

1. Ukončete případné běžící instance serveru (např. běžící node procesy).
// turbo
2. Spusťte Browsersync server, který hlídá všechny relevantní typy souborů:
```powershell
npx -y browser-sync start --server --files "**/*.html, **/*.css, **/*.js, **/*.json" --port 8040 --no-notify --no-ui
```
// turbo
3. Otevřete Chrome v anonymním režimu na portu 8040:
```powershell
Start-Process "chrome" -ArgumentList "--incognito", "http://localhost:8040/index.html"
```
4. Pokaždé, když Antigravity provede změnu v souboru, Browsersync automaticky vyvolá reload v otevřeném okně.
