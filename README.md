# Image Upload Worker

Worker de Cloudflare para subir imágenes a R2 y devolver una URL pública lista para guardar en Firebase.

## Endpoints

- `POST /api/images/upload` sube un archivo `multipart/form-data` con campo `file`.
- `GET /api/images/:key` descarga una imagen guardada.
- `DELETE /api/images/:key` elimina una imagen guardada.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run test
npm run deploy
```

## Respuesta de upload

```json
{
	"success": true,
	"key": "uploads/2026-07-15/uuid.png",
	"url": "https://tu-dominio.workers.dev/api/images/uploads%2F2026-07-15%2Fuuid.png"
}
```
