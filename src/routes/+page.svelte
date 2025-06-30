<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	// Configure the part size to be 10MB. Object part sizes must be at least 5MiB but no larger than 5GiB.
	// All parts except the last one must be the same size.
	// The maximum number of parts is 10,000.
	// https://developers.cloudflare.com/r2/objects/multipart-objects
	const uploadPartSizeInBytes = 10 * 1024 * 1024;
	const maxNumParts = 10_000;

	const PARALLEL_LIMIT = 2;

	interface Part {
		partNumber: number;
		blob: Blob;
	}

	interface UploadInfo {
		location: string;
		numUploaded: number;
		numTotal: number;
	}

	let abortController: AbortController;

	let loading = $state(false);
	let upload: UploadInfo | undefined = $state();

	const progress = Tween.of(
		() => {
			if (!upload) {
				return 0;
			}
			return upload.numUploaded / upload.numTotal;
		},
		{
			duration: 200,
			easing: cubicOut
		}
	);

	async function startMultiPartUpload(file: File) {
		loading = true;

		const partNum = Math.ceil(file.size / uploadPartSizeInBytes);

		if (partNum > maxNumParts) {
			alert('File too large');
			return;
		}

		const key = file.name;
		const fingerprint = getFileFingerprint(file);

		// create a new multipart upload
		const createResponse = await fetch('/api/upload', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				key,
				fingerprint
			})
		});

		const location = createResponse.headers.get('location');

		if (!createResponse.ok || location === null) {
			loading = false;

			if (createResponse.status === 409) {
				alert('File already exists');
				return;
			}

			alert('Failed to start upload');
			return;
		}

		const { uploadedParts } = await createResponse.json<{ uploadedParts: R2UploadedPart[] }>();

		abortController = new AbortController();

		upload = {
			location,
			numUploaded: uploadedParts.length,
			numTotal: partNum
		};
		loading = false;

		try {
			// upload parts in parallel
			const parts = sliceFile(file);

			let finished = false;
			do {
				abortController.signal.throwIfAborted();

				const promises: Promise<R2UploadedPart>[] = [];
				for (let i = 0; i < PARALLEL_LIMIT; i += 1) {
					const { value, done } = parts.next();
					if (done === true) {
						finished = true;
						break;
					}

					const uploadedPart = uploadedParts.find((p) => p.partNumber === value.partNumber);
					if (uploadedPart) {
						continue;
					}

					promises.push(uploadPart(location, value, abortController.signal));
				}

				// eslint-disable-next-line no-await-in-loop
				const newUploadedParts = await Promise.all(promises);

				abortController.signal.throwIfAborted();

				upload.numUploaded += newUploadedParts.length;
			} while (!finished);

			// complete the multipart upload
			const completeResponse = await fetch(location, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!completeResponse.ok) {
				alert('Failed to complete upload');
				return;
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			alert('Upload failed');
		}
	}

	function* sliceFile(file: File) {
		let start = 0;
		let end = uploadPartSizeInBytes;
		let partNumber = 1;

		while (start < file.size) {
			const blob = file.slice(start, end);

			yield {
				partNumber,
				blob
			};

			partNumber += 1;
			start = end;
			end = start + uploadPartSizeInBytes;
		}
	}

	async function uploadPart(location: string, part: Part, signal: AbortSignal) {
		const res = await fetch(location, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/octet-stream',
				'x-up-part-number': part.partNumber.toString()
			},
			body: part.blob,
			signal
		});

		if (!res.ok) {
			const json = await res.json<{ message?: string }>();
			if (json.message !== undefined) {
				throw new Error(json.message);
			}
			throw new Error('Failed to upload part');
		}

		return await res.json<R2UploadedPart>();
	}

	function getFileFingerprint(file: File) {
		return `up-${file.name}-${file.type}-${file.size}-${file.lastModified}`;
	}

	async function abortUpload(location: string) {
		const abortUploadResponse = await fetch(location, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!abortUploadResponse.ok) {
			alert('Failed to abort upload');

			return;
		}

		alert('Upload aborted');
	}

	function handleInputChange(evt: Event) {
		const target = evt.target as HTMLInputElement;
		const { files } = target;

		if (!files) return;

		startMultiPartUpload(files[0]);
	}
</script>

<div class="flex flex-col-reverse items-center justify-center h-full">
	{#if loading}
		Loading...
	{:else if upload}
		{@const { location } = upload}
		<div
			class="container flex flex-col items-center justify-center gap-10"
			in:fade={{ duration: 50 }}
		>
			{#if progress.current < 1}
				<div class="container flex max-w-md flex-col items-center justify-center gap-2">
					<div class="text-gray-600 text-2xl font-bold">
						{(progress.current * 100).toFixed(0)}%
					</div>

					<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
						<div
							class="bg-gray-600 h-full rounded-full"
							style:width="{(progress.current * 100).toFixed(0)}%"
						></div>
					</div>
				</div>

				<div class="flex items-center justify-center gap-2">
					<button
						type="button"
						class="btn border-gray-600 bg-gray-600/10 text-gray-600 hover:bg-gray-600/20 border-2 px-4 py-2"
						onclick={() => {
							abortController.abort();
							upload = undefined;
						}}
					>
						<span>Pause Upload</span>
					</button>

					<button
						type="button"
						class="btn border-gray-600 bg-gray-600/10 text-gray-600 hover:bg-gray-600/20 border-2 px-4 py-2"
						onclick={() => {
							loading = true;
							abortController.abort();
							void abortUpload(location).finally(() => {
								loading = false;
								upload = undefined;
							});
						}}
					>
						<span>Abort Upload</span>
					</button>
				</div>
				{:else}
				 <div>
					 <span>Upload completed</span>
				 </div>
			{/if}
		</div>
	{:else}
		<div class="container flex items-center justify-center" out:fade={{ duration: 1 }}>
			<label
				class="btn border-gray-600 bg-gray-600/10 text-gray-600 hover:bg-gray-600/20 border-2 px-4 py-2"
				for="file"
			>
				<input type="file" id="file" onchange={handleInputChange} class="hidden" />
				<span>Upload File</span>
			</label>
		</div>
	{/if}
</div>
