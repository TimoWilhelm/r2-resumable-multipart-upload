import { WorkerEntrypoint } from 'cloudflare:workers';

export { DurableUpload } from './durable/upload';

export default class extends WorkerEntrypoint<Env> {}
