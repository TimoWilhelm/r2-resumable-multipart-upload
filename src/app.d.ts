import type { Upload } from '../worker/src/durable/upload';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: {
				DURABLE_UPLOAD: DurableObjectNamespace<Upload>;
			} & Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}

		interface Error<T = unknown> {
			message: string;
			errorId?: string;
			detail?: T;
		}
	}
}

export {};
