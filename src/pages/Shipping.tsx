import {useResource} from '../context';
import {PageHead,Loading,ErrorBox} from '../components/UI';
import type {Lot} from '../types';
import ShippingEstimator from '../features/ShippingEstimator';
function ItemShipping({id}:{id:string}){const {data,error,loading,reload}=useResource<Lot>('/lots/'+id);if(loading)return <Loading/>;if(error||!data)return <ErrorBox message={error} retry={reload}/>;return <ShippingEstimator key={data.id} lot={data}/>;}
export default function Shipping({id}:{id?:string}){return <><PageHead title="배송비 예상 계산" description="크기·수량·이동거리로 운송 조건을 비교하고, 계산 근거를 남깁니다." back={id?'/lots/'+id:'/work'}/>{id?<ItemShipping id={id}/>:<ShippingEstimator/>}</>;}
