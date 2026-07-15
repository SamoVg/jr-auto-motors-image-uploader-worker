const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
]);

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type,Authorization",
} as const;

function jsonResponse(data: unknown, status = 200): Response {
	return Response.json(data, {
		status,
		headers: CORS_HEADERS,
	});
}

function getFileExtension(file: File): string {
	const mimeToExtension: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
		"image/gif": "gif",
	};

	const byMime = mimeToExtension[file.type];
	if (byMime) {
		return byMime;
	}

	const nameParts = file.name.split(".");
	if (nameParts.length > 1) {
		return nameParts[nameParts.length - 1].toLowerCase();
	}

	return "bin";
}

function getImageKeyFromPath(pathname: string): string | null {
	const prefix = "/api/images/";
	if (!pathname.startsWith(prefix)) {
		return null;
	}

	const encodedKey = pathname.slice(prefix.length);
	if (!encodedKey) {
		return null;
	}

	return decodeURIComponent(encodedKey);
}

/**
 * Worker API for image management in R2.
 * - POST /api/images/upload
 * - GET /api/images/:key
 * - DELETE /api/images/:key
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: CORS_HEADERS,
			});
		}

		if (url.pathname === "/api/images/upload" && request.method === "POST") {
			const contentType = request.headers.get("content-type") || "";
			if (!contentType.includes("multipart/form-data")) {
				return jsonResponse(
					{ error: "Use multipart/form-data y el campo 'file'" },
					400,
				);
			}

			try {
				const formData = await request.formData();
				const file = formData.get("file");

				if (!(file instanceof File)) {
					return jsonResponse(
						{ error: "El campo 'file' es requerido" },
						400,
					);
				}

				if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
					return jsonResponse(
						{
							error:
								"Tipo de imagen no permitido. Usa jpg, png, webp o gif.",
						},
						400,
					);
				}

				if (file.size > MAX_IMAGE_SIZE_BYTES) {
					return jsonResponse(
						{ error: "La imagen excede el tamano maximo de 10MB" },
						400,
					);
				}

				const extension = getFileExtension(file);
				const uploadedAt = new Date().toISOString();
				const key = `uploads/${uploadedAt.slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
				const body = await file.arrayBuffer();

				const result = await env.IMAGES_BUCKET.put(key, body, {
					httpMetadata: {
						contentType: file.type,
						cacheControl: "public, max-age=31536000, immutable",
					},
					customMetadata: {
						originalName: file.name,
						uploadedAt,
					},
				});

				return jsonResponse({
					success: true,
					key,
					etag: result.etag,
					size: file.size,
					contentType: file.type,
				});
			} catch {
				return jsonResponse(
					{ error: "No se pudo subir la imagen a R2" },
					500,
				);
			}
		}

		if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
			const key = getImageKeyFromPath(url.pathname);
			if (!key) {
				return jsonResponse({ error: "Image key is required" }, 400);
			}

			const object = await env.IMAGES_BUCKET.get(key);
			if (!object) {
				return jsonResponse({ error: "Image not found" }, 404);
			}

			const headers = new Headers(CORS_HEADERS);
			object.writeHttpMetadata(headers);
			headers.set("etag", object.httpEtag);
			if (!headers.has("content-type")) {
				headers.set("content-type", "application/octet-stream");
			}

			return new Response(object.body, {
				status: 200,
				headers,
			});
		}

		if (
			url.pathname.startsWith("/api/images/") &&
			request.method === "DELETE"
		) {
			const key = getImageKeyFromPath(url.pathname);
			if (!key) {
				return jsonResponse({ error: "Image key is required" }, 400);
			}

			await env.IMAGES_BUCKET.delete(key);
			return jsonResponse({ success: true, key });
		}

		return jsonResponse({ error: "Not Found" }, 404);
	},
} satisfies ExportedHandler<Env>;
