import {z} from 'zod';
import {must} from './db.mjs';
export const coordinateSchema=z.object({lat:z.number().finite().min(-85).max(85),lng:z.number().finite().min(-180).max(180)});
export const DEFAULT_RATE_CARD=Object.freeze({version:'sample-2026-11-v1',label:'시연용 가정 단가 (업체 견적 아님)',sample:true,includedKm:10,handlingPerItem:1500,helperHour:20000,stairsPerFloorItem:1000,vatRate:0.1,vehicles:[
 {id:'SMALL',name:'소형 화물 예시',lengthCm:280,widthCm:160,heightCm:160,payloadKg:1000,base:60000,perKm:1000},
 {id:'MEDIUM',name:'중형 화물 예시',lengthCm:460,widthCm:200,heightCm:200,payloadKg:2500,base:110000,perKm:1500},
 {id:'LARGE',name:'대형 화물 예시',lengthCm:620,widthCm:230,heightCm:230,payloadKg:5000,base:170000,perKm:2000}
]});
const number=(max=2000)=>z.number().finite().positive().max(max);
export const cargoSchema=z.object({lengthCm:number(),widthCm:number(),heightCm:number(),unitWeightKg:number(10000),quantity:z.number().int().min(1).max(100000),stackCount:z.number().int().min(1).max(30).default(1),stackIncrementCm:z.number().finite().min(0).max(2000).default(0),stackingConfirmed:z.boolean().default(false),measurementsConfirmed:z.boolean().default(false)}).superRefine((v,c)=>{if(v.stackCount>1&&(!v.stackingConfirmed||v.stackIncrementCm<=0||v.stackIncrementCm>v.heightCm))c.addIssue({code:'custom',message:'겹침 수량·추가 높이를 실측하고 확인하세요.'});});
export const shipmentSchema=z.object({lotId:z.string().uuid().optional(),originLabel:z.string().trim().min(2).max(200),destinationLabel:z.string().trim().min(2).max(200),cargo:cargoSchema,distanceMode:z.enum(['MANUAL','COORDINATE','ROAD']),distanceKm:z.number().finite().positive().max(2000).optional(),origin:coordinateSchema.optional(),destination:coordinateSchema.optional(),routeId:z.string().uuid().optional(),handling:z.boolean().default(false),helperHours:z.number().finite().min(0).max(48).default(0),stairsFloors:z.number().int().min(0).max(50).default(0),tolls:z.number().finite().min(0).max(1000000).default(0),includeVat:z.boolean().default(true),persist:z.boolean().default(false)});
const price=z.number().finite().min(0).max(10000000);
export const rateCardSchema=z.object({version:z.string().min(1).max(100),label:z.string().min(1).max(200),sample:z.boolean(),includedKm:z.number().min(0).max(2000),handlingPerItem:price,helperHour:price,stairsPerFloorItem:price,vatRate:z.number().min(0).max(1),vehicles:z.array(z.object({id:z.string().min(1),name:z.string().min(1),lengthCm:number(),widthCm:number(),heightCm:number(),payloadKg:number(100000),base:price,perKm:price})).min(1).max(10)});
export function distanceBetween(a,b){a=coordinateSchema.parse(a);b=coordinateSchema.parse(b);const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));}
export function estimateShipment(input,route=null,rateCard=DEFAULT_RATE_CARD){
 const d=shipmentSchema.parse(input),rate=rateCardSchema.parse(rateCard),c=d.cargo;let km,source;
 if(d.distanceMode==='ROAD'){must(route&&route.source==='KAKAO_ROAD','서버가 확인한 도로 경로를 먼저 가져오세요.');km=route.km;source='도로 경로 API (화물차 제한 별도 확인)';}
 else if(d.distanceMode==='COORDINATE'){must(d.origin&&d.destination,'출발·도착 좌표를 입력하세요.');const straight=distanceBetween(d.origin,d.destination);must(straight>0.05,'같거나 매우 가까운 위치입니다. 실제 운반거리를 직접 확인하세요.');km=straight*1.3;source='직선거리 × 1.3 가정 (실제 도로거리 아님)';}
 else {must(d.distanceKm,'확인한 운행거리(km)를 입력하세요.');km=d.distanceKm;source='담당자 입력 거리';}
 must(Number.isFinite(km)&&km>0&&km<=2000,'운행거리 범위를 확인하세요.');
 const stack=Math.min(c.stackCount,c.quantity),packHeight=c.heightCm+(stack-1)*c.stackIncrementCm;
 const totalWeight=c.unitWeightKg*c.quantity,packCount=Math.ceil(c.quantity/stack),volume=c.lengthCm*c.widthCm*packHeight*packCount/1000000;
 const round=v=>Math.ceil(v/1000)*1000;
 const options=rate.vehicles.flatMap(v=>{
  const horizontal=Math.max(Math.floor(v.lengthCm/c.lengthCm)*Math.floor(v.widthCm/c.widthCm),Math.floor(v.lengthCm/c.widthCm)*Math.floor(v.widthCm/c.lengthCm));
  // Do not assume one stack can be placed on another: upright cargo, one floor, no hidden packing optimization.
  const byGeometry=packHeight<=v.heightCm?horizontal*stack:0;
  const capacity=Math.min(byGeometry,Math.floor(v.payloadKg/c.unitWeightKg));if(capacity<1)return [];
  const trips=Math.ceil(c.quantity/capacity),transport=trips*(v.base+Math.max(0,km-rate.includedKm)*v.perKm);
  const handling=d.handling?c.quantity*rate.handlingPerItem:0,helpers=d.helperHours*rate.helperHour,stairs=d.stairsFloors*c.quantity*rate.stairsPerFloorItem;
  const subtotal=transport+handling+helpers+stairs+d.tolls,vat=d.includeVat?subtotal*rate.vatRate:0,total=round(subtotal+vat);
  return [{vehicle:v.name,vehicleId:v.id,trips,capacity,estimated:total,low:round(total*.8),high:round(total*1.3),breakdown:{transport:Math.round(transport),handling,helpers,stairs,tolls:d.tolls,vat:Math.round(vat)},vehicleAssumption:v}];
 }).sort((a,b)=>a.estimated-b.estimated);
 return {status:options.length?'ESTIMATED':'MANUAL_QUOTE_REQUIRED',binding:false,currency:'KRW',rateCard:rate,distanceKm:Math.round(km*10)/10,distanceSource:source,totalWeightKg:Math.round(totalWeight*10)/10,packedVolumeM3:Math.round(volume*1000)/1000,options,recommended:options[0]||null,assumptions:[rate.sample?'예시 단가로 계산한 시뮬레이션입니다. 실제 운송업체 견적이 아닙니다.':'등록 단가 기준 예상액이며 업체 확정 견적이 아닙니다.',c.measurementsConfirmed?'담당자가 포장 크기·무게를 확인했습니다.':'포장 크기·무게 미확인: 현장 확인 후 다시 계산하세요.','바닥 평면 적재·회차별 편도 비용 가정입니다. 실제 배차·복귀비용은 업체 확인이 필요합니다.','철거·설치·장비·보험·주차·도선·대기요금은 별도입니다. 입력 통행료는 전체 운송 합계입니다.',d.distanceMode==='COORDINATE'?'강·산·교량·도서지역에서 거리 오차가 클 수 있습니다.':'경로·통행 제한을 현장에서 확인하세요.',options.length?'±범위는 예시 오차폭이며 보장 가격이 아닙니다.':'등록 차량 규격에 적재할 수 없습니다. 전문 운송 견적을 요청하세요.'],createdAt:new Date().toISOString()};
}
