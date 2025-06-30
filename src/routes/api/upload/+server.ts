import * as base64 from '@stablelib/base64';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';

import type { RequestHandler } from './$types';

import { parseBody } from '$lib/server/parsing';

async function hashFingerprint(fingerprint: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
	return base64.encodeURLSafe(new Uint8Array(hash));
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (platform === undefined) throw new Error('platform is undefined');
	const { DURABLE_UPLOAD, R2_UPLOADS } = platform.env;

	const { key, fingerprint } = await parseBody(
		request,
		z.object({
			key: z
				.string()
				.min(1)
				.max(1000)
				.regex(/^[\w\-. ]+/u),
			fingerprint: z.string().min(1).max(1000)
		}),
		false
	);

	if (await R2_UPLOADS.head(key)) {
		throw error(409, 'Key already exists');
	}

	const hashedFingerprint = await hashFingerprint(fingerprint);

	const id = DURABLE_UPLOAD.idFromName(hashedFingerprint);
	const stub = DURABLE_UPLOAD.get(id);

	try {
		const response = await stub.createUpload(key);

		const { action, uploadedParts, creation, expiration } = response;

		return json(
			{ uploadedParts },
			{
				status: action === 'create' ? 201 : 200,
				headers: {
					'Content-Type': 'application/json',
					location: `/api/upload/${hashedFingerprint}`,
					'x-up-creation': creation.toString(),
					'x-up-expiration': expiration.toString()
				}
			}
		);
	} catch (err) {
		console.error('Failed to create upload', err);
		throw error(400, 'Failed to create upload');
	}
};
