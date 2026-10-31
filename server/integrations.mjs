/** Internal extension points, NOT official external API specifications. No outbound traffic. */
export const capabilities = Object.freeze({mode:'MANUAL',edufine:{readAssets:false,verifyDecision:false,submitTransfer:false,verifyLedger:false},procurement:{search:false,images:false},onbid:{read:false,write:false},ai:{identify:false,count:false,guide:false}});
export class NotConnectedError extends Error {constructor(service){super(`${service}는 연결되지 않았습니다. 공식 명세와 권한을 확보한 뒤 구현해야 합니다.`);this.code='NOT_CONNECTED';}}
export class EdufineAdapter {async getAssetSnapshot(){throw new NotConnectedError('K-에듀파인');}async verifyDisposal(){throw new NotConnectedError('K-에듀파인');}async verifyLedgers(){throw new NotConnectedError('K-에듀파인');}}
export class ProcurementAdapter {async search(){throw new NotConnectedError('조달청');}async fetchReferenceImages(){throw new NotConnectedError('조달청 사진');}}
export class OnbidAdapter {async getResult(){throw new NotConnectedError('온비드');}}
export class AiAdapter {async suggestProduct(){throw new NotConnectedError('AI');}async estimateQuantity(){throw new NotConnectedError('AI');}}
