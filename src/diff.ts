/** Deterministic, reviewable line/paragraph changes: normalizer-v1. */
export const NORMALIZER_VERSION = 'normalizer-v1';

export type DiffHunk = {kind:'added'|'removed'|'modified'|'editorial'; before:string; after:string; section:string};

export function normalize(raw:string):string {
  return raw.replace(/\r\n?/g,'\n').split('\n')
    .map(line=>line.trim().replace(/\s+/g,' '))
    .filter(line=>line && !/^FOOTER\s*:/i.test(line) && !/^\[NAV\]/i.test(line) && !/^PAGE\s+\d+\s+OF\s+\d+$/i.test(line))
    .join('\n');
}

function lcs(a:string[],b:string[]):number[][] {
  const result=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0));
  for(let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--)
    result[i][j]=a[i]===b[j]?1+result[i+1][j+1]:Math.max(result[i+1][j],result[i][j+1]);
  return result;
}

/** Produce stable pairs without interpreting policy meaning. */
export function diffText(beforeRaw:string,afterRaw:string):DiffHunk[] {
  const before=normalize(beforeRaw), after=normalize(afterRaw);
  if(before===after) {
    return beforeRaw===afterRaw?[]:[{kind:'editorial',before:beforeRaw,after:afterRaw,section:'Boilerplate / navigation'}];
  }
  const a=before?before.split('\n'):[], b=after?after.split('\n'):[];
  // Guard the quadratic LCS matrix. Full originals remain in document_versions,
  // but very large comparisons become a coarse, explicitly labelled review hunk.
  if(a.length*b.length>400_000){
    return [{kind:'modified',before,after,section:'Large-document comparison (coarse; verify originals)'}];
  }
  const m=lcs(a,b), edits:{side:'before'|'after';value:string}[]=[];
  let i=0,j=0;
  while(i<a.length || j<b.length) {
    if(i<a.length&&j<b.length&&a[i]===b[j]) {i++;j++;continue;}
    if(j<b.length&&(i===a.length||m[i][j+1]>m[i+1][j])) {edits.push({side:'after',value:b[j++]});}
    else if(i<a.length) {edits.push({side:'before',value:a[i++]});}
  }
  const old=edits.filter(x=>x.side==='before').map(x=>x.value);
  const fresh=edits.filter(x=>x.side==='after').map(x=>x.value);
  const count=Math.max(old.length,fresh.length);
  return Array.from({length:count},(_,idx)=>({
    kind:old[idx]&&fresh[idx]?'modified':old[idx]?'removed':'added',
    before:old[idx]||'',after:fresh[idx]||'',
    section:'Paragraph '+String(idx+1)
  }));
}

export function candidateDate(text:string):{value:string|null;note:string} {
  const explicit=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if(explicit){
    const ms=Date.parse(`${explicit[1]} ${explicit[2]}, ${explicit[3]}`);
    if(Number.isFinite(ms))return {value:new Date(ms).toISOString().slice(0,10),note:'Unconfirmed date extracted from source text'};
  }
  const ambiguous=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i);
  return {value:null,note:ambiguous?'Source mentions a month/day without an unambiguous year; reviewer must confirm.':'No unambiguous effective date detected.'};
}
