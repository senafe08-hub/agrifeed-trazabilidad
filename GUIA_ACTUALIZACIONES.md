# 🚀 GUÍA MAESTRA: Cómo publicar una Actualización de Agrifeed

Esta es tu "Checklist" definitiva que deberás seguir estrictamente cada vez que vayas a publicar una nueva actualización (Ejemplo: Lanzar la v0.2.5).

---

## 🛠️ FASE 1: Preparar el Código (Cambiar Nombres)

1. **Abre Visual Studio Code** en tu proyecto principal.
2. Abre el archivo `package.json` (línea ~3) y cambia el texto `"version": "0.2.X"` al nuevo número. ¡No borres las comillas!
3. Abre el archivo `src-tauri\tauri.conf.json` (línea ~4) y haz exactamente el mismo cambio al nuevo número. 
4. Abre `src\components\layout\Sidebar.tsx` (cerca de la línea 136) y cámbiale el texto para que la aplicación muestre la nueva versión visualmente: `"Agrifeed Trazabilidad v0.2.X 🚀"`.

> **Check de seguridad:** Asegúrate de guardar los cambios en VS Code antes de seguir.

---

## 🏭 FASE 2: La Gran Fábrica (Empaquetar)

1. Abre el **Navegador de Archivos (Carpetas de Windows)** y entra a tu proyecto: `C:\PYTHON\APP AGRIFEED TRAZABILIDAD\agrifeed-trazabilidad\`
2. Localiza el archivo mágico llamado `release.ps1`
3. Dale **Clic Derecho** y selecciona **"Ejecutar con PowerShell"** (Run with PowerShell).
4. Relájate 1 minuto y observa la pantalla negra. Espera hasta ver las letras gigantes color verde: `¡Magia Completada! Todo esta listo`

> ¡El programa acaba de crear por debajo de la mesa tus 3 archivos dorados automáticos en la carpeta interna `releases/` sin mover un sólo dedo!

---

## ☁️ FASE 3: Envíar tu código a la Nube (GitHub Desktop)

1. Abre tu programa **GitHub Desktop**.
2. Verifica en la esquina superior izquierda que diga: `Current repository: agrifeed-trazabilidad`.
3. Ve abajo a la izquierda a la caja que dice **Summary** y ponle un título a tu trabajo (Ejemplo: *"Versión 0.2.5 Lista"*).
4. Dale clic al botón azul inferior: **`Commit to main`**.
5. Ve a la parte superior y haz clic al botón **`Push origin`** (Flecha hacia arriba).

> Espera que termine de cargar. ¡Con esto el código local de tu computador ya está clonado y a salvo en internet!

---

## 📦 FASE 4: Liberar el Instalador (Publish Release)

Aún falta adjuntar el `Ejecutable` tangible para que los PCs de tus usuarios agarren de algún sitio la descarga masiva:

1. Entra a este enlace secreto en tu navegador web: 
👉 https://github.com/senafe08-hub/agrifeed-trazabilidad/releases/new
2. Haz clic en la cajita gris arriba a la izquierda **"Choose a tag"**. Escribe tu versión nueva con *upe* minúscula (Ejemplo: `v0.2.5`). Haz clic cuando abajo diga *"Create new tag"*.
3. Pon el mismo nombre (ej. `v0.2.5`) en "Release title".
4. Baja la pantalla web del todo hasta encontrar un recuadro inmenso punteado gris (`Attach binaries...`).
5. Abre en tu computadora la carpeta `C:\PYTHON\APP AGRIFEED TRAZABILIDAD\agrifeed-trazabilidad\releases\`.
6. Arrastra desde allí y SUELTA dentro del recuadro punteado de la Web tus 3 archivos:
   - `Agrifeed_v0.2.5.exe`
   - `Agrifeed_v0.2.5.exe.sig`
   - `latest.json`
7. Dale clic al botón **Publish release**.

---

**¡FINALIZADO!** 🍾🍾 

Tu equipo de PC's se reconectará de inmediato a internet y todas empezarán a aparecer un pop-up gigante verde descargando este nuevo instalador de forma automática!
