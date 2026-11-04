/** Shared deadline for table preview/resume and upload history.
 * Waiting for a licensed OZD converter must not expire the original overnight.
 * Once converted, the preview has 24 hours from readyAt; original audit dates stay immutable.
 */
export function importAvailability({createdAt,inputFormat,conversionState,readyAt},clock=Date.now()){
 if(inputFormat==='OZD'&&conversionState==='WAITING')return {expired:false,expiresAt:null};
 const start=Date.parse(readyAt||createdAt);
 if(!Number.isFinite(start))return {expired:true,expiresAt:null};
 const deadline=start+86400000;
 return {expired:clock>=deadline,expiresAt:new Date(deadline).toISOString()};
}
