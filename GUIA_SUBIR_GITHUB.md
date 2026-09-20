# 🚀 Guía Paso a Paso para Subir Levant a GitHub

Repositorio destino: **`https://github.com/huggins30/levant.git`**

---

## 🔒 1. Seguridad Previa (Ya configurada)

Se ha configurado el archivo `.gitignore` para **proteger automáticamente tus credenciales**. Los siguientes archivos privados **NO** se subirán a GitHub para evitar exponer claves de base de datos o accesos:
- Archivos `.env` y `server/.env` (quedan a salvo en tu máquina).
- Archivo `base de datos/clavesupabase.txt`.
- Carpeta `node_modules/` y temporales de compilación `dist/`.

---

## 🛠️ 2. Comandos para Subir el Proyecto por Primera Vez

Abre una terminal (PowerShell, CMD o Git Bash) en la carpeta raíz del proyecto (`c:\Users\ricardoh\Desktop\levant`) y ejecuta los siguientes comandos en orden:

### Paso 1: Configurar tu identidad en Git (Si aún no lo has hecho)
```bash
git config --global user.name "Tu Nombre o Usuario de GitHub"
git config --global user.email "tu_correo@ejemplo.com"
```

### Paso 2: Inicializar el repositorio Git local
```bash
git init
```

### Paso 3: Agregar todos los archivos del proyecto
```bash
git add .
```
*(Puedes verificar con `git status` que los archivos aparezcan en verde y que los `.env` no figuren en la lista).*

### Paso 4: Crear el primer commit
```bash
git commit -m "feat: plataforma Levant completa con tiempo real, WebSockets, Supabase y Dark Neumorphism"
```

### Paso 5: Asegurar la rama principal como `main`
```bash
git branch -M main
```

### Paso 6: Vincular el repositorio remoto de GitHub
```bash
git remote add origin https://github.com/huggins30/levant.git
```
*(Si ya existía un remote anterior, puedes actualizarlo con: `git remote set-url origin https://github.com/huggins30/levant.git`)*

### Paso 7: Subir los archivos a GitHub
```bash
git push -u origin main
```

---

## 🔑 3. Autenticación con GitHub

Cuando ejecutes `git push`, Git te solicitará autenticarte:
1. **Opción recomendada (Web Browser):** Se abrirá una ventana en tu navegador o un aviso de Git Credential Manager solicitando autorización con un solo clic.
2. **Opción con Token Personal (Personal Access Token - PAT):**
   - GitHub ya no acepta tu contraseña habitual de la cuenta por consola.
   - Si te solicita contraseña, ve a tu cuenta de GitHub:
     - `Settings` ➔ `Developer settings` ➔ `Personal access tokens` ➔ `Tokens (classic)`.
     - Genera un token con permisos de `repo`.
     - Úsalo como contraseña cuando Git te lo pida en la terminal.

---

## ⚠️ 4. Solución a Situaciones Comunes

### Caso A: "error: failed to push some refs... fetch first"
Si creaste el repositorio en GitHub marcando la casilla de *Add a README* o *Add .gitignore*, GitHub tendrá un commit que tu máquina aún no tiene. Ejecuta:
```bash
git pull origin main --rebase
git push -u origin main
```
O si deseas sobrescribir completamente el repositorio vacío de GitHub con tu proyecto local:
```bash
git push -u origin main --force
```

### Caso B: "fatal: remote origin already exists"
Si te aparece este mensaje al agregar el remote, ejecuta:
```bash
git remote set-url origin https://github.com/huggins30/levant.git
```

---

## 🔄 5. ¿Cómo subir cambios futuros?

Cada vez que agregues nuevas funciones o modifiques el código, solo necesitas ejecutar:
```bash
git add .
git commit -m "descripción de lo que cambiaste"
git push
```
