/** Bounded response-body collector for a future approved transport.
 * This module never initiates a network request.
 */
export const MAX_CAPTURE_BYTES=2_000_000;
export const ALLOWED_TYPES=['text/html','text/plain','application/pdf'] as const;
export type Capture={bytes:Buffer;mediaType:string;size:number};

export function validateMediaType(value:string|undefined):string {
 if(!value)throw Error('Missing Content-Type');
 const type=value.split(';',1)[0].trim().toLowerCase();
 if(!ALLOWED_TYPES.includes(type as typeof ALLOWED_TYPES[number]))
  throw Error('Unsupported source content type');
 return type;
}
export function validateResponseHeaders(
 status:number,headers:Record<string,string|undefined>,maxBytes=MAX_CAPTURE_BYTES
):string {
 if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_CAPTURE_BYTES)throw Error('Invalid byte budget');
 if(status!==200)throw Error('Source did not return HTTP 200');
 const mediaType=validateMediaType(headers['content-type']);
 const declared=headers['content-length'];
 if(declared!==undefined) {
  if(!/^(0|[1-9][0-9]*)$/.test(declared))throw Error('Invalid Content-Length');
  if(Number(declared)>maxBytes)throw Error('Source exceeds byte budget');
 }
 if(headers['content-encoding']&&headers['content-encoding']!.toLowerCase()!=='identity')
  throw Error('Compressed response unsupported');
 return mediaType;
}
export async function collectBounded(
 stream:AsyncIterable<Uint8Array>,
 options:{maxBytes?:number;signal?:AbortSignal}={}
):Promise<Buffer> {
 const maxBytes=options.maxBytes??MAX_CAPTURE_BYTES;
 if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_CAPTURE_BYTES)
  throw Error('Invalid byte budget');
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of stream) {
  if(options.signal?.aborted)throw Error('Capture aborted');
  if(!(chunk instanceof Uint8Array))throw Error('Non-binary response chunk');
  size+=chunk.byteLength;
  if(size>maxBytes)throw Error('Source exceeds byte budget');
  chunks.push(Buffer.from(chunk));
 }
 if(options.signal?.aborted)throw Error('Capture aborted');
 return Buffer.concat(chunks,size);
}
