/** Parse only explicit comma-separated G2B labels. No AI guesses or catalog number generation. */
export function parseCatalogName(value){
 const text=String(value||'').trim(),parts=text.split(',').map(p=>p.trim());
 const result={title:parts[0]||text,manufacturer:'',model:'',specification:parts.slice(1).join(', ')};
 if(parts.length>=4&&parts[1]&&parts[1].length<=100&&/^[A-Za-z0-9][A-Za-z0-9 ._()/-]{1,99}$/.test(parts[2])){result.manufacturer=parts[1];result.model=parts[2];result.specification=parts.slice(3).join(', ');}
 return result;
}
