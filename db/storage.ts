import { env } from 'cloudflare:workers';
export function database(){return env.DB;}
export function files(){return (env as unknown as {FILES:R2Bucket}).FILES;}
