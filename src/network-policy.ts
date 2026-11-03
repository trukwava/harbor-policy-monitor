// @ts-nocheck
/**
 * Security preflight for a FUTURE approved-source HTTP adapter.
 * This module never performs a request. A production transport must pin its
 * connection to the DNS answers validated here and revalidate each redirect.
 */
import net from 'node:net';

export type SourceBoundary = {approvedHost: string; maxRedirects?: number};
const FORBIDDEN_HOST_SUFFIXES = ['.localhost','.local','.internal','.test','.invalid','.example'];
const V4_DENY: ReadonlyArray<readonly [number,number]> = [
 [0,8],[10,8],[100,10],[127,8],[169,16],[172,12],[192,24],
 [192,16],[198,15],[203,24],[224,4],[240,4]
];
function inV4Range(value:number, network:number, prefix:number):boolean {
 const mask=prefix===0?0:(0xffffffff << (32-prefix))>>>0;
 return ((value & mask)>>>0)===((network & mask)>>>0);
}
function v4ToInt(ip:string):number|null {
 const parts=ip.split('.');
 if(parts.length!==4||parts.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))return null;
 return parts.reduce((n,x)=>((n<<8)|Number(x))>>>0,0);
}
function privateV4(ip:string):boolean {
 const value=v4ToInt(ip);
 if(value===null)return true;
 return V4_DENY.some(([base,prefix])=>inV4Range(value,base,prefix));
}
/** Fail closed on non-global unicast addresses, including mapped IPv4. */
export function publicAddress(address:string):boolean {
 const family=net.isIP(address);
 if(family===4)return !privateV4(address);
 if(family!==6)return false;
 const value=address.toLowerCase().split('%')[0];
 if(value.includes('%'))return false;
 if(value==='::'||value==='::1')return false;
 if(value.startsWith('::ffff:')){
  const embedded=value.slice(7);
  return net.isIP(embedded)===4 ? !privateV4(embedded) : false;
 }
 // Only global 2000::/3 addresses are considered, and certain allocations
 // remain excluded. A production implementation should use maintained
 // IANA special-purpose registries rather than rely on this first-pass filter.
 const head=Number.parseInt(value.split(':')[0],16);
 if(!Number.isFinite(head)||head<0x2000||head>0x3fff)return false;
 if(value.startsWith('2001:db8:'))return false; // documentation
 if(value.startsWith('2001:10:')||value.startsWith('2001:20:'))return false;
 return true;
}
export function approvedUrl(raw:string, boundary:SourceBoundary):URL {
 if(typeof raw!=='string'||raw.length>2048||/[\x00-\x20\x7f]/.test(raw))
  throw Error('Invalid source URL');
 const host=boundary.approvedHost.toLowerCase();
 if(!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(host)||host.includes('..')||net.isIP(host)!==0||
   FORBIDDEN_HOST_SUFFIXES.some(s=>host.endsWith(s))||host==='localhost')
  throw Error('Invalid approved host');
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||
   url.port&&url.port!=='443')throw Error('HTTPS URL with default port and no credentials or fragment required');
 if(url.hostname.toLowerCase()!==host)throw Error('URL outside exact approved host');
 if(net.isIP(url.hostname)!==0)throw Error('IP-literal destination rejected');
 return url;
}
export function validateResolution(addresses:string[]):string[] {
 if(!Array.isArray(addresses)||addresses.length===0||addresses.some(a=>!publicAddress(a)))
  throw Error('DNS returned missing, private, or special-purpose address');
 return [...new Set(addresses)];
}
export function redirectTarget(current:string,location:string,boundary:SourceBoundary,hops:number):URL {
 const limit=Math.min(Math.max(boundary.maxRedirects??2,0),5);
 if(!Number.isInteger(hops)||hops<0||hops>=limit)throw Error('Redirect limit exceeded');
 const base=approvedUrl(current,boundary);
 return approvedUrl(new URL(location,base).href,boundary);
}
