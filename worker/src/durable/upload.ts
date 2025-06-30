import { DurableObject } from 'cloudflare:workers';
import { Temporal } from 'temporal-polyfill';

// https://developers.cloudflare.com/r2/objects/multipart-objects/
// incomplete uploads will be automatically aborted by Cloudflare R2 after 7 days
const UPLOAD_EXPIRATION = Temporal.Duration.from({ hours: 5 * 24 });

const UPLOAD_INFO_KEY = 'upload';
const UPLOADED_PARTS_KEY = 'uploadedParts';

interface UploadInfo {
	key: string;
	uploadId: string;
	creation: number;
	expiration: number;
}

export class DurableUpload extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	public async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}

	public async getUploadInfo(): Promise<UploadInfo | undefined> {
		const uploadInfo = await this.ctx.storage.get<UploadInfo>(UPLOAD_INFO_KEY);
		return uploadInfo;
	}

	public async createUpload(
		key: string,
		metadata?: Record<string, string>
	): Promise<{
		action: 'create' | 'resume';
		uploadedParts: R2UploadedPart[];
		creation: number;
		expiration: number;
	}> {
		const uploadInfo = await this.ctx.storage.get<UploadInfo>(UPLOAD_INFO_KEY);

		if (uploadInfo !== undefined) {
			const { key: currentKey, creation, expiration } = uploadInfo;

			if (key !== currentKey) {
				throw new Error('Conflict');
			}

			const uploadedParts =
				(await this.ctx.storage.get<R2UploadedPart[]>(UPLOADED_PARTS_KEY)) ?? [];
			return {
				action: 'resume',
				uploadedParts,
				creation,
				expiration
			};
		}

		const multipartUpload = await this.env.R2_UPLOADS.createMultipartUpload(key, {
			customMetadata: {
				...metadata
			}
		});

		const creation = Temporal.Now.instant();
		const expiration = creation.add(UPLOAD_EXPIRATION);

		await this.ctx.storage.setAlarm(expiration.epochMilliseconds);

		await this.ctx.storage.put<UploadInfo>(UPLOAD_INFO_KEY, {
			key,
			uploadId: multipartUpload.uploadId,
			creation: creation.epochMilliseconds,
			expiration: expiration.epochMilliseconds
		});

		return {
			action: 'create',
			uploadedParts: [],
			creation: creation.epochMilliseconds,
			expiration: expiration.epochMilliseconds
		};
	}

	public async deleteUpload(): Promise<void> {
		const uploadInfo = await this.ctx.storage.get<UploadInfo>(UPLOAD_INFO_KEY);

		if (uploadInfo === undefined) {
			return;
		}

		const { key, uploadId } = uploadInfo;

		const multipartUpload = this.env.R2_UPLOADS.resumeMultipartUpload(key, uploadId);

		await multipartUpload.abort();
		await this.ctx.storage.deleteAll();
	}

	public async completeUpload(): Promise<void> {
		const uploadInfo = await this.ctx.storage.get<UploadInfo>(UPLOAD_INFO_KEY);

		if (uploadInfo === undefined) {
			throw new Error('Not Found');
		}

		const { key, uploadId } = uploadInfo;

		const multipartUpload = this.env.R2_UPLOADS.resumeMultipartUpload(key, uploadId);

		const uploadedParts = await this.ctx.storage.get<R2UploadedPart[]>(UPLOADED_PARTS_KEY);

		if (uploadedParts === undefined) {
			throw new Error('No Parts');
		}

		const sortedParts = uploadedParts.toSorted((a, b) => a.partNumber - b.partNumber);

		await multipartUpload.complete(sortedParts);
		await this.ctx.storage.deleteAll();
	}

	public async addUploadedPart(uploadedPart: R2UploadedPart): Promise<void> {
		const uploadInfo = await this.ctx.storage.get<UploadInfo>(UPLOAD_INFO_KEY);

		if (uploadInfo === undefined) {
			throw new Error('Not Found');
		}

		const uploadedParts = await this.ctx.storage.get<R2UploadedPart[]>(UPLOADED_PARTS_KEY);
		await this.ctx.storage.put<R2UploadedPart[]>(UPLOADED_PARTS_KEY, [
			...(uploadedParts ?? []),
			uploadedPart
		]);
	}
}
