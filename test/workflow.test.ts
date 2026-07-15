import worker from "../worker/index";
import { describe, it, expect } from "vitest";

class InMemoryBucket {
	private readonly objects = new Map<
		string,
		{ body: Uint8Array; contentType: string; etag: string }
	>();

	async put(
		key: string,
		value: ArrayBuffer,
		options?: { httpMetadata?: { contentType?: string } },
	) {
		const etag = crypto.randomUUID();
		this.objects.set(key, {
			body: new Uint8Array(value),
			contentType: options?.httpMetadata?.contentType || "application/octet-stream",
			etag,
		});

		return { etag };
	}

	async get(key: string) {
		const object = this.objects.get(key);
		if (!object) {
			return null;
		}

		return {
			body: object.body,
			httpEtag: object.etag,
			writeHttpMetadata: (headers: Headers) => {
				headers.set("content-type", object.contentType);
			},
		};
	}

	async delete(key: string) {
		this.objects.delete(key);
	}
}

const createEnv = (): Env => {
	return {
		IMAGES_BUCKET: new InMemoryBucket() as unknown as R2Bucket,
	} as Env;
};

describe("Image endpoints", () => {
	it("uploads image to R2", async () => {
		const env = createEnv();
		const form = new FormData();
		form.set("file", new File([new Uint8Array([1, 2, 3])], "car.png", { type: "image/png" }));

		const request = new Request("https://example.com/api/images/upload", {
			method: "POST",
			body: form,
		});

		const response = await worker.fetch(request, env);
		expect(response.status).toBe(200);

		const data = (await response.json()) as {
			success: boolean;
			key: string;
			contentType: string;
		};

		expect(data.success).toBe(true);
		expect(data.key.startsWith("uploads/")).toBe(true);
		expect(data.contentType).toBe("image/png");
	});

	it("rejects non-image file types", async () => {
		const env = createEnv();
		const form = new FormData();
		form.set("file", new File(["hello"], "note.txt", { type: "text/plain" }));

		const request = new Request("https://example.com/api/images/upload", {
			method: "POST",
			body: form,
		});

		const response = await worker.fetch(request, env);
		expect(response.status).toBe(400);
	});

	it("gets and deletes an uploaded image", async () => {
		const env = createEnv();
		const form = new FormData();
		form.set("file", new File([new Uint8Array([9, 8, 7])], "car.webp", { type: "image/webp" }));

		const uploadRequest = new Request("https://example.com/api/images/upload", {
			method: "POST",
			body: form,
		});

		const uploadResponse = await worker.fetch(uploadRequest, env);
		const uploadData = (await uploadResponse.json()) as { key: string };

		const getRequest = new Request(
			`https://example.com/api/images/${encodeURIComponent(uploadData.key)}`,
			{ method: "GET" },
		);
		const getResponse = await worker.fetch(getRequest, env);
		expect(getResponse.status).toBe(200);
		expect(getResponse.headers.get("content-type")).toBe("image/webp");

		const deleteRequest = new Request(
			`https://example.com/api/images/${encodeURIComponent(uploadData.key)}`,
			{ method: "DELETE" },
		);
		const deleteResponse = await worker.fetch(deleteRequest, env);
		expect(deleteResponse.status).toBe(200);

		const notFoundResponse = await worker.fetch(getRequest, env);
		expect(notFoundResponse.status).toBe(404);
	});
});
