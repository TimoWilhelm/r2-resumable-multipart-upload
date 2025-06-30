# Durable Object - Resumable Multipart Upload

This repository contains a sample to create a resumable [multipart upload](https://developers.cloudflare.com/r2/objects/multipart-objects/) to [R2 Object storage](https://developers.cloudflare.com/r2/).
The state of the Upload is saved in a [Durable Object](https://developers.cloudflare.com/durable-objects/) instance.

## Setup

As the main SvelteKit app odes not support Durable Objects, you need to build the `worker` sub-project first:

```bash
npm run build -w r2-resumable-multipart-upload-worker
```

Afterwards you can start the main SvelteKit app:

```bash
npm run dev
```
