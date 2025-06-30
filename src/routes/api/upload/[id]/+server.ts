import { error, json } from '@sveltejs/kit';
import { z } from 'zod';

import type { RequestHandler } from './$types';

import { dev } from '$app/environment';
import { parseHeaders, parseParams } from '$lib/server/parsing';

export const POST: RequestHandler = async ({ locals, platform, params }) => {
	if (platform === undefined) throw new Error('platform is undefined');
	const { DURABLE_UPLOAD } = platform.env;


	const { id: hashedFingerprint } = await parseParams(
		params,
		z.object({ id: z.string().max(100) })
	);

	const id = DURABLE_UPLOAD.idFromName(hashedFingerprint);
	const stub = DURABLE_UPLOAD.get(id);

	try {
		await stub.completeUpload();
	} catch (err) {
		console.error('Failed to complete upload', err);
		throw error(400, 'Failed to complete upload');
	}

	return new Response(null, { status: 204 });
};

// eslint-disable-next-line max-statements
export const PATCH: RequestHandler = async ({ locals, platform, request, params }) => {
	if (platform === undefined) throw new Error('platform is undefined');
	const { DURABLE_UPLOAD, R2_UPLOADS } = platform.env;

	if (request.body === null) {
		throw error(400, 'Invalid body');
	}

	const headerData = await parseHeaders(
		request.headers,
		z.object({
			'x-up-part-number': z.coerce.number().min(1).max(10_000),
		})
	);

	const { id: hashedFingerprint } = await parseParams(
		params,
		z.object({ id: z.string().max(100) })
	);

	const id = DURABLE_UPLOAD.idFromName(hashedFingerprint);
	const stub = DURABLE_UPLOAD.get(id);

	const uploadInfo = await stub.getUploadInfo();

	if (!uploadInfo) {
		return new Response(null, { status: 404 });
	}

	const { key, uploadId } = uploadInfo;

	// readable stream length is not available in Node.js (dev) so fall back to using arrayBuffer
	const value = dev ? await request.arrayBuffer() : request.body;

	const multipartUpload = R2_UPLOADS.resumeMultipartUpload(key, uploadId);

	const uploadedPart = await multipartUpload.uploadPart(headerData['x-up-part-number'], value);
	try {
		await stub.addUploadedPart(uploadedPart);
	} catch (err) {
		console.error('Failed to add uploaded part', err);
		throw error(400, 'Failed to add uploaded part');
	}

	return json(uploadedPart);
};

export const DELETE: RequestHandler = async ({ locals, platform, params }) => {
	if (platform === undefined) throw new Error('platform is undefined');
	const { DURABLE_UPLOAD } = platform.env;


	const { id: hashedFingerprint } = await parseParams(
		params,
		z.object({ id: z.string().max(100) })
	);

	const id = DURABLE_UPLOAD.idFromName(hashedFingerprint);
	const stub = DURABLE_UPLOAD.get(id);

	await stub.deleteUpload();

	return new Response(null, { status: 204 });
};
