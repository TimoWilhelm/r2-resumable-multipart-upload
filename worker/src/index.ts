import { WorkerEntrypoint } from 'cloudflare:workers';

export { Upload } from './durable/upload';

export default class extends WorkerEntrypoint<Env> {}
