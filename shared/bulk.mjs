/** A user action, never an AI/official quantity confirmation. */
export function allocateConditionGroups(total,{used=0,repair=0,unknown=0},inspection='NONE'){
 if(!Number.isInteger(total)||total<1||total>100000)throw new Error('총수량은 1~100,000개입니다.');
 if(!['NONE','SAMPLE','ALL'].includes(inspection))throw new Error('검수 범위를 확인하세요.');
 if([used,repair,unknown].some(n=>!Number.isInteger(n)||n<0))throw new Error('상태별 수량은 0 이상 정수입니다.');
 const good=total-used-repair-unknown;if(good<0)throw new Error('예외 수량이 총수량을 초과했습니다.');
 return [['GOOD',good],['USED',used],['REPAIR',repair],['UNKNOWN',unknown]].filter(([,n])=>n>0).map(([condition,quantity])=>({condition,quantity,inspection:condition==='UNKNOWN'?'NONE':inspection,note:''}));
}
