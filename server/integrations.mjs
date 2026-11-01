/** Official-system extension points. Product-assist adapters live in providers.mjs.
 * MANUAL remains the official administrative workflow even when product enrichment is configured. */
import {providerStatus,searchCatalog,identifyProduct} from './providers.mjs';
const configured=providerStatus();
export const capabilities = Object.freeze({mode:'MANUAL',edufine:{readAssets:false,verifyDecision:false,submitTransfer:false,verifyLedger:false},procurement:{search:configured.procurement.configured,images:configured.procurement.referenceImages},onbid:{read:false,write:false},ai:{identify:configured.ai.configured,count:false,guide:false}});
export class NotConnectedError extends Error {constructor(service){super(`${service}는 연결되지 않았습니다. 공식 명세와 권한을 확보한 뒤 구현해야 합니다.`);this.code='NOT_CONNECTED';}}
export class EdufineAdapter {async getAssetSnapshot(){throw new NotConnectedError('K-에듀파인');}async verifyDisposal(){throw new NotConnectedError('K-에듀파인');}async verifyLedgers(){throw new NotConnectedError('K-에듀파인');}}
export class ProcurementAdapter {async search(query){return searchCatalog(query);}async fetchReferenceImages(){throw new NotConnectedError('조달청 사진');}}
export class OnbidAdapter {async getResult(){throw new NotConnectedError('온비드');}}
export class AiAdapter {async suggestProduct(input){return identifyProduct(input||{});}async estimateQuantity(){throw new NotConnectedError('AI');}}
