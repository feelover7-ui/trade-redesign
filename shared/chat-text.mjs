/** Presentation-only cleanup. Server sourceIds and evidence validation remain unchanged. */
export function cleanAnswerText(text){
 return String(text??'')
  // Remove the link target together with a source-only Markdown label.
  .replace(/\[S\d{1,3}(?:\s*[,·]\s*S?\d{1,3})*\]\((?:[^()\r\n]|\([^()\r\n]*\))*\)(?:[ \t]*(?:출처|근거)\s*보기)?/g,'')
  .replace(/\*\*(\s*\[S\d{1,3}(?:\s*[,·]\s*S?\d{1,3})*\]\s*)\*\*/g,'$1')
  .replace(/\*\*((?:\s*\[S\d{1,3}(?:\s*[,·]\s*S?\d{1,3})*\](?:[ \t]*(?:출처|근거)\s*보기)?)+)\s*\*\*/g,'$1')
  .replace(/\[S\d{1,3}(?:\s*[,·]\s*S?\d{1,3})*\](?:[ \t]*(?:출처|근거)\s*보기)?/g,'').replace(/\*\*\s*\*\*/g,'').trim();
}
