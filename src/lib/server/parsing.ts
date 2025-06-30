
import { error } from '@sveltejs/kit';
import { parse as parseValue } from 'devalue';
import type { Schema, typeToFlattenedError, z } from 'zod';

export type FormError<T extends Schema = z.ZodTypeAny> = typeToFlattenedError<z.infer<T>, string>;

async function getRequestValue(request: Request, devalue: boolean) {
	try {
		if (devalue) {
			const body = await request.text();
			return parseValue(body);
		}
		return await request.json();
	} catch (e) {
		throw error(400, {
			errorId: crypto.randomUUID(),
			message: 'Invalid request',
			detail: {
				formErrors: [(e as Error).message],
				fieldErrors: {}
			} satisfies FormError
		});
	}
}

export async function parse<T>(value: unknown, schema: Schema<T>): Promise<z.infer<Schema<T>>> {
	const result = await schema.safeParseAsync(value);

	if (!result.success) {
		const { formErrors, fieldErrors } = result.error.formErrors;
		throw error(400, {
			errorId: crypto.randomUUID(),
			message: 'Invalid request',
			detail: {
				formErrors,
				fieldErrors
			} satisfies FormError<typeof schema>
		});
	}

	return result.data;
}

export async function parseBody<T>(
	request: Request,
	schema: Schema<T>,
	devalue = true
): Promise<z.infer<Schema<T>>> {
	const value = await getRequestValue(request, devalue);
	return parse(value, schema);
}

export function parseHeaders<T>(headers: Headers, schema: Schema<T>): Promise<T> {
	const value = Object.fromEntries(headers.entries());
	return parse<T>(value, schema);
}

export function parseParams<T>(value: T, schema: Schema<T>): Promise<z.infer<Schema<T>>> {
	return parse<T>(value, schema);
}
