import fs from 'node:fs';

import { Log, LogLevel, Miniflare, type WorkerOptions } from 'miniflare';

const workers: WorkerOptions[] = [
	{
		name: 'worker',
		scriptPath: 'worker/dist/index.js',
		modules: true,
		compatibilityDate: '2025-06-28',
		durableObjects: {
			DURABLE_UPLOAD: { className: 'Upload' }
		},

		r2Buckets: { R2_UPLOADS: 'r2-resumable-multipart-upload' }
	},
	{
		name: 'app',
		script: '// placeholder',
		modules: true,
		compatibilityDate: '2025-06-28',

		durableObjects: {
			DURABLE_UPLOAD: {
				className: 'Upload',
				scriptName: 'worker'
			}
		},
        
		r2Buckets: { R2_UPLOADS: 'r2-resumable-multipart-upload' }
	}
];

function createMiniflare() {
	const log = new Log(LogLevel.INFO);
	return new Miniflare({
		port: 6001,
		log,

		r2Persist: './.miniflare/r2-data',
		kvPersist: './.miniflare/kv-data',
		durableObjectsPersist: './.miniflare/do-data',
		workflowsPersist: './.miniflare/workflows-data',

		workers
	});
}

let miniflare = createMiniflare();

for (const worker of workers) {
	if ('scriptPath' in worker && worker.scriptPath !== undefined) {
		fs.watch(worker.scriptPath, () => {
			resetMfInstance();
		});
	}
}

function resetMfInstance() {
	miniflare
		?.dispose()
		.then(() => {
			miniflare = createMiniflare();
			console.log('Miniflare instance reloaded');
		})
		.catch(() => {
			// ignore
		});
}

export const mockPlatform = async (
	platform: Readonly<App.Platform> | undefined
): Promise<App.Platform> => {
	if (platform === undefined) throw new Error('platform is undefined');

	const env = { ...(await miniflare.getBindings('app')) } as App.Platform['env'];

	return {
		...platform,
		env
	};
};
